import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { IncomingMessage, Server as HTTPServer } from 'http';
import { parse } from 'url';
import { verifySupabaseToken } from '../config/supabase';
import { WSMessage, WSClient, WSMessageType } from '../types';
import { CanvasService } from '../services/CanvasService';
import { PresenceService } from '../services/PresenceService';
import { UserService } from '../services/UserService';
import { v4 as uuidv4 } from 'uuid';
import { securityLogger, SecurityEventType } from '../utils/securityLogger';
import { isValidCanvasId, getClientIP } from '../utils/security';

export class WebSocketServer {
    private wss: WSServer;
    private clients: Map<string, WSClient> = new Map();
    private canvasSubscriptions: Map<string, Set<string>> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private autoUnlockInterval: NodeJS.Timeout | null = null;
    private messageQueue: Map<string, any[]> = new Map(); // Queue messages during heavy load
    private reconnectingClients: Set<string> = new Set(); // Track reconnecting clients

    // Performance optimization: message batching
    private messageBatchQueues: Map<string, WSMessage[]> = new Map();
    private batchFlushInterval: NodeJS.Timeout | null = null;
    private readonly BATCH_INTERVAL_MS = 16; // ~60fps batching

    // Performance optimization: throttling maps per client
    private cursorUpdateThrottles: Map<string, number> = new Map();
    private shapeUpdateThrottles: Map<string, number> = new Map();
    private readonly CURSOR_THROTTLE_MS = 25; // 40fps for cursors
    private readonly SHAPE_THROTTLE_MS = 33; // 30fps for shape updates

    // Track last cursor activity per user for lock extension
    private lastCursorActivity: Map<string, number> = new Map(); // userId -> timestamp

    constructor(server: HTTPServer) {
        this.wss = new WSServer({
            server,
            path: '/ws',
            verifyClient: (info, callback) => {
                // Allow all connections (we'll verify auth during the connection handler)
                callback(true);
            }
        });
        this.initialize();
    }

    private initialize(): void {
        this.wss.on('connection', this.handleConnection.bind(this));
        this.startHeartbeat();
        this.startAutoUnlock();
        this.startBatchFlushing();
    }

    /**
     * Start periodic batch flushing for optimized message delivery
     */
    private startBatchFlushing(): void {
        this.batchFlushInterval = setInterval(() => {
            this.flushAllBatches();
        }, this.BATCH_INTERVAL_MS);
    }

    /**
     * Flush all pending message batches
     */
    private flushAllBatches(): void {
        this.messageBatchQueues.forEach((batch, connectionId) => {
            if (batch.length === 0) return;

            const client = this.clients.get(connectionId);
            if (!client || client.socket.readyState !== WebSocket.OPEN) {
                this.messageBatchQueues.delete(connectionId);
                return;
            }

            // Send all batched messages at once
            batch.forEach(message => {
                client.socket.send(JSON.stringify(message));
            });

            // Clear the batch
            this.messageBatchQueues.set(connectionId, []);
        });
    }

    /**
     * Queue a message for batched delivery
     */
    private queueBatchedMessage(connectionId: string, message: WSMessage): void {
        if (!this.messageBatchQueues.has(connectionId)) {
            this.messageBatchQueues.set(connectionId, []);
        }
        this.messageBatchQueues.get(connectionId)!.push(message);
    }

    /**
     * Broadcast with message batching for improved performance
     */
    private broadcastToCanvasBatched(
        canvasId: string,
        message: WSMessage,
        excludeConnectionId?: string,
        priority: 'high' | 'low' = 'low'
    ): void {
        const subscribers = this.canvasSubscriptions.get(canvasId);
        if (!subscribers) return;

        subscribers.forEach(connectionId => {
            if (connectionId !== excludeConnectionId) {
                const client = this.clients.get(connectionId);
                if (client && client.socket.readyState === WebSocket.OPEN) {
                    // High priority messages (shape create/delete) send immediately
                    // Low priority (cursor, minor updates) batch for efficiency
                    if (priority === 'high') {
                        client.socket.send(JSON.stringify(message));
                    } else {
                        this.queueBatchedMessage(connectionId, message);
                    }
                }
            }
        });
    }

    private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        const connectionId = uuidv4();
        const clientIP = getClientIP(req as any);

        try {
            // Parse query parameters
            const { query } = parse(req.url || '', true);
            let token = query.token as string;
            const canvasId = query.canvasId as string;

            // Try to extract token from Sec-WebSocket-Protocol header (more secure)
            // Format: "Bearer.{token}" where periods replace spaces for protocol compatibility
            const protocols = req.headers['sec-websocket-protocol'];
            if (protocols && !token) {
                const protocolList = protocols.split(',').map(p => p.trim());
                const bearerProtocol = protocolList.find(p => p.startsWith('Bearer.'));
                if (bearerProtocol) {
                    token = bearerProtocol.substring(7); // Remove "Bearer."
                }
            }

            // Validate canvasId
            if (!canvasId) {
                securityLogger.logWSConnection(
                    SecurityEventType.WS_CONNECTION_FAILURE,
                    'Missing canvasId',
                    undefined,
                    clientIP
                );
                this.sendError(ws, 'Missing canvasId');
                ws.close(1008, 'Missing canvasId parameter');
                return;
            }

            if (!isValidCanvasId(canvasId)) {
                securityLogger.logWSConnection(
                    SecurityEventType.WS_CONNECTION_FAILURE,
                    'Invalid canvasId format',
                    undefined,
                    clientIP,
                    { canvasId }
                );
                this.sendError(ws, 'Invalid canvasId format');
                ws.close(1008, 'Invalid canvasId');
                return;
            }

            // Verify token is present
            if (!token) {
                securityLogger.logWSConnection(
                    SecurityEventType.WS_CONNECTION_FAILURE,
                    'Missing authentication token',
                    undefined,
                    clientIP,
                    { canvasId }
                );
                this.sendError(ws, 'Missing authentication token');
                ws.close(1008, 'Authentication required');
                return;
            }

            // Verify Supabase token
            let decodedToken: any;
            let authenticatedUserId: string;

            try {
                decodedToken = await verifySupabaseToken(token);
                authenticatedUserId = decodedToken.userId;
            } catch (tokenError: any) {
                securityLogger.logWSConnection(
                    SecurityEventType.WS_CONNECTION_FAILURE,
                    'Token verification failed',
                    undefined,
                    clientIP,
                    { canvasId, error: tokenError.message }
                );
                this.sendError(ws, 'Invalid or expired token');
                ws.close(1008, 'Authentication failed');
                return;
            }

            // Check canvas access
            const hasAccess = await CanvasService.checkAccess(canvasId, authenticatedUserId);
            if (!hasAccess) {
                securityLogger.logWSConnection(
                    SecurityEventType.CANVAS_ACCESS_DENIED,
                    'Canvas access denied',
                    authenticatedUserId,
                    clientIP,
                    { canvasId }
                );
                this.sendError(ws, 'Access denied to canvas');
                ws.close(1008, 'Unauthorized');
                return;
            }

            // Get or create user info
            const supabaseData = {
                uid: authenticatedUserId,
                email: decodedToken.email || 'user@example.com',
                name: decodedToken.user_metadata?.name ||
                    decodedToken.user_metadata?.full_name ||
                    decodedToken.email?.split('@')[0] ||
                    'User',
                picture: decodedToken.user_metadata?.avatar_url ||
                    decodedToken.user_metadata?.picture,
            };
            const user = await UserService.getOrCreateFromSupabase(supabaseData);

            // Create client
            const client: WSClient = {
                id: connectionId,
                userId: authenticatedUserId,
                canvasId,
                socket: ws,
                isAlive: true,
                lastPing: Date.now(),
                user,
            };

            this.clients.set(connectionId, client);
            this.subscribeToCanvas(connectionId, canvasId);

            // Update user online status
            await UserService.updateOnlineStatus(authenticatedUserId, true);

            // Create initial presence record immediately
            const userColor = user.avatarColor || this.assignNeonColor(authenticatedUserId);

            // Update user's avatar color if not set
            if (!user.avatarColor) {
                await UserService.update(authenticatedUserId, { avatarColor: userColor });
                user.avatarColor = userColor;
            }

            await PresenceService.upsert({
                userId: authenticatedUserId,
                canvasId: canvasId,
                cursorX: 0,
                cursorY: 0,
                color: userColor,
                connectionId: connectionId,
            });

            // Send initial canvas state (now includes this user's presence)
            await this.sendCanvasSync(client);

            // Notify other users
            await this.broadcastUserJoin(client);

            // Broadcast full active users list to everyone on this canvas
            await this.broadcastActiveUsers(client.canvasId);

            // Set up message handler
            ws.on('message', (data: Buffer) => this.handleMessage(connectionId, data));
            ws.on('close', () => this.handleDisconnect(connectionId));
            ws.on('error', (error) => this.handleError(connectionId, error));
            ws.on('pong', () => this.handlePong(connectionId));

            // Log successful connection
            securityLogger.logWSConnection(
                SecurityEventType.WS_CONNECTION_SUCCESS,
                `User ${user.username} connected to canvas ${canvasId}`,
                authenticatedUserId,
                clientIP,
                { canvasId, username: user.username }
            );
        } catch (error: any) {
            securityLogger.logWSConnection(
                SecurityEventType.WS_CONNECTION_FAILURE,
                'Connection error',
                undefined,
                clientIP,
                { error: error.message }
            );
            this.sendError(ws, 'Connection failed');
            ws.close(1011, 'Internal server error');
        }
    }

    private async handleMessage(connectionId: string, data: Buffer): Promise<void> {
        const client = this.clients.get(connectionId);
        if (!client) return;

        try {
            const message: WSMessage = JSON.parse(data.toString());
            message.userId = client.userId;
            message.canvasId = client.canvasId;
            message.timestamp = Date.now();

            switch (message.type) {
                case 'PING':
                    this.sendToClient(connectionId, { type: 'PONG', timestamp: Date.now() });
                    break;

                case 'CURSOR_MOVE':
                    await this.handleCursorMove(client, message);
                    break;

                case 'SHAPE_CREATE':
                    await this.handleShapeCreate(client, message);
                    break;

                case 'SHAPE_UPDATE':
                    await this.handleShapeUpdate(client, message);
                    break;

                case 'SHAPE_DELETE':
                    await this.handleShapeDelete(client, message);
                    break;

                case 'SHAPES_BATCH_UPDATE':
                    await this.handleBatchUpdate(client, message);
                    break;

                case 'CANVAS_SYNC_REQUEST':
                    await this.sendCanvasSync(client);
                    break;

                case 'PRESENCE_UPDATE':
                    await this.handlePresenceUpdate(client, message);
                    break;

                case 'CANVAS_UPDATE':
                    await this.handleCanvasUpdate(client, message);
                    break;

                case 'RECONNECT_REQUEST':
                    // Handle reconnection with full state sync
                    await this.sendCanvasSync(client);
                    break;

                case 'SWITCH_CANVAS':
                    await this.handleCanvasSwitch(client, message);
                    break;

                default:
                    // Unknown message type
                    break;
            }
        } catch (error: any) {
            this.sendError(client.socket, error.message);
        }
    }

    private async handleCursorMove(client: WSClient, message: WSMessage): Promise<void> {
        const { x, y, viewportX, viewportY, viewportZoom } = message.payload || {};

        // Throttle cursor updates per client
        const now = Date.now();
        const lastUpdate = this.cursorUpdateThrottles.get(client.id) || 0;
        if (now - lastUpdate < this.CURSOR_THROTTLE_MS) {
            return; // Skip this update due to throttling
        }
        this.cursorUpdateThrottles.set(client.id, now);

        // Track cursor activity for this user (for lock extension)
        this.lastCursorActivity.set(client.userId, now);

        // Ensure user has a color assigned
        const userColor = client.user?.avatarColor || this.assignNeonColor(client.userId);

        // Broadcast with low priority (batched) for performance
        this.broadcastToCanvasBatched(client.canvasId, {
            type: 'CURSOR_MOVE',
            payload: {
                userId: client.userId,
                username: client.user?.username,
                displayName: client.user?.displayName,
                email: client.user?.email,
                color: userColor,
                x,
                y,
            },
            timestamp: Date.now(),
        }, client.id, 'low');

        // Update presence in database asynchronously (non-blocking)
        // Don't await - let it happen in background to keep sub-50ms
        PresenceService.upsert({
            userId: client.userId,
            canvasId: client.canvasId,
            cursorX: x,
            cursorY: y,
            viewportX,
            viewportY,
            viewportZoom,
            color: userColor,
            connectionId: client.id,
        }).catch(err => {
            // Presence update error handled silently
        });
    }

    private async handleShapeCreate(client: WSClient, message: WSMessage): Promise<void> {
        try {
            const shape = await CanvasService.createShape(
                client.canvasId,
                client.userId,
                message.payload
            );

            // Broadcast to all users including sender with high priority (immediate)
            this.broadcastToCanvasBatched(client.canvasId, {
                type: 'SHAPE_CREATE',
                payload: { shape },
                userId: client.userId,
                timestamp: Date.now(),
            }, undefined, 'high');
        } catch (error) {
            this.sendError(client.socket, 'Failed to create shape');
        }
    }

    private async handleShapeUpdate(client: WSClient, message: WSMessage): Promise<void> {
        const { shapeId, updates } = message.payload;

        // Enforce exclusive locking: fetch current shape and prevent updates when locked by another user (and not expired)
        const currentShape = await CanvasService.getShapeById(shapeId);
        if (currentShape) {
            const lockedBy = (currentShape as any).locked_by as string | null;
            const lockedAt = (currentShape as any).locked_at as Date | null;

            const isLockedByOther = !!lockedBy && lockedBy !== client.userId;
            const isExpired = CanvasService.isLockExpired(lockedAt as any);

            if (isLockedByOther && !isExpired) {
                // Only owner can unlock; deny lock attempts and other updates from others while lock is active
                if (updates.isLocked !== undefined || Object.keys(updates).length > 0) {
                    this.sendToClient(client.id, {
                        type: 'ERROR',
                        payload: { message: 'Shape is locked by another user' },
                    } as any);
                    // Send back the authoritative shape state to the requester
                    this.sendToClient(client.id, {
                        type: 'SHAPE_UPDATE',
                        payload: { shape: currentShape },
                        userId: client.userId,
                    } as any);
                    return;
                }
            }
        }

        // If isLocked is being set to true/false, convert it to locked_at and locked_by
        const updatedData: any = { ...updates };
        if (updates.isLocked === true) {
            updatedData.lockedAt = new Date();
            updatedData.lockedBy = client.userId;
            delete updatedData.isLocked;
        } else if (updates.isLocked === false) {
            // Only allow unlock by the lock owner; if not owner, ignore
            if (currentShape) {
                const lockedBy = (currentShape as any).locked_by as string | null;
                const lockedAt = (currentShape as any).locked_at as Date | null;
                const isExpired = CanvasService.isLockExpired(lockedAt as any);
                if (lockedBy && lockedBy !== client.userId && !isExpired) {
                    this.sendToClient(client.id, {
                        type: 'ERROR',
                        payload: { message: 'Only the lock owner can unlock this shape' },
                    } as any);
                    this.sendToClient(client.id, {
                        type: 'SHAPE_UPDATE',
                        payload: { shape: currentShape },
                        userId: client.userId,
                    } as any);
                    return;
                }
            }
            updatedData.lockedAt = null;
            updatedData.lockedBy = null;
            delete updatedData.isLocked;
        }

        try {
            const shape = await CanvasService.updateShape(
                shapeId,
                client.userId,
                updatedData
            );

            // Throttle shape update broadcasts per shape (not per client)
            const throttleKey = `${client.canvasId}:${shapeId}`;
            const now = Date.now();
            const lastUpdate = this.shapeUpdateThrottles.get(throttleKey) || 0;

            // Always send lock/unlock immediately, throttle other updates
            const isLockUpdate = updatedData.lockedAt !== undefined || updatedData.lockedBy !== undefined;
            const shouldBroadcast = isLockUpdate || (now - lastUpdate >= this.SHAPE_THROTTLE_MS);

            if (shouldBroadcast) {
                this.shapeUpdateThrottles.set(throttleKey, now);

                // Broadcast with low priority (batched) for better performance
                this.broadcastToCanvasBatched(client.canvasId, {
                    type: 'SHAPE_UPDATE',
                    payload: {
                        shape,
                        lastModifiedBy: client.userId,
                        lastModifiedAt: Date.now(),
                    },
                    userId: client.userId,
                    timestamp: Date.now(),
                }, undefined, isLockUpdate ? 'high' : 'low');
            }
        } catch (error) {
            this.sendError(client.socket, 'Failed to update shape');
        }
    }

    private async handleShapeDelete(client: WSClient, message: WSMessage): Promise<void> {
        const { shapeId, shapeIds } = message.payload;

        // Support both single shapeId (legacy) and shapeIds array
        const idsToDelete = shapeIds || (shapeId ? [shapeId] : []);

        if (!idsToDelete || idsToDelete.length === 0) {
            this.sendError(client.socket, 'Shape ID(s) required');
            return;
        }

        try {
            await CanvasService.deleteShapes(idsToDelete);

            // Broadcast to all users including sender with high priority (immediate)
            this.broadcastToCanvasBatched(client.canvasId, {
                type: 'SHAPE_DELETE',
                payload: { shapeIds: idsToDelete },
                userId: client.userId,
                timestamp: Date.now(),
            }, undefined, 'high');
        } catch (error) {
            this.sendError(client.socket, 'Failed to delete shape(s)');
        }
    }

    private async handleBatchUpdate(client: WSClient, message: WSMessage): Promise<void> {
        const { updates } = message.payload;

        try {
            const shapes = await CanvasService.batchUpdateShapes(updates, client.userId);

            // Broadcast to all users including sender (sub-100ms target)
            this.broadcastToCanvas(client.canvasId, {
                type: 'SHAPES_BATCH_UPDATE',
                payload: { shapes },
                userId: client.userId,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.sendError(client.socket, 'Failed to batch update shapes');
        }
    }

    private async handlePresenceUpdate(client: WSClient, message: WSMessage): Promise<void> {
        const { selectedObjectIds, isActive } = message.payload;

        // Ensure user has a color assigned
        const userColor = client.user?.avatarColor || this.assignNeonColor(client.userId);

        await PresenceService.upsert({
            userId: client.userId,
            canvasId: client.canvasId,
            cursorX: 0,
            cursorY: 0,
            selectedObjectIds,
            color: userColor,
            connectionId: client.id,
        });

        // Broadcast presence update
        this.broadcastToCanvas(client.canvasId, {
            type: 'PRESENCE_UPDATE',
            payload: {
                userId: client.userId,
                username: client.user?.username,
                email: client.user?.email,
                selectedObjectIds,
                isActive,
            },
        }, client.id);
    }

    private async broadcastActiveUsers(canvasId: string): Promise<void> {
        try {
            const activeUsers = await PresenceService.getActiveUsers(canvasId);
            const payload = activeUsers.map(p => {
                const userData = (p as any).users;
                return {
                    userId: (p as any).user_id || (p as any).userId,
                    username: userData?.username || 'Unknown',
                    displayName: userData?.display_name || userData?.username || 'Unknown',
                    email: userData?.email || 'unknown@example.com',
                    color: (p as any).color || this.assignNeonColor((p as any).user_id || (p as any).userId),
                };
            });

            this.broadcastToCanvas(canvasId, {
                type: 'ACTIVE_USERS',
                payload: { activeUsers: payload },
            });
        } catch (error) {
            // Error broadcasting active users handled silently
        }
    }

    private async handleCanvasUpdate(client: WSClient, message: WSMessage): Promise<void> {
        const { updates } = message.payload || {};

        const allowedUpdates: any = {};
        if (updates && typeof updates === 'object') {
            if (updates.backgroundColor !== undefined) {
                allowedUpdates.background_color = updates.backgroundColor;
            }
        }

        if (Object.keys(allowedUpdates).length === 0) {
            return;
        }

        const canvas = await CanvasService.update(client.canvasId, allowedUpdates);

        // Broadcast the updated canvas to all users (including sender)
        this.broadcastToCanvas(client.canvasId, {
            type: 'CANVAS_UPDATE',
            payload: { canvas },
            userId: client.userId,
        });
    }

    private async handleCanvasSwitch(client: WSClient, message: WSMessage): Promise<void> {
        const { canvasId: newCanvasId } = message.payload;

        if (!newCanvasId || !isValidCanvasId(newCanvasId)) {
            this.sendError(client.socket, 'Invalid canvasId');
            return;
        }

        // Check if user has access to the new canvas
        const hasAccess = await CanvasService.checkAccess(newCanvasId, client.userId);
        if (!hasAccess) {
            this.sendError(client.socket, 'Access denied to canvas');
            this.sendToClient(client.id, {
                type: 'CANVAS_SWITCHED',
                payload: { canvasId: newCanvasId, success: false, error: 'Access denied' },
            });
            return;
        }

        const oldCanvasId = client.canvasId;

        try {
            // 1. Remove presence from old canvas
            await PresenceService.removeByConnectionId(client.id);

            // 2. Notify old canvas users that user is leaving
            this.broadcastToCanvas(oldCanvasId, {
                type: 'USER_LEAVE',
                payload: {
                    userId: client.userId,
                    username: client.user?.username,
                },
            }, client.id);

            // 3. Unsubscribe from old canvas
            this.unsubscribeFromCanvas(client.id, oldCanvasId);

            // 4. Update client's canvasId
            client.canvasId = newCanvasId;

            // 5. Subscribe to new canvas
            this.subscribeToCanvas(client.id, newCanvasId);

            // 6. Ensure user has a color assigned
            const userColor = client.user?.avatarColor || this.assignNeonColor(client.userId);

            // 7. Create presence record for new canvas
            await PresenceService.upsert({
                userId: client.userId,
                canvasId: newCanvasId,
                cursorX: 0,
                cursorY: 0,
                color: userColor,
                connectionId: client.id,
            });

            // 8. Update last accessed timestamp for new canvas
            await CanvasService.updateLastAccessed(newCanvasId);

            // 9. Send canvas sync for new canvas
            await this.sendCanvasSync(client);

            // 10. Notify new canvas users that user joined
            this.broadcastToCanvas(newCanvasId, {
                type: 'USER_JOIN',
                payload: {
                    userId: client.userId,
                    username: client.user?.username,
                    displayName: client.user?.displayName,
                    email: client.user?.email,
                    color: userColor,
                },
            }, client.id);

            // 11. Broadcast updated active users lists
            await this.broadcastActiveUsers(oldCanvasId);
            await this.broadcastActiveUsers(newCanvasId);

            // 12. Send success confirmation to client
            this.sendToClient(client.id, {
                type: 'CANVAS_SWITCHED',
                payload: { canvasId: newCanvasId, success: true },
            });
        } catch (error: any) {
            this.sendError(client.socket, 'Failed to switch canvas');
            this.sendToClient(client.id, {
                type: 'CANVAS_SWITCHED',
                payload: { canvasId: newCanvasId, success: false, error: error.message },
            });
        }
    }

    private async sendCanvasSync(client: WSClient): Promise<void> {
        try {
            // Get canvas data
            const canvas = await CanvasService.findById(client.canvasId);
            const shapes = await CanvasService.getShapes(client.canvasId);
            const activeUsers = await PresenceService.getActiveUsers(client.canvasId);

            this.sendToClient(client.id, {
                type: 'CANVAS_SYNC',
                payload: {
                    canvas,
                    shapes,
                    activeUsers: activeUsers.map(p => {
                        // Supabase join returns nested user data
                        const userData = (p as any).users;
                        return {
                            userId: p.userId,
                            username: userData?.username || 'Unknown',
                            displayName: userData?.display_name || userData?.username || 'Unknown',
                            email: userData?.email || 'unknown@example.com',
                            color: p.color || this.assignNeonColor(p.userId),
                            cursorX: p.cursorX,
                            cursorY: p.cursorY,
                            isActive: p.isActive,
                        };
                    }),
                },
            });
        } catch (error: any) {
            this.sendError(client.socket, 'Failed to sync canvas state');
        }
    }

    private async broadcastUserJoin(client: WSClient): Promise<void> {
        // Ensure user has a color assigned
        const userColor = client.user?.avatarColor || this.assignNeonColor(client.userId);

        this.broadcastToCanvas(client.canvasId, {
            type: 'USER_JOIN',
            payload: {
                userId: client.userId,
                username: client.user?.username,
                displayName: client.user?.displayName,
                email: client.user?.email,
                color: userColor,
            },
        }, client.id);
    }

    private async handleDisconnect(connectionId: string): Promise<void> {
        const client = this.clients.get(connectionId);
        if (!client) return;

        // Clean up performance tracking for this client
        this.cursorUpdateThrottles.delete(connectionId);
        this.messageBatchQueues.delete(connectionId);

        // Remove presence
        await PresenceService.removeByConnectionId(connectionId);

        // Update user online status (check if user has other connections)
        const hasOtherConnections = Array.from(this.clients.values()).some(
            c => c.userId === client.userId && c.id !== connectionId
        );
        if (!hasOtherConnections) {
            await UserService.updateOnlineStatus(client.userId, false);

            // Clean up cursor activity tracking for this user
            this.lastCursorActivity.delete(client.userId);

            // Unlock all shapes locked by this user
            const unlockedShapes = await CanvasService.unlockShapesByUser(client.userId, client.canvasId);

            // Broadcast unlock notifications for each shape
            for (const shape of unlockedShapes) {
                this.broadcastToCanvas(client.canvasId, {
                    type: 'SHAPE_UPDATE',
                    payload: {
                        shape: {
                            ...shape,
                            locked_at: null,
                            locked_by: null,
                        }
                    },
                });
            }
        }

        // Notify other users
        this.broadcastToCanvas(client.canvasId, {
            type: 'USER_LEAVE',
            payload: {
                userId: client.userId,
                username: client.user?.username,
            },
        });

        // Broadcast updated active users list
        await this.broadcastActiveUsers(client.canvasId);

        // Cleanup
        this.unsubscribeFromCanvas(connectionId, client.canvasId);
        this.clients.delete(connectionId);
    }

    private handleError(connectionId: string, error: Error): void {
        // WebSocket error handled silently
    }

    private handlePong(connectionId: string): void {
        const client = this.clients.get(connectionId);
        if (client) {
            client.isAlive = true;
            client.lastPing = Date.now();
        }
    }

    private subscribeToCanvas(connectionId: string, canvasId: string): void {
        if (!this.canvasSubscriptions.has(canvasId)) {
            this.canvasSubscriptions.set(canvasId, new Set());
        }
        this.canvasSubscriptions.get(canvasId)!.add(connectionId);
    }

    private unsubscribeFromCanvas(connectionId: string, canvasId: string): void {
        const subscribers = this.canvasSubscriptions.get(canvasId);
        if (subscribers) {
            subscribers.delete(connectionId);
            if (subscribers.size === 0) {
                this.canvasSubscriptions.delete(canvasId);
            }
        }
    }

    private broadcastToCanvas(
        canvasId: string,
        message: WSMessage,
        excludeConnectionId?: string
    ): void {
        const subscribers = this.canvasSubscriptions.get(canvasId);
        if (!subscribers) return;

        const messageStr = JSON.stringify(message);

        subscribers.forEach(connectionId => {
            if (connectionId !== excludeConnectionId) {
                const client = this.clients.get(connectionId);
                if (client && client.socket.readyState === WebSocket.OPEN) {
                    client.socket.send(messageStr);
                }
            }
        });
    }

    private sendToClient(connectionId: string, message: WSMessage): void {
        const client = this.clients.get(connectionId);
        if (client && client.socket.readyState === WebSocket.OPEN) {
            client.socket.send(JSON.stringify(message));
        }
    }

    private sendError(ws: WebSocket, message: string): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message },
                timestamp: Date.now(),
            }));
        }
    }

    private startHeartbeat(): void {
        const interval = parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000');

        this.heartbeatInterval = setInterval(async () => {
            this.clients.forEach((client, connectionId) => {
                if (!client.isAlive) {
                    client.socket.terminate();
                    this.handleDisconnect(connectionId);
                    return;
                }

                client.isAlive = false;
                client.socket.ping();
            });

            // Cleanup stale presence records and broadcast updates if anything changed
            try {
                const removed = await PresenceService.cleanupStale();
                if (removed && removed > 0) {
                    const activeCanvases = new Set<string>();
                    this.clients.forEach(c => activeCanvases.add(c.canvasId));
                    for (const canvasId of activeCanvases) {
                        await this.broadcastActiveUsers(canvasId);
                    }
                }
            } catch (e) {
                // Error during heartbeat handled silently
            }
        }, interval);
    }

    private startAutoUnlock(): void {
        // Check for expired locks every 1 second for faster unlock response
        this.autoUnlockInterval = setInterval(async () => {
            // Get all active canvases
            const activeCanvases = new Set<string>();
            this.clients.forEach(client => {
                activeCanvases.add(client.canvasId);
            });

            const now = Date.now();

            // Check and unlock expired shapes for each canvas
            for (const canvasId of activeCanvases) {
                try {
                    const expiredShapes = await CanvasService.getExpiredLocks(canvasId);

                    if (expiredShapes.length > 0) {
                        // Filter shapes to only unlock those where the user has been inactive
                        // (no cursor movement) for at least 5 seconds
                        const shapesToUnlock = expiredShapes.filter((shape: any) => {
                            const lockedBy = shape.lockedBy || shape.locked_by;
                            if (!lockedBy) return true; // No lock owner, should unlock

                            const lastActivity = this.lastCursorActivity.get(lockedBy);
                            if (!lastActivity) return true; // No cursor activity recorded, should unlock

                            const timeSinceActivity = now - lastActivity;
                            // Only unlock if user has been inactive for >= 5 seconds
                            return timeSinceActivity >= 5000;
                        });

                        // Auto-unlock the filtered shapes
                        if (shapesToUnlock.length > 0) {
                            for (const shape of shapesToUnlock) {
                                // Use the shape's locked_by user as the userId for the update
                                const userId = (shape as any).lockedBy || (shape as any).locked_by || 'system';
                                await CanvasService.updateShape(shape.id as string, userId, {
                                    lockedAt: null,
                                    lockedBy: null,
                                });

                                // Broadcast unlock notification
                                this.broadcastToCanvas(canvasId, {
                                    type: 'SHAPE_UPDATE',
                                    payload: {
                                        shape: {
                                            ...shape,
                                            locked_at: null,
                                            locked_by: null,
                                        }
                                    },
                                });
                            }
                        }
                    }
                } catch (error) {
                    // Error checking expired locks handled silently
                }
            }
        }, 1000); // Check every 1 second for faster response
    }

    public close(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        if (this.autoUnlockInterval) {
            clearInterval(this.autoUnlockInterval);
        }

        if (this.batchFlushInterval) {
            clearInterval(this.batchFlushInterval);
        }

        // Flush any remaining batches before closing
        this.flushAllBatches();

        this.clients.forEach((client) => {
            client.socket.close(1000, 'Server shutting down');
        });

        this.wss.close(() => {
            // Server closed
        });
    }

    public getStats(): {
        totalConnections: number;
        activeCanvases: number;
        connectionsByCanvas: Record<string, number>;
    } {
        const connectionsByCanvas: Record<string, number> = {};

        this.canvasSubscriptions.forEach((subscribers, canvasId) => {
            connectionsByCanvas[canvasId] = subscribers.size;
        });

        return {
            totalConnections: this.clients.size,
            activeCanvases: this.canvasSubscriptions.size,
            connectionsByCanvas,
        };
    }

    /**
     * Assign a neon color to a user based on their userId
     */
    private assignNeonColor(userId: string): string {
        const NEON_COLORS = [
            '#24ccff', '#fbff00', '#ff69b4', '#00ffff',
            '#ff00ff', '#ff0080', '#80ff00', '#ff8000',
            '#0080ff', '#ff0040', '#00ff80', '#8000ff'
        ];
        const colorIndex = parseInt(userId.slice(0, 8), 16) % NEON_COLORS.length;
        return NEON_COLORS[colorIndex];
    }
}


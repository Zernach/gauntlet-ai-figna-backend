import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { IncomingMessage, Server as HTTPServer } from 'http';
import { parse } from 'url';
import { verifySupabaseToken } from '../config/supabase';
import { WSMessage, WSClient, WSMessageType } from '../types';
import { CanvasService } from '../services/CanvasService';
import { PresenceService } from '../services/PresenceService';
import { UserService } from '../services/UserService';
import { v4 as uuidv4 } from 'uuid';

export class WebSocketServer {
    private wss: WSServer;
    private clients: Map<string, WSClient> = new Map();
    private canvasSubscriptions: Map<string, Set<string>> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;

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
        console.log(`🔌 WebSocket server initialized on path /ws`);

        this.wss.on('connection', this.handleConnection.bind(this));
        this.startHeartbeat();
    }

    private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        const connectionId = uuidv4();
        console.log(`🔗 New WebSocket connection: ${connectionId}`);

        try {
            // Parse query parameters
            const { query } = parse(req.url || '', true);
            const token = query.token as string;
            const userId = query.userId as string;
            const canvasId = query.canvasId as string;

            if (!canvasId) {
                this.sendError(ws, 'Missing canvasId');
                ws.close(1008, 'Missing canvasId parameter');
                return;
            }

            // Determine userId from token or direct userId parameter
            let authenticatedUserId: string;
            let decodedToken: any = null;

            if (token) {
                // Production mode: verify Supabase token
                decodedToken = await verifySupabaseToken(token);
                authenticatedUserId = decodedToken.userId;
            } else if (userId) {
                // Development mode: accept userId directly
                console.log('⚠️  Development mode: accepting userId without token verification');
                authenticatedUserId = userId;
            } else {
                this.sendError(ws, 'Missing token or userId');
                ws.close(1008, 'Missing authentication parameters');
                return;
            }

            // Check canvas access
            const hasAccess = await CanvasService.checkAccess(canvasId, authenticatedUserId);
            if (!hasAccess) {
                this.sendError(ws, 'Access denied to canvas');
                ws.close(1008, 'Unauthorized');
                return;
            }

            // Get or create user info
            let user: any;

            if (token) {
                // Production mode: get or create user from Supabase auth data
                console.log('🔐 Token authentication - creating/getting user:', authenticatedUserId);
                const supabaseData = {
                    uid: authenticatedUserId,
                    email: (decodedToken as any).email || 'user@example.com',
                    name: (decodedToken as any).user_metadata?.name || (decodedToken as any).user_metadata?.full_name,
                    picture: (decodedToken as any).user_metadata?.avatar_url || (decodedToken as any).user_metadata?.picture,
                };
                console.log('📝 Supabase data:', supabaseData);
                user = await UserService.getOrCreateFromSupabase(supabaseData);
                console.log('✅ User created/found:', user?.username);
            } else {
                // Development mode: find or create demo user
                user = await UserService.findBySupabaseId(authenticatedUserId);
                if (!user) {
                    // Development mode: create user with demo data and unique username
                    const timestamp = Date.now();
                    const shortId = authenticatedUserId.substring(0, 8);
                    user = await UserService.create({
                        id: authenticatedUserId,
                        username: `demo_user_${shortId}_${timestamp}`,
                        email: `demo_${shortId}@collabcanvas.com`,
                        displayName: 'Demo User',
                        avatarColor: '#3B82F6',
                    });
                }
            }

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

            // Send initial canvas state
            await this.sendCanvasSync(client);

            // Notify other users
            await this.broadcastUserJoin(client);

            // Set up message handler
            ws.on('message', (data: Buffer) => this.handleMessage(connectionId, data));
            ws.on('close', () => this.handleDisconnect(connectionId));
            ws.on('error', (error) => this.handleError(connectionId, error));
            ws.on('pong', () => this.handlePong(connectionId));

            console.log(`✅ User ${user.username} connected to canvas ${canvasId}`);
        } catch (error: any) {
            console.error('Connection error:', error);
            this.sendError(ws, error.message);
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

            console.log(`📨 Message from ${client.user?.username}:`, message.type);

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

                default:
                    console.warn(`Unknown message type: ${message.type}`);
            }
        } catch (error: any) {
            console.error('Message handling error:', error);
            this.sendError(client.socket, error.message);
        }
    }

    private async handleCursorMove(client: WSClient, message: WSMessage): Promise<void> {
        const { x, y, viewportX, viewportY, viewportZoom } = message.payload || {};

        // Update presence in database
        await PresenceService.upsert({
            userId: client.userId,
            canvasId: client.canvasId,
            cursorX: x,
            cursorY: y,
            viewportX,
            viewportY,
            viewportZoom,
            color: client.user?.avatarColor || '#3B82F6',
            connectionId: client.id,
        });

        // Broadcast to other users on same canvas
        this.broadcastToCanvas(client.canvasId, {
            type: 'CURSOR_MOVE',
            payload: {
                userId: client.userId,
                username: client.user?.username,
                displayName: client.user?.displayName,
                color: client.user?.avatarColor,
                x,
                y,
            },
        }, client.id);
    }

    private async handleShapeCreate(client: WSClient, message: WSMessage): Promise<void> {
        const shape = await CanvasService.createShape(
            client.canvasId,
            client.userId,
            message.payload
        );

        // Broadcast to all users including sender
        this.broadcastToCanvas(client.canvasId, {
            type: 'SHAPE_CREATE',
            payload: { shape },
            userId: client.userId,
        });
    }

    private async handleShapeUpdate(client: WSClient, message: WSMessage): Promise<void> {
        const { shapeId, updates } = message.payload;

        const shape = await CanvasService.updateShape(
            shapeId,
            client.userId,
            updates
        );

        // Broadcast to all users including sender
        this.broadcastToCanvas(client.canvasId, {
            type: 'SHAPE_UPDATE',
            payload: { shape },
            userId: client.userId,
        });
    }

    private async handleShapeDelete(client: WSClient, message: WSMessage): Promise<void> {
        const { shapeId } = message.payload;

        await CanvasService.deleteShape(shapeId);

        // Broadcast to all users including sender
        this.broadcastToCanvas(client.canvasId, {
            type: 'SHAPE_DELETE',
            payload: { shapeId },
            userId: client.userId,
        });
    }

    private async handleBatchUpdate(client: WSClient, message: WSMessage): Promise<void> {
        const { updates } = message.payload;

        const shapes = await CanvasService.batchUpdateShapes(updates, client.userId);

        // Broadcast to all users including sender
        this.broadcastToCanvas(client.canvasId, {
            type: 'SHAPES_BATCH_UPDATE',
            payload: { shapes },
            userId: client.userId,
        });
    }

    private async handlePresenceUpdate(client: WSClient, message: WSMessage): Promise<void> {
        const { selectedObjectIds, isActive } = message.payload;

        await PresenceService.upsert({
            userId: client.userId,
            canvasId: client.canvasId,
            cursorX: 0,
            cursorY: 0,
            selectedObjectIds,
            color: client.user?.avatarColor || '#3B82F6',
            connectionId: client.id,
        });

        // Broadcast presence update
        this.broadcastToCanvas(client.canvasId, {
            type: 'PRESENCE_UPDATE',
            payload: {
                userId: client.userId,
                username: client.user?.username,
                selectedObjectIds,
                isActive,
            },
        }, client.id);
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
                    activeUsers: activeUsers.map(p => ({
                        userId: p.userId,
                        username: (p as any).username,
                        displayName: (p as any).display_name,
                        color: p.color,
                        cursorX: p.cursorX,
                        cursorY: p.cursorY,
                        isActive: p.isActive,
                    })),
                },
            });
        } catch (error: any) {
            console.error('Canvas sync error:', error);
            this.sendError(client.socket, 'Failed to sync canvas state');
        }
    }

    private async broadcastUserJoin(client: WSClient): Promise<void> {
        this.broadcastToCanvas(client.canvasId, {
            type: 'USER_JOIN',
            payload: {
                userId: client.userId,
                username: client.user?.username,
                displayName: client.user?.displayName,
                color: client.user?.avatarColor,
            },
        }, client.id);
    }

    private async handleDisconnect(connectionId: string): Promise<void> {
        const client = this.clients.get(connectionId);
        if (!client) return;

        console.log(`🔌 User ${client.user?.username} disconnected`);

        // Remove presence
        await PresenceService.removeByConnectionId(connectionId);

        // Update user online status (check if user has other connections)
        const hasOtherConnections = Array.from(this.clients.values()).some(
            c => c.userId === client.userId && c.id !== connectionId
        );
        if (!hasOtherConnections) {
            await UserService.updateOnlineStatus(client.userId, false);
        }

        // Notify other users
        this.broadcastToCanvas(client.canvasId, {
            type: 'USER_LEAVE',
            payload: {
                userId: client.userId,
                username: client.user?.username,
            },
        });

        // Cleanup
        this.unsubscribeFromCanvas(connectionId, client.canvasId);
        this.clients.delete(connectionId);
    }

    private handleError(connectionId: string, error: Error): void {
        console.error(`WebSocket error for ${connectionId}:`, error);
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

        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((client, connectionId) => {
                if (!client.isAlive) {
                    console.log(`💔 Terminating inactive connection: ${connectionId}`);
                    client.socket.terminate();
                    this.handleDisconnect(connectionId);
                    return;
                }

                client.isAlive = false;
                client.socket.ping();
            });

            // Cleanup stale presence records
            PresenceService.cleanupStale().catch(console.error);
        }, interval);
    }

    public close(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.clients.forEach((client) => {
            client.socket.close(1000, 'Server shutting down');
        });

        this.wss.close(() => {
            console.log('✅ WebSocket server closed');
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
}


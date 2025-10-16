/**
 * Handler for shape-related messages (create, update, delete)
 */

import { BaseHandler, HandlerContext } from './BaseHandler';
import { WSClient, WSMessage } from '../../types';
import { validateShapeCreate, validateShapeUpdate } from '../../utils/validation';
import { ValidationError } from '../../utils/errors';
import { CanvasService } from '../../services/CanvasService';

export class ShapeHandler extends BaseHandler {
    private shapeUpdateThrottles: Map<string, number> = new Map();
    private readonly SHAPE_THROTTLE_MS = 33; // 30fps

    /**
     * Handle shape creation
     */
    async handleCreate(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        try {
            // Validate shape data
            validateShapeCreate(message.payload);

            const shape = await CanvasService.createShape(
                client.canvasId,
                client.userId,
                message.payload
            );

            // Broadcast to all users including sender with high priority (immediate)
            context.broadcastToCanvasBatched(client.canvasId, {
                type: 'SHAPE_CREATE',
                payload: { shape },
                userId: client.userId,
                timestamp: Date.now(),
            }, undefined, 'high');

        } catch (error) {
            console.error('Shape create error:', error);
            if (error instanceof ValidationError) {
                this.sendError(client, error.message);
            } else {
                this.sendError(client, 'Failed to create shape');
            }
        }
    }

    /**
     * Handle shape update
     */
    async handleUpdate(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        const { shapeId, updates } = message.payload;

        if (!shapeId || !updates) {
            this.sendError(client, 'Invalid shape update data');
            return;
        }

        try {
            // Debug log for borderRadius updates
            if (updates.borderRadius !== undefined) {
                console.log('🔵 Border radius update received:', { shapeId, borderRadius: updates.borderRadius });
            }

            // Validate updates
            validateShapeUpdate(updates);

            // Check lock ownership
            const lockCheckResult = await this.checkLockOwnership(client, shapeId, updates);
            if (!lockCheckResult.allowed) {
                this.sendError(client, lockCheckResult.message!);
                if (lockCheckResult.currentShape) {
                    this.sendToClient(client, {
                        type: 'SHAPE_UPDATE',
                        payload: { shape: lockCheckResult.currentShape },
                        userId: client.userId,
                    });
                }
                return;
            }

            // Process lock state changes
            const updatedData = this.processLockState(updates, client.userId);

            // Debug log for borderRadius before DB update
            if (updatedData.borderRadius !== undefined) {
                console.log('🟢 Border radius before DB update:', { shapeId, borderRadius: updatedData.borderRadius, allUpdates: Object.keys(updatedData) });
            }

            // Update shape in database
            const shape = await CanvasService.updateShape(
                shapeId,
                client.userId,
                updatedData
            );

            // Debug log after DB update
            if (updatedData.borderRadius !== undefined) {
                console.log('🟣 Shape after DB update:', { shapeId, borderRadius: (shape as any).border_radius });
            }

            // Throttle broadcasts (except for lock/unlock)
            const isLockUpdate = updatedData.lockedAt !== undefined || updatedData.lockedBy !== undefined;
            if (this.shouldBroadcastUpdate(client.canvasId, shapeId, isLockUpdate)) {
                context.broadcastToCanvasBatched(client.canvasId, {
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
            console.error('Shape update error:', error);
            if (error instanceof ValidationError) {
                this.sendError(client, error.message);
            } else {
                this.sendError(client, 'Failed to update shape');
            }
        }
    }

    /**
     * Handle shape deletion
     */
    async handleDelete(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        const { shapeId } = message.payload;

        if (!shapeId) {
            this.sendError(client, 'Shape ID is required');
            return;
        }

        try {
            await CanvasService.deleteShape(shapeId);

            // Broadcast to all users including sender with high priority (immediate)
            context.broadcastToCanvasBatched(client.canvasId, {
                type: 'SHAPE_DELETE',
                payload: { shapeId },
                userId: client.userId,
                timestamp: Date.now(),
            }, undefined, 'high');

        } catch (error) {
            console.error('Shape delete error:', error);
            this.sendError(client, 'Failed to delete shape');
        }
    }

    /**
     * Handle batch shape updates
     */
    async handleBatchUpdate(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        const { updates } = message.payload;

        if (!Array.isArray(updates)) {
            this.sendError(client, 'Batch updates must be an array');
            return;
        }

        try {
            const shapes = await CanvasService.batchUpdateShapes(updates, client.userId);

            context.broadcastToCanvas(client.canvasId, {
                type: 'SHAPES_BATCH_UPDATE',
                payload: { shapes },
                userId: client.userId,
                timestamp: Date.now(),
            });

        } catch (error) {
            console.error('Batch update error:', error);
            this.sendError(client, 'Failed to batch update shapes');
        }
    }

    async handle(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        // This method dispatches to specific handlers
        switch (message.type) {
            case 'SHAPE_CREATE':
                await this.handleCreate(client, message, context);
                break;
            case 'SHAPE_UPDATE':
                await this.handleUpdate(client, message, context);
                break;
            case 'SHAPE_DELETE':
                await this.handleDelete(client, message, context);
                break;
            case 'SHAPES_BATCH_UPDATE':
                await this.handleBatchUpdate(client, message, context);
                break;
        }
    }

    /**
     * Check lock ownership before allowing updates
     */
    private async checkLockOwnership(
        client: WSClient,
        shapeId: string,
        updates: any
    ): Promise<{ allowed: boolean; message?: string; currentShape?: any }> {
        const currentShape = await CanvasService.getShapeById(shapeId);

        if (!currentShape) {
            return { allowed: false, message: 'Shape not found' };
        }

        const lockedBy = (currentShape as any).locked_by as string | null;
        const lockedAt = (currentShape as any).locked_at as Date | null;
        const isLockedByOther = !!lockedBy && lockedBy !== client.userId;
        const isExpired = CanvasService.isLockExpired(lockedAt as any);

        if (isLockedByOther && !isExpired) {
            // Shape is locked by another user
            if (updates.isLocked !== undefined || Object.keys(updates).length > 0) {
                return {
                    allowed: false,
                    message: 'Shape is locked by another user',
                    currentShape
                };
            }
        }

        // Check unlock permission
        if (updates.isLocked === false) {
            if (lockedBy && lockedBy !== client.userId && !isExpired) {
                return {
                    allowed: false,
                    message: 'Only the lock owner can unlock this shape',
                    currentShape
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Process lock state changes (convert isLocked to lockedAt/lockedBy)
     */
    private processLockState(updates: any, userId: string): any {
        const updatedData: any = { ...updates };

        if (updates.isLocked === true) {
            updatedData.lockedAt = new Date();
            updatedData.lockedBy = userId;
            delete updatedData.isLocked;
            console.log(`🔒 Locking shape for user ${userId}`);
        } else if (updates.isLocked === false) {
            updatedData.lockedAt = null;
            updatedData.lockedBy = null;
            delete updatedData.isLocked;
            console.log(`🔓 Unlocking shape`);
        }

        return updatedData;
    }

    /**
     * Check if shape update should be broadcast (throttling)
     */
    private shouldBroadcastUpdate(canvasId: string, shapeId: string, isLockUpdate: boolean): boolean {
        // Always broadcast lock/unlock immediately
        if (isLockUpdate) {
            return true;
        }

        const throttleKey = `${canvasId}:${shapeId}`;
        const now = Date.now();
        const lastUpdate = this.shapeUpdateThrottles.get(throttleKey) || 0;

        if (now - lastUpdate < this.SHAPE_THROTTLE_MS) {
            return false;
        }

        this.shapeUpdateThrottles.set(throttleKey, now);
        return true;
    }

    /**
     * Clean up throttle tracking
     */
    cleanup(canvasId: string): void {
        const keysToDelete: string[] = [];
        this.shapeUpdateThrottles.forEach((_, key) => {
            if (key.startsWith(`${canvasId}:`)) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.shapeUpdateThrottles.delete(key));
    }
}


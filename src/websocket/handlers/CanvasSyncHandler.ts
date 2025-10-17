/**
 * Handler for canvas synchronization messages
 */

import { BaseHandler, HandlerContext } from './BaseHandler';
import { WSClient, WSMessage } from '../../types';
import { CanvasService } from '../../services/CanvasService';
import { PresenceService } from '../../services/PresenceService';

export class CanvasSyncHandler extends BaseHandler {
    /**
     * Handle canvas sync request
     */
    async handleSyncRequest(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        try {
            const canvas = await CanvasService.findById(client.canvasId);
            const shapes = await CanvasService.getShapes(client.canvasId);
            const activeUsers = await PresenceService.getActiveUsers(client.canvasId);

            this.sendToClient(client, {
                type: 'CANVAS_SYNC',
                payload: {
                    canvas,
                    shapes,
                    activeUsers: this.formatActiveUsers(activeUsers, context),
                },
            });

        } catch (error) {
            console.error('Canvas sync error:', error);
            this.sendError(client, 'Failed to sync canvas state');
        }
    }

    /**
     * Handle canvas update (background color, etc.)
     */
    async handleCanvasUpdate(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        const { updates } = message.payload || {};

        try {
            // Extract allowed updates and convert to snake_case for database
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
            context.broadcastToCanvas(client.canvasId, {
                type: 'CANVAS_UPDATE',
                payload: { canvas },
                userId: client.userId,
            });

        } catch (error) {
            console.error('Canvas update error:', error);
            this.sendError(client, 'Failed to update canvas');
        }
    }

    async handle(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        switch (message.type) {
            case 'CANVAS_SYNC_REQUEST':
            case 'RECONNECT_REQUEST':
                await this.handleSyncRequest(client, message, context);
                break;
            case 'CANVAS_UPDATE':
                await this.handleCanvasUpdate(client, message, context);
                break;
        }
    }

    /**
     * Format active users data
     */
    private formatActiveUsers(activeUsers: any[], context: HandlerContext): any[] {
        return activeUsers.map(p => {
            const userData = (p as any).users;
            const userId = (p as any).user_id || (p as any).userId;

            return {
                userId,
                username: userData?.username || 'Unknown',
                displayName: userData?.display_name || userData?.username || 'Unknown',
                email: userData?.email || 'unknown@example.com',
                color: (p as any).color || context.getUserColor(userId),
                cursorX: p.cursorX,
                cursorY: p.cursorY,
                isActive: p.isActive,
            };
        });
    }
}


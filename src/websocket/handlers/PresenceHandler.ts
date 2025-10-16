/**
 * Handler for presence-related messages
 */

import { BaseHandler, HandlerContext } from './BaseHandler';
import { WSClient, WSMessage } from '../../types';
import { PresenceService } from '../../services/PresenceService';

export class PresenceHandler extends BaseHandler {
    async handle(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        const { selectedObjectIds, isActive } = message.payload || {};

        try {
            // Get user color
            const userColor = client.user?.avatarColor || context.getUserColor(client.userId);

            // Update presence in database
            await PresenceService.upsert({
                userId: client.userId,
                canvasId: client.canvasId,
                cursorX: 0,
                cursorY: 0,
                selectedObjectIds,
                color: userColor,
                connectionId: client.id,
            });

            // Broadcast presence update to other users
            context.broadcastToCanvas(client.canvasId, {
                type: 'PRESENCE_UPDATE',
                payload: {
                    userId: client.userId,
                    username: client.user?.username,
                    email: client.user?.email,
                    selectedObjectIds,
                    isActive,
                },
            }, client.id);

        } catch (error) {
            console.error('Presence update error:', error);
            this.sendError(client, 'Failed to update presence');
        }
    }
}


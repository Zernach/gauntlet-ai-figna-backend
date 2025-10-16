/**
 * Handler for cursor movement messages
 */

import { BaseHandler, HandlerContext } from './BaseHandler';
import { WSClient, WSMessage } from '../../types';
import { validateCursorPosition } from '../../utils/validation';
import { PresenceService } from '../../services/PresenceService';

export class CursorHandler extends BaseHandler {
    private cursorUpdateThrottles: Map<string, number> = new Map();
    private readonly CURSOR_THROTTLE_MS = 25; // 40fps

    async handle(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void> {
        const { x, y, viewportX, viewportY, viewportZoom } = message.payload || {};

        try {
            // Validate cursor position
            validateCursorPosition({ x, y });

            // Throttle cursor updates per client
            if (!this.shouldBroadcast(client.id)) {
                return;
            }

            // Get user color
            const userColor = client.user?.avatarColor || context.getUserColor(client.userId);

            // Broadcast with low priority (batched) for performance
            context.broadcastToCanvasBatched(client.canvasId, {
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
            }).catch(err => console.error('Presence update error:', err));

        } catch (error) {
            console.error('Cursor move error:', error);
            this.sendError(client, 'Failed to update cursor position');
        }
    }

    /**
     * Check if cursor update should be broadcast (throttling)
     */
    private shouldBroadcast(clientId: string): boolean {
        const now = Date.now();
        const lastUpdate = this.cursorUpdateThrottles.get(clientId) || 0;

        if (now - lastUpdate < this.CURSOR_THROTTLE_MS) {
            return false;
        }

        this.cursorUpdateThrottles.set(clientId, now);
        return true;
    }

    /**
     * Clean up throttle tracking for disconnected client
     */
    cleanup(clientId: string): void {
        this.cursorUpdateThrottles.delete(clientId);
    }
}


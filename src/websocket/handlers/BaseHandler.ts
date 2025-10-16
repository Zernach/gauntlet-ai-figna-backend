/**
 * Base handler class for WebSocket message handlers
 * Provides common functionality for all handlers
 */

import { WebSocket } from 'ws';
import { WSMessage, WSClient } from '../../types';
import { ValidationError } from '../../utils/errors';

export abstract class BaseHandler {
    /**
     * Handle the message
     * Must be implemented by subclasses
     */
    abstract handle(client: WSClient, message: WSMessage, context: HandlerContext): Promise<void>;

    /**
     * Send message to a specific client
     */
    protected sendToClient(client: WSClient, message: WSMessage): void {
        if (client.socket.readyState === WebSocket.OPEN) {
            client.socket.send(JSON.stringify(message));
        }
    }

    /**
     * Send error to client
     */
    protected sendError(client: WSClient, message: string): void {
        this.sendToClient(client, {
            type: 'ERROR',
            payload: { message },
            timestamp: Date.now(),
        });
    }

    /**
     * Validate required payload fields
     */
    protected validatePayload(payload: any, requiredFields: string[]): void {
        if (!payload || typeof payload !== 'object') {
            throw new ValidationError('Invalid payload');
        }

        for (const field of requiredFields) {
            if (payload[field] === undefined) {
                throw new ValidationError(`Missing required field: ${field}`);
            }
        }
    }
}

/**
 * Handler context containing shared resources
 */
export interface HandlerContext {
    broadcastToCanvas: (canvasId: string, message: WSMessage, excludeConnectionId?: string) => void;
    broadcastToCanvasBatched: (canvasId: string, message: WSMessage, excludeConnectionId?: string, priority?: 'high' | 'low') => void;
    broadcastActiveUsers: (canvasId: string) => Promise<void>;
    getUserColor: (userId: string) => string;
}


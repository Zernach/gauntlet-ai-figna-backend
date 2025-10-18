/**
 * Export all message handlers
 */

export { BaseHandler, HandlerContext } from './BaseHandler';
export { CursorHandler } from './CursorHandler';
export { ShapeHandler } from './ShapeHandler';
export { PresenceHandler } from './PresenceHandler';
export { CanvasSyncHandler } from './CanvasSyncHandler';

/**
 * Handler registry for message types
 */
import { BaseHandler } from './BaseHandler';
import { CursorHandler } from './CursorHandler';
import { ShapeHandler } from './ShapeHandler';
import { PresenceHandler } from './PresenceHandler';
import { CanvasSyncHandler } from './CanvasSyncHandler';

export class HandlerRegistry {
    private handlers: Map<string, BaseHandler> = new Map();

    // Handler instances
    private cursorHandler = new CursorHandler();
    private shapeHandler = new ShapeHandler();
    private presenceHandler = new PresenceHandler();
    private canvasSyncHandler = new CanvasSyncHandler();

    constructor() {
        this.registerHandlers();
    }

    /**
     * Register all message type handlers
     */
    private registerHandlers(): void {
        // Cursor
        this.handlers.set('CURSOR_MOVE', this.cursorHandler);

        // Shapes
        this.handlers.set('SHAPE_CREATE', this.shapeHandler);
        this.handlers.set('SHAPE_UPDATE', this.shapeHandler);
        this.handlers.set('SHAPE_DELETE', this.shapeHandler);
        this.handlers.set('SHAPES_BATCH_UPDATE', this.shapeHandler);
        this.handlers.set('GROUP_SHAPES', this.shapeHandler);
        this.handlers.set('UNGROUP_SHAPES', this.shapeHandler);

        // Presence
        this.handlers.set('PRESENCE_UPDATE', this.presenceHandler);

        // Canvas sync
        this.handlers.set('CANVAS_SYNC_REQUEST', this.canvasSyncHandler);
        this.handlers.set('CANVAS_UPDATE', this.canvasSyncHandler);
        this.handlers.set('RECONNECT_REQUEST', this.canvasSyncHandler);
    }

    /**
     * Get handler for message type
     */
    getHandler(messageType: string): BaseHandler | undefined {
        return this.handlers.get(messageType);
    }

    /**
     * Cleanup handler resources for a client
     */
    cleanupClient(clientId: string): void {
        this.cursorHandler.cleanup(clientId);
    }

    /**
     * Cleanup handler resources for a canvas
     */
    cleanupCanvas(canvasId: string): void {
        this.shapeHandler.cleanup(canvasId);
    }
}


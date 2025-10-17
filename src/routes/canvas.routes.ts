import { Router, Response } from 'express';
import { AuthRequest, authenticateUser } from '../middleware/auth';
import { CanvasService } from '../services/CanvasService';
import { PresenceService } from '../services/PresenceService';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createCanvasSchema = Joi.object({
    name: Joi.string().required().max(255),
    description: Joi.string().optional().allow('').max(1000),
    isPublic: Joi.boolean().optional().default(false),
    backgroundColor: Joi.string().optional().allow('').pattern(/^#[0-9A-F]{6}$/i),
});

const updateCanvasSchema = Joi.object({
    name: Joi.string().optional().max(255),
    description: Joi.string().optional().allow('').max(1000),
    isPublic: Joi.boolean().optional(),
    viewportX: Joi.number().optional(),
    viewportY: Joi.number().optional(),
    viewportZoom: Joi.number().optional().min(0.1).max(10),
    backgroundColor: Joi.string().optional().allow('').pattern(/^#[0-9A-F]{6}$/i),
    gridEnabled: Joi.boolean().optional(),
    gridSize: Joi.number().optional().min(1),
    snapToGrid: Joi.boolean().optional(),
});

/**
 * GET /api/canvas
 * Get all canvases accessible to the user
 * If user has no canvases, automatically create a default one
 */
router.get('/', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        let canvases = await CanvasService.getUserCanvases(req.user.uid);

        // If user has no canvases, create a default one
        if (canvases.length === 0) {
            console.log(`Creating default canvas for user ${req.user.uid}`);
            const defaultCanvas = await CanvasService.create(req.user.uid, {
                name: 'My First Canvas',
                description: 'Welcome to Figna!',
                backgroundColor: '#1a1a1a',
                isPublic: false,
            });
            canvases = [defaultCanvas];
        }

        return res.json({
            success: true,
            data: canvases,
            count: canvases.length,
        });
    } catch (error: any) {
        console.error('Get canvases error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /api/canvas/:canvasId
 * Get canvas by ID
 */
router.get('/:canvasId', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { canvasId } = req.params;

        // Check access
        const hasAccess = await CanvasService.checkAccess(canvasId, req.user.uid);
        if (!hasAccess) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have access to this canvas',
            });
        }

        const canvas = await CanvasService.findById(canvasId);
        if (!canvas) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Canvas not found',
            });
        }

        // Update last accessed
        await CanvasService.updateLastAccessed(canvasId);

        return res.json({
            success: true,
            data: canvas,
        });
    } catch (error: any) {
        console.error('Get canvas error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * POST /api/canvas
 * Create a new canvas
 */
router.post('/', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Validate request body
        const { error, value } = createCanvasSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation error',
                message: error.details[0].message,
            });
        }

        const canvas = await CanvasService.create(req.user.uid, {
            name: value.name,
            description: value.description,
            backgroundColor: value.backgroundColor,
            isPublic: value.isPublic,
        });

        return res.status(201).json({
            success: true,
            data: canvas,
            message: 'Canvas created successfully',
        });
    } catch (error: any) {
        console.error('Create canvas error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * PUT /api/canvas/:canvasId
 * Update canvas
 */
router.put('/:canvasId', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { canvasId } = req.params;

        // Check access
        const hasAccess = await CanvasService.checkAccess(canvasId, req.user.uid);
        if (!hasAccess) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have access to this canvas',
            });
        }

        // Validate request body
        const { error, value } = updateCanvasSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation error',
                message: error.details[0].message,
            });
        }

        const canvas = await CanvasService.update(canvasId, value);

        return res.json({
            success: true,
            data: canvas,
        });
    } catch (error: any) {
        console.error('Update canvas error:', error);

        if (error.message === 'Canvas not found') {
            return res.status(404).json({
                error: 'Not found',
                message: error.message,
            });
        }

        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * DELETE /api/canvas/:canvasId
 * Delete a canvas (owner only)
 */
router.delete('/:canvasId', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { canvasId } = req.params;

        const success = await CanvasService.delete(canvasId, req.user.uid);

        if (!success) {
            return res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to delete canvas',
            });
        }

        return res.json({
            success: true,
            message: 'Canvas deleted successfully',
        });
    } catch (error: any) {
        console.error('Delete canvas error:', error);

        if (error.message === 'Canvas not found') {
            return res.status(404).json({
                error: 'Not found',
                message: error.message,
            });
        }

        if (error.message === 'Only the canvas owner can delete it') {
            return res.status(403).json({
                error: 'Forbidden',
                message: error.message,
            });
        }

        if (error.message === 'The public canvas cannot be deleted') {
            return res.status(403).json({
                error: 'Forbidden',
                message: error.message,
            });
        }

        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /api/canvas/:canvasId/shapes
 * Get all shapes for a canvas
 */
router.get('/:canvasId/shapes', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { canvasId } = req.params;

        // Check access
        const hasAccess = await CanvasService.checkAccess(canvasId, req.user.uid);
        if (!hasAccess) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have access to this canvas',
            });
        }

        const shapes = await CanvasService.getShapes(canvasId);

        return res.json({
            success: true,
            data: shapes,
            count: shapes.length,
        });
    } catch (error: any) {
        console.error('Get shapes error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /api/canvas/:canvasId/sync
 * Get full canvas state for reconnection (canvas + shapes + active users)
 * Optimized endpoint for fast reconnection recovery
 */
router.get('/:canvasId/sync', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { canvasId } = req.params;

        // Check access
        const hasAccess = await CanvasService.checkAccess(canvasId, req.user.uid);
        if (!hasAccess) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have access to this canvas',
            });
        }

        // Fetch all data in parallel for speed
        const [canvas, shapes, activeUsers] = await Promise.all([
            CanvasService.findById(canvasId),
            CanvasService.getShapes(canvasId),
            PresenceService.getActiveUsers(canvasId),
        ]);

        if (!canvas) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Canvas not found',
            });
        }

        return res.json({
            success: true,
            data: {
                canvas,
                shapes,
                activeUsers: activeUsers.map((p: any) => ({
                    userId: p.user_id || p.userId,
                    username: p.users?.username || 'Unknown',
                    displayName: p.users?.display_name || p.users?.username || 'Unknown',
                    email: p.users?.email || 'unknown@example.com',
                    color: p.color,
                    cursorX: p.cursor_x,
                    cursorY: p.cursor_y,
                    isActive: p.is_active,
                })),
            },
            timestamp: Date.now(),
        });
    } catch (error: any) {
        console.error('Sync canvas error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

export default router;


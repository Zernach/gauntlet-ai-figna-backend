import { Router, Response } from 'express';
import { AuthRequest, authenticateUser } from '../middleware/auth';
import { CanvasService } from '../services/CanvasService';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createCanvasSchema = Joi.object({
    name: Joi.string().required().max(255),
    description: Joi.string().optional().max(1000),
    isPublic: Joi.boolean().optional().default(false),
});

const updateCanvasSchema = Joi.object({
    name: Joi.string().optional().max(255),
    description: Joi.string().optional().max(1000),
    isPublic: Joi.boolean().optional(),
    viewportX: Joi.number().optional(),
    viewportY: Joi.number().optional(),
    viewportZoom: Joi.number().optional().min(0.1).max(10),
    backgroundColor: Joi.string().optional().pattern(/^#[0-9A-F]{6}$/i),
    gridEnabled: Joi.boolean().optional(),
    gridSize: Joi.number().optional().min(1),
    snapToGrid: Joi.boolean().optional(),
});

/**
 * GET /api/canvas
 * Get all canvases for authenticated user
 */
router.get('/', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const canvases = await CanvasService.findByUserId(req.user.uid, limit);

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
 * Create new canvas
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

        const canvas = await CanvasService.create({
            ownerId: req.user.uid,
            name: value.name,
            description: value.description,
            isPublic: value.isPublic,
        });

        return res.status(201).json({
            success: true,
            data: canvas,
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
 * Delete canvas
 */
router.delete('/:canvasId', authenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { canvasId } = req.params;

        const deleted = await CanvasService.delete(canvasId, req.user.uid);

        if (!deleted) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Canvas not found or you do not have permission to delete it',
            });
        }

        return res.json({
            success: true,
            message: 'Canvas deleted successfully',
        });
    } catch (error: any) {
        console.error('Delete canvas error:', error);
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

export default router;


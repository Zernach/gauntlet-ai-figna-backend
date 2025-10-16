import { Request, Response, NextFunction } from 'express';
import { sanitizeInput, validateShapeData } from '../utils/security';
import { securityLogger, SecurityEventType } from '../utils/securityLogger';
import { AuthRequest } from './enhancedAuth';

/**
 * Request validation and sanitization middleware
 */

/**
 * Validate and sanitize request body
 */
export function validateAndSanitizeBody(req: Request, res: Response, next: NextFunction): void {
    if (req.body) {
        req.body = sanitizeInput(req.body);
    }
    next();
}

/**
 * Validate shape creation/update requests
 */
export function validateShapeRequest(req: AuthRequest, res: Response, next: NextFunction): void {
    const shape = req.body;

    if (!shape) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Shape data required',
        });
        return;
    }

    const validation = validateShapeData(shape);

    if (!validation.valid) {
        securityLogger.logFromRequest(
            req,
            SecurityEventType.INVALID_INPUT,
            'Invalid shape data',
            req.user?.uid,
            { errors: validation.errors }
        );

        res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid shape data',
            errors: validation.errors,
        });
        return;
    }

    next();
}

/**
 * Validate batch shape requests
 */
export function validateBatchShapeRequest(req: AuthRequest, res: Response, next: NextFunction): void {
    const { shapes } = req.body;

    if (!shapes || !Array.isArray(shapes)) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Shapes array required',
        });
        return;
    }

    // Limit batch size
    const maxBatchSize = 100;
    if (shapes.length > maxBatchSize) {
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            `Batch size exceeds limit: ${shapes.length}`,
            req.user?.uid
        );

        res.status(400).json({
            error: 'Bad Request',
            message: `Batch size exceeds maximum of ${maxBatchSize}`,
        });
        return;
    }

    // Validate each shape
    const errors: Array<{ index: number; errors: string[] }> = [];

    shapes.forEach((shape, index) => {
        const validation = validateShapeData(shape);
        if (!validation.valid) {
            errors.push({ index, errors: validation.errors });
        }
    });

    if (errors.length > 0) {
        securityLogger.logFromRequest(
            req,
            SecurityEventType.INVALID_INPUT,
            'Invalid shapes in batch',
            req.user?.uid,
            { errorCount: errors.length }
        );

        res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid shape data in batch',
            errors,
        });
        return;
    }

    next();
}

/**
 * Validate canvas ID parameter
 */
export function validateCanvasId(req: Request, res: Response, next: NextFunction): void {
    const canvasId = req.params.canvasId || req.query.canvasId as string;

    if (!canvasId) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Canvas ID required',
        });
        return;
    }

    // Validate format (alphanumeric, hyphens, underscores, 3-100 chars)
    const canvasIdRegex = /^[a-zA-Z0-9_-]{3,100}$/;

    if (!canvasIdRegex.test(canvasId)) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid canvas ID format',
        });
        return;
    }

    next();
}

/**
 * Validate UUID parameter
 */
export function validateUUID(paramName: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const uuid = req.params[paramName];

        if (!uuid) {
            res.status(400).json({
                error: 'Bad Request',
                message: `${paramName} required`,
            });
            return;
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (!uuidRegex.test(uuid)) {
            res.status(400).json({
                error: 'Bad Request',
                message: `Invalid ${paramName} format`,
            });
            return;
        }

        next();
    };
}

/**
 * Limit request body size (additional protection beyond express.json limit)
 */
export function limitRequestSize(maxSizeBytes: number) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const contentLength = parseInt(req.headers['content-length'] || '0');

        if (contentLength > maxSizeBytes) {
            securityLogger.logFromRequest(
                req as AuthRequest,
                SecurityEventType.SUSPICIOUS_ACTIVITY,
                `Request size exceeds limit: ${contentLength} bytes`,
                (req as AuthRequest).user?.uid
            );

            res.status(413).json({
                error: 'Payload Too Large',
                message: 'Request body exceeds maximum size',
            });
            return;
        }

        next();
    };
}

/**
 * Prevent parameter pollution
 */
export function preventParameterPollution(req: Request, res: Response, next: NextFunction): void {
    // Check for duplicate keys in query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const params = url.searchParams;
    const keys = new Set<string>();

    for (const key of params.keys()) {
        if (keys.has(key)) {
            securityLogger.logFromRequest(
                req as AuthRequest,
                SecurityEventType.SUSPICIOUS_ACTIVITY,
                'Parameter pollution detected',
                (req as AuthRequest).user?.uid,
                { duplicateKey: key }
            );

            res.status(400).json({
                error: 'Bad Request',
                message: 'Duplicate query parameters not allowed',
            });
            return;
        }
        keys.add(key);
    }

    next();
}


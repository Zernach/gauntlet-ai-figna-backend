import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/enhancedAuth';
import { isTokenExpiringSoon } from './security';
import { securityLogger, SecurityEventType } from './securityLogger';

/**
 * Token Refresh Mechanism
 * Handles automatic token refresh for long-lived sessions
 */

/**
 * Middleware to check if token needs refresh and send refresh notification
 * This middleware runs after authentication
 */
export function checkTokenExpiry(req: AuthRequest, res: Response, next: NextFunction): void {
    // Only check for authenticated users
    if (!req.user) {
        next();
        return;
    }

    // Check if token has expiry information
    const tokenData = (req.user as any);
    const expiresAt = tokenData.exp;

    if (!expiresAt) {
        next();
        return;
    }

    // Check if token is expiring soon (within 5 minutes)
    const isExpiringSoon = isTokenExpiringSoon(expiresAt, 300);

    if (isExpiringSoon) {
        // Add a header to notify client to refresh token
        res.setHeader('X-Token-Expiring', 'true');
        res.setHeader('X-Token-Expires-At', expiresAt.toString());

        securityLogger.logFromRequest(
            req,
            SecurityEventType.AUTH_TOKEN_EXPIRED,
            'Token expiring soon',
            req.user.uid,
            { expiresAt: new Date(expiresAt * 1000).toISOString() }
        );
    }

    next();
}

/**
 * Token refresh endpoint handler
 * POST /api/auth/refresh
 * 
 * Note: This uses Supabase's built-in token refresh mechanism
 * The client should call supabase.auth.refreshSession()
 */
export async function refreshTokenHandler(req: AuthRequest, res: Response): Promise<void> {
    try {
        // The client should have already refreshed the token using Supabase
        // This endpoint just validates that the new token is valid

        if (!req.user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
            return;
        }

        // Get token expiry
        const tokenData = (req.user as any);
        const expiresAt = tokenData.exp;

        securityLogger.logFromRequest(
            req,
            SecurityEventType.AUTH_SUCCESS,
            'Token refresh validated',
            req.user.uid
        );

        res.json({
            success: true,
            message: 'Token is valid',
            expiresAt,
            expiresIn: expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : null,
        });
    } catch (error: any) {
        console.error('Token refresh validation error:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to validate token refresh',
        });
    }
}

/**
 * Get token expiry information
 * GET /api/auth/token-info
 */
export function getTokenInfoHandler(req: AuthRequest, res: Response): void {
    if (!req.user) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required',
        });
        return;
    }

    const tokenData = (req.user as any);
    const expiresAt = tokenData.exp;
    const issuedAt = tokenData.iat;

    res.json({
        success: true,
        tokenInfo: {
            userId: req.user.uid,
            issuedAt: issuedAt ? new Date(issuedAt * 1000).toISOString() : null,
            expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
            expiresIn: expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : null,
            isExpiringSoon: expiresAt ? isTokenExpiringSoon(expiresAt, 300) : false,
        },
    });
}


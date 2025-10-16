import { Request, Response, NextFunction } from 'express';
import { generateSecureToken, signRequest, verifySignature } from '../utils/security';
import { securityLogger, SecurityEventType } from '../utils/securityLogger';
import { AuthRequest } from './enhancedAuth';

/**
 * CSRF (Cross-Site Request Forgery) Protection Middleware
 * Implements double-submit cookie pattern with signed tokens
 */

// Store for CSRF tokens (in production, use Redis or similar)
const csrfTokens = new Map<string, { token: string; expiresAt: number; used: boolean }>();

// Clean up expired tokens every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of csrfTokens.entries()) {
        if (now > data.expiresAt) {
            csrfTokens.delete(userId);
        }
    }
}, 5 * 60 * 1000);

/**
 * Generate a CSRF token for a user
 */
export function generateCSRFToken(userId: string): string {
    const token = generateSecureToken(32);
    const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour

    csrfTokens.set(userId, {
        token,
        expiresAt,
        used: false,
    });

    return token;
}

/**
 * Verify CSRF token
 */
export function verifyCSRFToken(userId: string, token: string): boolean {
    const stored = csrfTokens.get(userId);

    if (!stored) {
        return false;
    }

    if (Date.now() > stored.expiresAt) {
        csrfTokens.delete(userId);
        return false;
    }

    if (stored.token !== token) {
        return false;
    }

    return true;
}

/**
 * CSRF protection middleware for state-changing operations
 * Applies to POST, PUT, PATCH, DELETE requests
 */
export function csrfProtection(req: AuthRequest, res: Response, next: NextFunction): void {
    // Skip for safe methods
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        next();
        return;
    }

    // Require authentication for CSRF protection
    if (!req.user) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required',
        });
        return;
    }

    // Get CSRF token from header
    const csrfToken = req.headers['x-csrf-token'] as string;

    if (!csrfToken) {
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Missing CSRF token',
            req.user.uid
        );

        res.status(403).json({
            error: 'Forbidden',
            message: 'Missing CSRF token',
            code: 'CSRF_TOKEN_MISSING',
        });
        return;
    }

    // Verify token
    if (!verifyCSRFToken(req.user.uid, csrfToken)) {
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Invalid CSRF token',
            req.user.uid
        );

        res.status(403).json({
            error: 'Forbidden',
            message: 'Invalid or expired CSRF token',
            code: 'CSRF_TOKEN_INVALID',
        });
        return;
    }

    next();
}

/**
 * Endpoint to get a CSRF token
 * GET /api/csrf-token
 */
export function getCSRFTokenHandler(req: AuthRequest, res: Response): void {
    if (!req.user) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required',
        });
        return;
    }

    const token = generateCSRFToken(req.user.uid);

    res.json({
        success: true,
        csrfToken: token,
        expiresIn: 3600, // 1 hour in seconds
    });
}

/**
 * Optional: Double-submit cookie pattern
 * Sets CSRF token as an httpOnly cookie
 */
export function setCSRFCookie(req: AuthRequest, res: Response, next: NextFunction): void {
    if (req.user) {
        const token = generateCSRFToken(req.user.uid);

        res.cookie('XSRF-TOKEN', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 1000, // 1 hour
        });
    }

    next();
}


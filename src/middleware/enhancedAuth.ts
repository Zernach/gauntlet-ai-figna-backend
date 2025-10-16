import { Request, Response, NextFunction } from 'express';
import { verifySupabaseToken } from '../config/supabase';
import { UserService } from '../services/UserService';
import { securityLogger, SecurityEventType } from '../utils/securityLogger';
import { sanitizeInput, checkRequestLimit } from '../utils/security';

export interface AuthRequest extends Request {
    user?: {
        uid: string;
        email?: string;
        name?: string;
        role?: string;
        [key: string]: any;
    };
}

/**
 * Enhanced Supabase Authentication Middleware with security logging and validation
 */
export async function enhancedAuthenticateUser(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // Check for Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            securityLogger.logAuthFailure(req, 'Missing authorization header');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing authorization header',
            });
            return;
        }

        if (!authHeader.startsWith('Bearer ')) {
            securityLogger.logAuthFailure(req, 'Invalid authorization header format');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid authorization header format',
            });
            return;
        }

        const token = authHeader.split('Bearer ')[1];

        if (!token || token.length === 0) {
            securityLogger.logAuthFailure(req, 'Empty token');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'No token provided',
            });
            return;
        }

        // Basic token format validation
        if (token.length < 20 || token.length > 2000) {
            securityLogger.logAuthFailure(req, 'Invalid token length');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token format',
            });
            return;
        }

        let decodedToken: any;

        try {
            // Verify the Supabase JWT token
            decodedToken = await verifySupabaseToken(token);
        } catch (tokenError: any) {
            const isExpired = tokenError.message?.toLowerCase().includes('expired');
            securityLogger.logAuthFailure(
                req,
                isExpired ? 'Token expired' : 'Token verification failed',
                { error: tokenError.message }
            );

            res.status(401).json({
                error: 'Unauthorized',
                message: isExpired ? 'Token expired' : 'Invalid or expired token',
                code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
            });
            return;
        }

        // Validate decoded token structure
        if (!decodedToken.userId) {
            securityLogger.logAuthFailure(req, 'Token missing userId');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token structure',
            });
            return;
        }

        // Rate limiting per user
        const rateLimitConfig = {
            maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_PER_USER || '200'),
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
        };

        const rateLimitResult = checkRequestLimit(
            decodedToken.userId,
            rateLimitConfig.maxRequests,
            rateLimitConfig.windowMs
        );

        if (!rateLimitResult.allowed) {
            securityLogger.logRateLimitExceeded(req, decodedToken.userId);
            res.status(429).json({
                error: 'Too Many Requests',
                message: 'Rate limit exceeded',
                retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
            });
            return;
        }

        // Ensure user exists in database (create if doesn't exist)
        if (decodedToken.email) {
            try {
                await UserService.getOrCreateFromSupabase({
                    uid: decodedToken.userId,
                    email: decodedToken.email,
                    name: decodedToken.user_metadata?.name ||
                        decodedToken.user_metadata?.full_name ||
                        decodedToken.email.split('@')[0],
                    picture: decodedToken.user_metadata?.avatar_url ||
                        decodedToken.user_metadata?.picture,
                });
            } catch (userError: any) {
                console.error('Failed to create/get user:', userError.message);
                // Continue even if user creation fails - might be a race condition
            }
        }

        // Attach user info to request (with sanitized data)
        req.user = {
            uid: decodedToken.userId,
            email: decodedToken.email,
            name: sanitizeInput(
                decodedToken.user_metadata?.name ||
                decodedToken.user_metadata?.full_name ||
                decodedToken.email?.split('@')[0]
            ),
            role: decodedToken.role,
            ...decodedToken,
        };

        // Log successful authentication
        securityLogger.logAuthSuccess(req, decodedToken.userId);

        next();
    } catch (error: any) {
        console.error('Authentication error:', error.message);
        securityLogger.logAuthFailure(req, 'Internal error', { error: error.message });

        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication failed',
        });
    }
}

/**
 * Optional authentication middleware with enhanced security
 * Attaches user if token is valid, but doesn't fail if missing
 */
export async function enhancedOptionalAuth(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split('Bearer ')[1];

            if (token && token.length >= 20 && token.length <= 2000) {
                try {
                    const decodedToken = await verifySupabaseToken(token);

                    // Ensure user exists in database
                    if (decodedToken.email) {
                        try {
                            await UserService.getOrCreateFromSupabase({
                                uid: decodedToken.userId,
                                email: decodedToken.email,
                                name: decodedToken.user_metadata?.name ||
                                    decodedToken.user_metadata?.full_name ||
                                    decodedToken.email.split('@')[0],
                                picture: decodedToken.user_metadata?.avatar_url ||
                                    decodedToken.user_metadata?.picture,
                            });
                        } catch (userError: any) {
                            console.error('Failed to create/get user:', userError.message);
                        }
                    }

                    req.user = {
                        uid: decodedToken.userId,
                        email: decodedToken.email,
                        name: sanitizeInput(
                            decodedToken.user_metadata?.name ||
                            decodedToken.user_metadata?.full_name ||
                            decodedToken.email?.split('@')[0]
                        ),
                        role: decodedToken.role,
                        ...decodedToken,
                    };

                    securityLogger.logAuthSuccess(req, decodedToken.userId);
                } catch (error) {
                    // Silently continue without authentication
                    // The error is already logged by the token verification
                }
            }
        }

        next();
    } catch (error) {
        // Continue without authentication on any error
        next();
    }
}

/**
 * Require specific role
 */
export function requireRole(allowedRoles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            securityLogger.logAccessDenied(req, 'role-protected resource');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
            return;
        }

        const userRole = req.user.role || 'user';

        if (!allowedRoles.includes(userRole)) {
            securityLogger.logAccessDenied(req, 'role-protected resource', req.user.uid);
            res.status(403).json({
                error: 'Forbidden',
                message: 'Insufficient permissions',
            });
            return;
        }

        next();
    };
}

/**
 * Validate request body against allowed fields
 */
export function validateRequestBody(allowedFields: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.body || typeof req.body !== 'object') {
            next();
            return;
        }

        const bodyKeys = Object.keys(req.body);
        const invalidFields = bodyKeys.filter(key => !allowedFields.includes(key));

        if (invalidFields.length > 0) {
            securityLogger.logFromRequest(
                req,
                SecurityEventType.INVALID_INPUT,
                'Invalid fields in request body',
                (req as AuthRequest).user?.uid,
                { invalidFields }
            );

            res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid fields in request',
                invalidFields,
            });
            return;
        }

        // Sanitize all input
        req.body = sanitizeInput(req.body);
        next();
    };
}


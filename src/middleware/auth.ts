import { Request, Response, NextFunction } from 'express';
import { verifySupabaseToken } from '../config/supabase';
import { UserService } from '../services/UserService';

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
 * Supabase Authentication Middleware
 * Verifies Supabase JWT token from Authorization header
 */
export async function authenticateUser(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid authorization header',
            });
            return;
        }

        const token = authHeader.split('Bearer ')[1];

        if (!token) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'No token provided',
            });
            return;
        }

        // Verify the Supabase JWT token
        const decodedToken = await verifySupabaseToken(token);

        // Ensure user exists in database (create if doesn't exist)
        if (decodedToken.email) {
            try {
                await UserService.getOrCreateFromSupabase({
                    uid: decodedToken.userId,
                    email: decodedToken.email,
                    name: decodedToken.user_metadata?.name || decodedToken.email.split('@')[0],
                    picture: decodedToken.user_metadata?.avatar_url,
                });
            } catch (userError: any) {
                console.error('Failed to create/get user:', userError.message);
                // Continue even if user creation fails - might be a race condition
            }
        }

        // Attach user info to request
        req.user = {
            uid: decodedToken.userId,
            email: decodedToken.email,
            name: decodedToken.user_metadata?.name || decodedToken.email?.split('@')[0],
            role: decodedToken.role,
            ...decodedToken,
        };

        next();
    } catch (error: any) {
        console.error('Authentication error:', error.message);
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token',
        });
    }
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't fail if missing
 */
export async function optionalAuth(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split('Bearer ')[1];
            if (token) {
                const decodedToken = await verifySupabaseToken(token);

                // Ensure user exists in database (create if doesn't exist)
                if (decodedToken.email) {
                    try {
                        await UserService.getOrCreateFromSupabase({
                            uid: decodedToken.userId,
                            email: decodedToken.email,
                            name: decodedToken.user_metadata?.name || decodedToken.email.split('@')[0],
                            picture: decodedToken.user_metadata?.avatar_url,
                        });
                    } catch (userError: any) {
                        console.error('Failed to create/get user:', userError.message);
                        // Continue even if user creation fails
                    }
                }

                req.user = {
                    uid: decodedToken.userId,
                    email: decodedToken.email,
                    name: decodedToken.user_metadata?.name || decodedToken.email?.split('@')[0],
                    role: decodedToken.role,
                    ...decodedToken,
                };
            }
        }

        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
}

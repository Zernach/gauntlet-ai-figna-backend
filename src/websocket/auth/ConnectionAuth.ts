/**
 * WebSocket connection authentication module
 * Handles authentication and user management for WebSocket connections
 */

import { IncomingMessage } from 'http';
import { parse } from 'url';
import { verifySupabaseToken } from '../../config/supabase';
import { UserService } from '../../services/UserService';
import { AuthenticationError, ValidationError } from '../../utils/errors';
import { validateCanvasId, validateUserId } from '../../utils/validation';
import { CanvasService } from '../../services/CanvasService';

export interface AuthResult {
    userId: string;
    canvasId: string;
    user: any;
    token?: string;
}

export class ConnectionAuth {
    /**
     * Authenticate WebSocket connection
     * Handles both token-based (production) and userId-based (development) auth
     */
    static async authenticate(req: IncomingMessage): Promise<AuthResult> {
        // Parse query parameters
        const { query } = parse(req.url || '', true);
        const token = query.token as string;
        const userId = query.userId as string;
        const canvasId = query.canvasId as string;

        // Validate canvas ID
        if (!canvasId) {
            throw new ValidationError('Missing canvasId parameter');
        }
        validateCanvasId(canvasId);

        // Determine authentication mode
        let authenticatedUserId: string;
        let decodedToken: any = null;

        if (token) {
            // Production mode: verify Supabase token
            decodedToken = await verifySupabaseToken(token);
            authenticatedUserId = decodedToken.userId;
        } else if (userId) {
            // Development mode: accept userId directly
            authenticatedUserId = userId;
            validateUserId(userId);
        } else {
            throw new AuthenticationError('Missing token or userId');
        }

        // Check canvas access
        const hasAccess = await CanvasService.checkAccess(canvasId, authenticatedUserId);
        if (!hasAccess) {
            throw new AuthenticationError('Access denied to canvas');
        }

        // Get or create user
        const user = await this.getOrCreateUser(authenticatedUserId, decodedToken, token);

        return {
            userId: authenticatedUserId,
            canvasId,
            user,
            token,
        };
    }

    /**
     * Get or create user based on authentication data
     */
    private static async getOrCreateUser(userId: string, decodedToken: any, token?: string): Promise<any> {
        let user: any;

        if (token && decodedToken) {
            // Production mode: get or create user from Supabase auth data
            const supabaseData = {
                uid: userId,
                email: decodedToken.email || 'user@example.com',
                name: decodedToken.user_metadata?.name || decodedToken.user_metadata?.full_name,
                picture: decodedToken.user_metadata?.avatar_url || decodedToken.user_metadata?.picture,
            };
            user = await UserService.getOrCreateFromSupabase(supabaseData);
        } else {
            // Development mode: find or create demo user
            user = await UserService.findBySupabaseId(userId);
            if (!user) {
                // Development mode: create user with demo data and unique username
                const timestamp = Date.now();
                const shortId = userId.substring(0, 8);
                user = await UserService.create({
                    id: userId,
                    username: `demo_user_${shortId}_${timestamp}`,
                    email: `demo_${shortId}@figna.com`,
                    displayName: 'Demo User',
                    avatarColor: '#3B82F6',
                });
            }
        }

        return user;
    }

    /**
     * Validate connection parameters
     */
    static validateConnectionParams(token?: string, userId?: string, canvasId?: string): void {
        if (!canvasId) {
            throw new ValidationError('Missing canvasId parameter');
        }

        if (!token && !userId) {
            throw new ValidationError('Missing token or userId parameter');
        }
    }
}


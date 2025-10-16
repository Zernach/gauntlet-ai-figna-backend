import { Router, Response } from 'express';
import { AuthRequest, enhancedAuthenticateUser } from '../middleware/enhancedAuth';
import { UserService } from '../services/UserService';
import { getCSRFTokenHandler } from '../middleware/csrfProtection';
import { refreshTokenHandler, getTokenInfoHandler } from '../utils/tokenRefresh';

const router = Router();

/**
 * GET /api/auth/csrf-token
 * Get CSRF token for authenticated user
 */
router.get('/csrf-token', enhancedAuthenticateUser, getCSRFTokenHandler);

/**
 * POST /api/auth/refresh
 * Validate token refresh
 */
router.post('/refresh', enhancedAuthenticateUser, refreshTokenHandler);

/**
 * GET /api/auth/token-info
 * Get token expiry information
 */
router.get('/token-info', enhancedAuthenticateUser, getTokenInfoHandler);

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', enhancedAuthenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Get or create user in database
        const user = await UserService.getOrCreateFromSupabase({
            uid: req.user.uid,
            email: req.user.email!,
            name: req.user.name,
        });

        // Update online status
        await UserService.updateOnlineStatus(user.id, true);

        return res.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                avatarColor: user.avatarColor,
                avatarUrl: user.avatarUrl,
                isOnline: true,
                preferences: user.preferences,
            },
        });
    } catch (error: any) {
        console.error('Get current user error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', enhancedAuthenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { username, displayName, avatarColor, avatarUrl, preferences } = req.body;

        const updatedUser = await UserService.update(req.user.uid, {
            username,
            displayName,
            avatarColor,
            avatarUrl,
            preferences,
        });

        return res.json({
            success: true,
            data: updatedUser,
        });
    } catch (error: any) {
        console.error('Update profile error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user (update online status)
 */
router.post('/logout', enhancedAuthenticateUser, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        await UserService.updateOnlineStatus(req.user.uid, false);

        return res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error: any) {
        console.error('Logout error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

export default router;


import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
    [key: string]: {
        count: number;
        resetTime: number;
    };
}

const store: RateLimitStore = {};

/**
 * Simple in-memory rate limiter
 * In production, use Redis-based rate limiter
 */
export function rateLimiter(options: {
    windowMs: number;
    maxRequests: number;
}) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const identifier = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();

        // Clean up old entries
        if (Math.random() < 0.01) { // 1% chance to cleanup
            Object.keys(store).forEach(key => {
                if (store[key].resetTime < now) {
                    delete store[key];
                }
            });
        }

        // Initialize or get current rate limit data
        if (!store[identifier] || store[identifier].resetTime < now) {
            store[identifier] = {
                count: 1,
                resetTime: now + options.windowMs,
            };
            return next();
        }

        // Increment request count
        store[identifier].count++;

        // Check if rate limit exceeded
        if (store[identifier].count > options.maxRequests) {
            const retryAfter = Math.ceil((store[identifier].resetTime - now) / 1000);

            res.status(429).json({
                error: 'Too Many Requests',
                message: 'Rate limit exceeded',
                retryAfter,
            });
            return;
        }

        next();
    };
}


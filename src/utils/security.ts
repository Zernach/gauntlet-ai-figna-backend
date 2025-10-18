import crypto from 'crypto';
import { Request } from 'express';

/**
 * Security utilities for authentication, validation, and protection
 */

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a value using SHA-256
 */
export function hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Create HMAC signature for request signing
 */
export function signRequest(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifySignature(data: string, signature: string, secret: string): boolean {
    const expectedSignature = signRequest(data, secret);
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: any): any {
    if (typeof input === 'string') {
        // Remove potential XSS vectors
        return input
            .replace(/[<>]/g, '') // Remove < and >
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, '') // Remove event handlers
            .trim();
    }

    if (Array.isArray(input)) {
        return input.map(sanitizeInput);
    }

    if (typeof input === 'object' && input !== null) {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(input)) {
            sanitized[sanitizeInput(key)] = sanitizeInput(value);
        }
        return sanitized;
    }

    return input;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Check if token is about to expire (within threshold)
 */
export function isTokenExpiringSoon(expiresAt: number, thresholdSeconds: number = 300): boolean {
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiresAt - now;
    return timeUntilExpiry <= thresholdSeconds && timeUntilExpiry > 0;
}

/**
 * Extract client IP address from request (handles proxies)
 */
export function getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = (forwarded as string).split(',');
        return ips[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limiting key generator
 */
export function generateRateLimitKey(identifier: string, action: string): string {
    return `ratelimit:${action}:${hashValue(identifier)}`;
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
    if (!origin) return true; // Allow requests with no origin (server-to-server, mobile apps)
    return allowedOrigins.includes(origin);
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: any): any {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'apikey', 'api_key', 'apiKey', 'authorization', 'bearer', 'openai'];

    if (typeof data === 'string') {
        // Mask API keys that start with common prefixes
        if (data.startsWith('sk-') || data.startsWith('pk-') || data.match(/^[A-Za-z0-9_-]{20,}$/)) {
            if (data.length > 8) {
                return data.substring(0, 4) + '***' + data.substring(data.length - 4);
            }
            return '***REDACTED***';
        }
        // Mask tokens and keys in strings
        return data.replace(/([a-zA-Z0-9_-]{20,})/g, (match) => {
            if (match.length > 8) {
                return match.substring(0, 4) + '***' + match.substring(match.length - 4);
            }
            return '***';
        });
    }

    if (Array.isArray(data)) {
        return data.map(maskSensitiveData);
    }

    if (typeof data === 'object' && data !== null) {
        const masked: any = {};
        for (const [key, value] of Object.entries(data)) {
            const lowerKey = key.toLowerCase();
            if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
                masked[key] = '***REDACTED***';
            } else {
                masked[key] = maskSensitiveData(value);
            }
        }
        return masked;
    }

    return data;
}

/**
 * Validate canvas ID format
 */
export function isValidCanvasId(canvasId: string): boolean {
    // Allow alphanumeric, hyphens, underscores (3-100 chars)
    const canvasIdRegex = /^[a-zA-Z0-9_-]{3,100}$/;
    return canvasIdRegex.test(canvasId);
}

/**
 * Validate shape data for potential attacks
 */
export function validateShapeData(shape: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!shape || typeof shape !== 'object') {
        errors.push('Shape must be an object');
        return { valid: false, errors };
    }

    // Check for extremely large coordinates (potential DoS)
    const maxCoordinate = 1000000;
    if (shape.x !== undefined && (Math.abs(shape.x) > maxCoordinate)) {
        errors.push('X coordinate out of bounds');
    }
    if (shape.y !== undefined && (Math.abs(shape.y) > maxCoordinate)) {
        errors.push('Y coordinate out of bounds');
    }
    if (shape.width !== undefined && (shape.width < 0 || shape.width > maxCoordinate)) {
        errors.push('Width out of bounds');
    }
    if (shape.height !== undefined && (shape.height < 0 || shape.height > maxCoordinate)) {
        errors.push('Height out of bounds');
    }

    // Validate text content length (prevent DoS)
    if (shape.textContent && typeof shape.textContent === 'string') {
        if (shape.textContent.length > 10000) {
            errors.push('Text content too long (max 10,000 characters)');
        }
    }

    // Validate shape type
    const validTypes = ['rectangle', 'circle', 'text'];
    if (shape.type && !validTypes.includes(shape.type)) {
        errors.push('Invalid shape type');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Check if user is making too many requests (simple in-memory check)
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRequestLimit(
    identifier: string,
    maxRequests: number,
    windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const key = hashValue(identifier);
    const record = requestCounts.get(key);

    if (!record || now > record.resetAt) {
        // New window
        const resetAt = now + windowMs;
        requestCounts.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: maxRequests - 1, resetAt };
    }

    if (record.count >= maxRequests) {
        return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count++;
    return { allowed: true, remaining: maxRequests - record.count, resetAt: record.resetAt };
}

/**
 * Clean up old rate limit records (call periodically)
 */
export function cleanupRateLimitRecords(): void {
    const now = Date.now();
    for (const [key, record] of requestCounts.entries()) {
        if (now > record.resetAt) {
            requestCounts.delete(key);
        }
    }
}

// Clean up every 5 minutes
setInterval(cleanupRateLimitRecords, 5 * 60 * 1000);


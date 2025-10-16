import { Request } from 'express';
import { getClientIP, maskSensitiveData } from './security';

/**
 * Security event logger for tracking authentication, authorization, and security-related events
 */

export enum SecurityEventType {
    AUTH_SUCCESS = 'AUTH_SUCCESS',
    AUTH_FAILURE = 'AUTH_FAILURE',
    AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
    AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
    AUTH_MISSING_TOKEN = 'AUTH_MISSING_TOKEN',

    ACCESS_GRANTED = 'ACCESS_GRANTED',
    ACCESS_DENIED = 'ACCESS_DENIED',

    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',

    INVALID_INPUT = 'INVALID_INPUT',
    VALIDATION_ERROR = 'VALIDATION_ERROR',

    WS_CONNECTION_SUCCESS = 'WS_CONNECTION_SUCCESS',
    WS_CONNECTION_FAILURE = 'WS_CONNECTION_FAILURE',
    WS_INVALID_MESSAGE = 'WS_INVALID_MESSAGE',

    SHAPE_LOCK_VIOLATION = 'SHAPE_LOCK_VIOLATION',
    CANVAS_ACCESS_DENIED = 'CANVAS_ACCESS_DENIED',
}

export interface SecurityEvent {
    type: SecurityEventType;
    timestamp: string;
    userId?: string;
    ip: string;
    userAgent?: string;
    path?: string;
    method?: string;
    message: string;
    metadata?: Record<string, any>;
}

class SecurityLogger {
    private enabled: boolean;
    private events: SecurityEvent[] = [];
    private maxEvents: number = 1000;

    constructor() {
        this.enabled = process.env.SECURITY_LOGGING_ENABLED !== 'false';
    }

    /**
     * Log a security event
     */
    log(event: Omit<SecurityEvent, 'timestamp'>): void {
        if (!this.enabled) return;

        const securityEvent: SecurityEvent = {
            ...event,
            timestamp: new Date().toISOString(),
        };

        // Mask sensitive data
        if (securityEvent.metadata) {
            securityEvent.metadata = maskSensitiveData(securityEvent.metadata);
        }

        // Add to in-memory storage (with rotation)
        this.events.push(securityEvent);
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }

        // Log to console (in production, you'd send to a logging service)
        this.logToConsole(securityEvent);
    }

    /**
     * Log from Express request
     */
    logFromRequest(
        req: Request,
        type: SecurityEventType,
        message: string,
        userId?: string,
        metadata?: Record<string, any>
    ): void {
        this.log({
            type,
            userId,
            ip: getClientIP(req),
            userAgent: req.headers['user-agent'],
            path: req.path,
            method: req.method,
            message,
            metadata,
        });
    }

    /**
     * Log authentication success
     */
    logAuthSuccess(req: Request, userId: string): void {
        this.logFromRequest(
            req,
            SecurityEventType.AUTH_SUCCESS,
            'User authenticated successfully',
            userId
        );
    }

    /**
     * Log authentication failure
     */
    logAuthFailure(req: Request, reason: string, metadata?: Record<string, any>): void {
        this.logFromRequest(
            req,
            SecurityEventType.AUTH_FAILURE,
            `Authentication failed: ${reason}`,
            undefined,
            metadata
        );
    }

    /**
     * Log rate limit exceeded
     */
    logRateLimitExceeded(req: Request, userId?: string): void {
        this.logFromRequest(
            req,
            SecurityEventType.RATE_LIMIT_EXCEEDED,
            'Rate limit exceeded',
            userId
        );
    }

    /**
     * Log access denied
     */
    logAccessDenied(req: Request, resource: string, userId?: string): void {
        this.logFromRequest(
            req,
            SecurityEventType.ACCESS_DENIED,
            `Access denied to ${resource}`,
            userId
        );
    }

    /**
     * Log suspicious activity
     */
    logSuspiciousActivity(
        req: Request,
        description: string,
        userId?: string,
        metadata?: Record<string, any>
    ): void {
        this.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            description,
            userId,
            metadata
        );
    }

    /**
     * Log WebSocket connection
     */
    logWSConnection(
        type: SecurityEventType,
        message: string,
        userId?: string,
        ip?: string,
        metadata?: Record<string, any>
    ): void {
        this.log({
            type,
            userId,
            ip: ip || 'unknown',
            message,
            metadata,
        });
    }

    /**
     * Get recent security events (for monitoring)
     */
    getRecentEvents(limit: number = 100): SecurityEvent[] {
        return this.events.slice(-limit);
    }

    /**
     * Get events by type
     */
    getEventsByType(type: SecurityEventType, limit: number = 100): SecurityEvent[] {
        return this.events
            .filter(event => event.type === type)
            .slice(-limit);
    }

    /**
     * Get events by user
     */
    getEventsByUser(userId: string, limit: number = 100): SecurityEvent[] {
        return this.events
            .filter(event => event.userId === userId)
            .slice(-limit);
    }

    /**
     * Clear all events (for testing)
     */
    clear(): void {
        this.events = [];
    }

    /**
     * Output to console with appropriate severity
     */
    private logToConsole(event: SecurityEvent): void {
        const logLevel = this.getLogLevel(event.type);
        const logMessage = this.formatLogMessage(event);

        switch (logLevel) {
            case 'error':
                console.error(logMessage);
                break;
            case 'warn':
                console.warn(logMessage);
                break;
            case 'info':
            default:
                console.log(logMessage);
                break;
        }
    }

    /**
     * Determine log level based on event type
     */
    private getLogLevel(type: SecurityEventType): 'info' | 'warn' | 'error' {
        const errorEvents = [
            SecurityEventType.AUTH_FAILURE,
            SecurityEventType.ACCESS_DENIED,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            SecurityEventType.WS_CONNECTION_FAILURE,
            SecurityEventType.SHAPE_LOCK_VIOLATION,
            SecurityEventType.CANVAS_ACCESS_DENIED,
        ];

        const warnEvents = [
            SecurityEventType.AUTH_TOKEN_EXPIRED,
            SecurityEventType.AUTH_TOKEN_INVALID,
            SecurityEventType.RATE_LIMIT_EXCEEDED,
            SecurityEventType.INVALID_INPUT,
            SecurityEventType.VALIDATION_ERROR,
            SecurityEventType.WS_INVALID_MESSAGE,
        ];

        if (errorEvents.includes(type)) return 'error';
        if (warnEvents.includes(type)) return 'warn';
        return 'info';
    }

    /**
     * Format log message for output
     */
    private formatLogMessage(event: SecurityEvent): string {
        const parts = [
            `[SECURITY]`,
            `[${event.type}]`,
            event.timestamp,
            event.message,
        ];

        if (event.userId) parts.push(`user=${event.userId}`);
        if (event.ip) parts.push(`ip=${event.ip}`);
        if (event.path) parts.push(`path=${event.path}`);
        if (event.metadata) parts.push(`metadata=${JSON.stringify(event.metadata)}`);

        return parts.join(' ');
    }
}

// Export singleton instance
export const securityLogger = new SecurityLogger();


/**
 * Custom error classes for better error handling
 */

export class AppError extends Error {
    constructor(
        public message: string,
        public statusCode: number = 500,
        public code?: string
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, public details?: any) {
        super(message, 400, 'VALIDATION_ERROR');
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Access denied') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409, 'CONFLICT_ERROR');
    }
}

export class WebSocketError extends AppError {
    constructor(message: string, public wsCode?: number) {
        super(message, 500, 'WEBSOCKET_ERROR');
    }
}

export class DatabaseError extends AppError {
    constructor(message: string, public originalError?: any) {
        super(message, 500, 'DATABASE_ERROR');
    }
}

/**
 * Error response formatter
 */
export function formatErrorResponse(error: unknown): {
    error: string;
    code?: string;
    details?: any;
    statusCode: number;
} {
    if (error instanceof AppError) {
        return {
            error: error.message,
            code: error.code,
            details: (error as any).details,
            statusCode: error.statusCode,
        };
    }

    if (error instanceof Error) {
        return {
            error: error.message,
            statusCode: 500,
        };
    }

    return {
        error: 'An unexpected error occurred',
        statusCode: 500,
    };
}

/**
 * Check if error is operational (expected) vs programming error
 */
export function isOperationalError(error: unknown): boolean {
    return error instanceof AppError;
}


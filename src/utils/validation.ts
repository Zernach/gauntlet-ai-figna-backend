/**
 * Validation utilities for WebSocket messages and API requests
 */

import { ValidationError } from './errors';
import { WS_MESSAGE_TYPES } from '../config/constants';

/**
 * Validate WebSocket message structure
 */
export function validateWSMessage(data: any): void {
    if (!data || typeof data !== 'object') {
        throw new ValidationError('Invalid message format');
    }

    if (!data.type || typeof data.type !== 'string') {
        throw new ValidationError('Message type is required');
    }

    const validTypes = Object.values(WS_MESSAGE_TYPES);
    if (!validTypes.includes(data.type)) {
        throw new ValidationError(`Invalid message type: ${data.type}`);
    }
}

/**
 * Validate shape data for creation
 */
export function validateShapeCreate(data: any): void {
    if (!data || typeof data !== 'object') {
        throw new ValidationError('Invalid shape data');
    }

    // Type validation
    const validTypes = ['rectangle', 'circle', 'text', 'line', 'polygon', 'image'];
    if (!data.type || !validTypes.includes(data.type)) {
        throw new ValidationError(`Invalid shape type: ${data.type}`);
    }

    // Position validation
    if (typeof data.x !== 'number' || typeof data.y !== 'number') {
        throw new ValidationError('Shape position (x, y) must be numbers');
    }

    // Type-specific validation
    switch (data.type) {
        case 'rectangle':
            if (typeof data.width !== 'number' || typeof data.height !== 'number') {
                throw new ValidationError('Rectangle requires width and height');
            }
            if (data.width <= 0 || data.height <= 0) {
                throw new ValidationError('Rectangle dimensions must be positive');
            }
            break;

        case 'circle':
            if (typeof data.radius !== 'number') {
                throw new ValidationError('Circle requires radius');
            }
            if (data.radius <= 0) {
                throw new ValidationError('Circle radius must be positive');
            }
            break;

        case 'text':
            if (!data.textContent || typeof data.textContent !== 'string') {
                throw new ValidationError('Text shape requires textContent');
            }
            break;
    }

    // Color validation (optional, but if present must be valid)
    if (data.color && !isValidColor(data.color)) {
        throw new ValidationError(`Invalid color format: ${data.color}`);
    }
}

/**
 * Validate shape update data
 */
export function validateShapeUpdate(data: any): void {
    if (!data || typeof data !== 'object') {
        throw new ValidationError('Invalid update data');
    }

    // Validate individual fields if present
    if (data.x !== undefined && typeof data.x !== 'number') {
        throw new ValidationError('x position must be a number');
    }

    if (data.y !== undefined && typeof data.y !== 'number') {
        throw new ValidationError('y position must be a number');
    }

    if (data.width !== undefined && (typeof data.width !== 'number' || data.width <= 0)) {
        throw new ValidationError('width must be a positive number');
    }

    if (data.height !== undefined && (typeof data.height !== 'number' || data.height <= 0)) {
        throw new ValidationError('height must be a positive number');
    }

    if (data.radius !== undefined && (typeof data.radius !== 'number' || data.radius <= 0)) {
        throw new ValidationError('radius must be a positive number');
    }

    if (data.borderRadius !== undefined && (typeof data.borderRadius !== 'number' || data.borderRadius < 0)) {
        throw new ValidationError('borderRadius must be a non-negative number');
    }

    if (data.rotation !== undefined && typeof data.rotation !== 'number') {
        throw new ValidationError('rotation must be a number');
    }

    if (data.opacity !== undefined && (typeof data.opacity !== 'number' || data.opacity < 0 || data.opacity > 1)) {
        throw new ValidationError('opacity must be a number between 0 and 1');
    }

    if (data.color !== undefined && !isValidColor(data.color)) {
        throw new ValidationError(`Invalid color format: ${data.color}`);
    }
}

/**
 * Validate cursor position
 */
export function validateCursorPosition(data: any): void {
    if (!data || typeof data !== 'object') {
        throw new ValidationError('Invalid cursor data');
    }

    if (typeof data.x !== 'number' || typeof data.y !== 'number') {
        throw new ValidationError('Cursor position (x, y) must be numbers');
    }

    // Optional: validate bounds
    if (data.x < 0 || data.y < 0) {
        throw new ValidationError('Cursor position must be non-negative');
    }
}

/**
 * Validate canvas ID
 */
export function validateCanvasId(canvasId: any): void {
    if (!canvasId || typeof canvasId !== 'string') {
        throw new ValidationError('Canvas ID is required and must be a string');
    }

    // UUID validation (basic)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(canvasId)) {
        throw new ValidationError('Invalid canvas ID format');
    }
}

/**
 * Validate user ID
 */
export function validateUserId(userId: any): void {
    if (!userId || typeof userId !== 'string') {
        throw new ValidationError('User ID is required and must be a string');
    }

    // UUID validation (basic)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
        throw new ValidationError('Invalid user ID format');
    }
}

/**
 * Validate color string (hex format)
 */
function isValidColor(color: string): boolean {
    // Hex color: #RGB or #RRGGBB or #RRGGBBAA
    const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
    return hexRegex.test(color);
}

/**
 * Sanitize string input (prevent XSS)
 */
export function sanitizeString(input: string): string {
    return input
        .replace(/[<>]/g, '') // Remove < and >
        .trim()
        .substring(0, 1000); // Limit length
}

/**
 * Validate batch update array
 */
export function validateBatchUpdate(updates: any): void {
    if (!Array.isArray(updates)) {
        throw new ValidationError('Batch updates must be an array');
    }

    if (updates.length === 0) {
        throw new ValidationError('Batch updates array cannot be empty');
    }

    if (updates.length > 100) {
        throw new ValidationError('Batch updates limited to 100 items');
    }

    updates.forEach((update, index) => {
        if (!update.id || typeof update.id !== 'string') {
            throw new ValidationError(`Update at index ${index} missing valid id`);
        }

        if (!update.data || typeof update.data !== 'object') {
            throw new ValidationError(`Update at index ${index} missing valid data`);
        }

        try {
            validateShapeUpdate(update.data);
        } catch (error) {
            throw new ValidationError(`Update at index ${index}: ${(error as Error).message}`);
        }
    });
}


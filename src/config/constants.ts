/**
 * Application-wide constants
 * Centralized configuration values
 */

export const APP_CONFIG = {
    // Server Configuration
    PORT: parseInt(process.env.PORT || '3001'),
    HOST: process.env.HOST || '0.0.0.0',
    NODE_ENV: process.env.NODE_ENV || 'development',

    // WebSocket Configuration
    WS_PATH: '/ws',
    WS_HEARTBEAT_INTERVAL: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000'),
    WS_HEARTBEAT_TIMEOUT: parseInt(process.env.WS_HEARTBEAT_TIMEOUT || '60000'),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),

    // CORS Configuration
    CORS_ORIGINS: [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8081',
        'http://localhost:19006',
        'https://figna.archlife.org'
    ],

    // Performance Optimization
    BATCH_INTERVAL_MS: 16, // ~60fps batching
    CURSOR_THROTTLE_MS: 25, // 40fps for cursors
    SHAPE_THROTTLE_MS: 33, // 30fps for shape updates

    // Lock Configuration
    SHAPE_LOCK_TIMEOUT_MS: 5000, // 5 seconds
    AUTO_UNLOCK_CHECK_INTERVAL_MS: 1000, // Check every second

    // Presence Configuration
    PRESENCE_TTL_SECONDS: 30,
    PRESENCE_CLEANUP_INTERVAL_MS: 60000, // 1 minute

    // Cache Configuration
    CANVAS_CACHE_SIZE: 10,
    CANVAS_CACHE_TTL_MS: 30000, // 30 seconds
    SHAPES_CACHE_SIZE: 50,
    SHAPES_CACHE_TTL_MS: 5000, // 5 seconds
    SHAPE_CACHE_SIZE: 200,
    SHAPE_CACHE_TTL_MS: 3000, // 3 seconds

    // Body Parser Limits
    BODY_PARSER_LIMIT: '10mb',
} as const;

export const NEON_COLORS = [
    '#24ccff',
    '#fbff00',
    '#ff69b4',
    '#00ffff',
    '#ff00ff',
    '#ff0080',
    '#80ff00',
    '#ff8000',
    '#0080ff',
    '#ff0040',
    '#40ff00',
    '#00ff80',
    '#8000ff'
] as const;

export const WS_MESSAGE_TYPES = {
    // Connection
    PING: 'PING',
    PONG: 'PONG',
    ERROR: 'ERROR',

    // Canvas Sync
    CANVAS_SYNC: 'CANVAS_SYNC',
    CANVAS_SYNC_REQUEST: 'CANVAS_SYNC_REQUEST',
    CANVAS_UPDATE: 'CANVAS_UPDATE',

    // Shapes
    SHAPE_CREATE: 'SHAPE_CREATE',
    SHAPE_UPDATE: 'SHAPE_UPDATE',
    SHAPE_DELETE: 'SHAPE_DELETE',
    SHAPES_BATCH_UPDATE: 'SHAPES_BATCH_UPDATE',

    // Cursor & Presence
    CURSOR_MOVE: 'CURSOR_MOVE',
    PRESENCE_UPDATE: 'PRESENCE_UPDATE',
    ACTIVE_USERS: 'ACTIVE_USERS',

    // User Events
    USER_JOIN: 'USER_JOIN',
    USER_LEAVE: 'USER_LEAVE',

    // Reconnection
    RECONNECT_REQUEST: 'RECONNECT_REQUEST',
} as const;

export type WSMessageType = typeof WS_MESSAGE_TYPES[keyof typeof WS_MESSAGE_TYPES];


import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { testDatabaseConnection, closeDatabaseConnection } from './config/database';
import { initializeSupabase } from './config/supabase';
import { WebSocketServer } from './websocket/WebSocketServer';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import routes from './routes';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Application = express();
const PORT = parseInt(process.env.PORT || '3001');
const WS_PORT = parseInt(process.env.WS_PORT || '3002');
const HOST = process.env.HOST || '0.0.0.0';

// WebSocket server instance
let wsServer: WebSocketServer;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : true; // In development, allow all origins

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

console.log('🔒 CORS configuration:', corsOrigins === true ? 'All origins allowed (development)' : `Specific origins: ${corsOrigins}`);

app.use(compression() as any);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Rate limiting
app.use(rateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
}));

// Routes
app.use('/api', routes);

// WebSocket stats endpoint
app.get('/api/ws/stats', (req, res) => {
    if (wsServer) {
        const stats = wsServer.getStats();
        res.json({
            success: true,
            data: stats,
        });
    } else {
        res.status(503).json({
            error: 'WebSocket server not initialized',
        });
    }
});

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Close WebSocket server
    if (wsServer) {
        console.log('Closing WebSocket server...');
        wsServer.close();
    }

    // Close database connections
    await closeDatabaseConnection();

    // Exit process
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Start server
async function startServer(): Promise<void> {
    try {
        console.log('🚀 Starting CollabCanvas Backend Server...\n');

        // Initialize Supabase
        console.log('🔥 Initializing Supabase...');
        try {
            initializeSupabase();
        } catch (error) {
            console.warn('⚠️ Supabase initialization failed (continuing without auth)');
        }

        // Test database connection
        console.log('🗄️  Testing database connection...');
        const dbConnected = await testDatabaseConnection();
        if (!dbConnected) {
            console.error('❌ Database connection failed. Exiting...');
            process.exit(1);
        }

        // Start HTTP server
        app.listen(PORT, HOST, () => {
            console.log(`\n✅ HTTP Server running on http://${HOST}:${PORT}`);
            console.log(`📡 API Base URL: http://${HOST}:${PORT}/api`);
            console.log(`❤️  Health Check: http://${HOST}:${PORT}/api/health\n`);
        });

        // Start WebSocket server
        console.log('🔌 Starting WebSocket server...');
        wsServer = new WebSocketServer(WS_PORT);
        console.log(`✅ WebSocket Server running on ws://${HOST}:${WS_PORT}\n`);

        console.log('='.repeat(60));
        console.log('🎨 CollabCanvas Backend - Ready for Connections!');
        console.log('='.repeat(60));
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`HTTP Port: ${PORT}`);
        console.log(`WebSocket Port: ${WS_PORT}`);
        console.log('='.repeat(60));
        console.log('\n📚 Available Endpoints:');
        console.log('  GET    /api           - API info');
        console.log('  GET    /api/health    - Health check');
        console.log('  GET    /api/auth/me   - Get current user');
        console.log('  POST   /api/canvas    - Create canvas');
        console.log('  GET    /api/canvas    - List canvases');
        console.log('  WS     ws://...       - WebSocket connection');
        console.log('='.repeat(60) + '\n');

    } catch (error: any) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Start the server
startServer();

export default app;


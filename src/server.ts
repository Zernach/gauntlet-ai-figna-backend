import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer, Server as HTTPServer } from 'http';
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
const HOST = process.env.HOST || '0.0.0.0';

// HTTP and WebSocket server instances
let httpServer: HTTPServer;
let wsServer: WebSocketServer;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOrigins = ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8081', 'http://localhost:19006', 'https://figna.archlife.org']; // Development origins

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
        if (!origin) {
            return callback(null, true);
        }

        // If corsOrigins is an array, check if the origin is allowed
        if (Array.isArray(corsOrigins)) {
            if (corsOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.warn(`⚠️  CORS blocked request from origin: ${origin}`);
                callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
        } else {
            // Allow all origins if corsOrigins is true
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
}));

console.log('🔒 CORS configuration:', Array.isArray(corsOrigins) ? `Allowed origins: ${corsOrigins.join(', ')}` : 'All origins allowed');

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
        console.log('🚀 Starting Figna Backend Server...\n');

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

        // Create HTTP server
        httpServer = createServer(app);

        // Start HTTP server
        httpServer.listen(PORT, HOST, () => {
            console.log(`\n✅ HTTP Server running on http://${HOST}:${PORT}`);
            console.log(`📡 API Base URL: http://${HOST}:${PORT}/api`);
            console.log(`❤️  Health Check: http://${HOST}:${PORT}/api/health\n`);
        });

        // Attach WebSocket server to HTTP server
        console.log('🔌 Attaching WebSocket server...');
        wsServer = new WebSocketServer(httpServer);
        console.log(`✅ WebSocket Server attached on ws://${HOST}:${PORT}/ws\n`);

        console.log('='.repeat(60));
        console.log('🎨 Figna Backend - Ready for Connections!');
        console.log('='.repeat(60));
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`HTTP/WS Port: ${PORT}`);
        console.log('='.repeat(60));
        console.log('\n📚 Available Endpoints:');
        console.log('  GET    /api           - API info');
        console.log('  GET    /api/health    - Health check');
        console.log('  GET    /api/auth/me   - Get current user');
        console.log('  POST   /api/canvas    - Create canvas');
        console.log('  GET    /api/canvas    - List canvases');
        console.log('  WS     ws://host/ws   - WebSocket connection');
        console.log('='.repeat(60) + '\n');

    } catch (error: any) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Start the server
startServer();

export default app;


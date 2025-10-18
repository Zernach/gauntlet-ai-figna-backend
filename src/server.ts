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
                callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
        } else {
            // Allow all origins if corsOrigins is true
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-csrf-token'],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-Token-Expiring'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
}));

app.use(compression() as any);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging - with sensitive data filtering
morgan.token('safe-body', (req: any) => {
    if (req.body) {
        const body = { ...req.body };
        // Redact sensitive fields
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'authorization'];
        sensitiveFields.forEach(field => {
            if (body[field]) body[field] = '***REDACTED***';
        });
        return JSON.stringify(body);
    }
    return '-';
});

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
    // Close WebSocket server
    if (wsServer) {
        wsServer.close();
    }

    // Close database connections
    await closeDatabaseConnection();

    // Exit process
    process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
    process.exit(1);
});

// Start server
async function startServer(): Promise<void> {
    try {
        // Initialize Supabase
        try {
            initializeSupabase();
        } catch (error) {
            // Supabase initialization failed
        }

        // Test database connection
        const dbConnected = await testDatabaseConnection();
        if (!dbConnected) {
            process.exit(1);
        }

        // Create HTTP server
        httpServer = createServer(app);

        // Start HTTP server
        httpServer.listen(PORT, HOST, () => {
            // Server started
        });

        // Attach WebSocket server to HTTP server
        wsServer = new WebSocketServer(httpServer);

    } catch (error: any) {
        process.exit(1);
    }
}

// Start the server
startServer();

export default app;


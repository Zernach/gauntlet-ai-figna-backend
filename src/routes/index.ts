import { Router } from 'express';
import authRoutes from './auth.routes';
import canvasRoutes from './canvas.routes';
import voiceRoutes from './voice.routes';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// API version
router.get('/', (req, res) => {
    res.json({
        name: 'Figna API',
        version: '1.0.0',
        description: 'Real-time collaborative design canvas backend',
        endpoints: {
            auth: '/api/auth',
            canvas: '/api/canvas',
            websocket: process.env.WS_PORT ? `ws://localhost:${process.env.WS_PORT}` : 'ws://localhost:3002',
        },
    });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/canvas', canvasRoutes);
router.use('/voice', voiceRoutes);

export default router;


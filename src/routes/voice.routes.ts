import { Router, Response } from 'express';
import { authenticateUser, AuthRequest } from '../middleware/auth';

const router = Router();

interface OpenAIRealtimeSession {
    id: string;
    url?: string;
    client_secret?: {
        value: string;
        expires_at: number;
    };
    expires_at?: number;
}

// POST /api/voice/relay - Generate a one-time relay URL for OpenAI Realtime API
router.post('/relay', authenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const OPENAI_API_KEY = process.env.GAUNTLET_OPEN_AI_API_KEY_1;

        if (!OPENAI_API_KEY) {
            res.status(500).json({
                error: 'OpenAI API key not configured',
            });
            return;
        }

        // Call OpenAI to generate a relay session
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview-2024-12-17',
                voice: 'alloy',
                instructions: `You are a voice agent helping users with a collaborative design canvas platform. You can create, modify, and delete shapes on the canvas.

DATABASE SCHEMA - Canvas Objects (shapes):
- type: 'rectangle' | 'circle' | 'text' | 'line' | 'polygon' | 'image'
- x, y: position coordinates (numbers)
- width, height: dimensions (numbers, optional for circles)
- radius: circle radius (number, required for circles)
- rotation: rotation in degrees (number, default 0)
- color: fill color (hex string with alpha, e.g., '#FF0000FF' or '#FF0000')
- strokeColor: outline color (hex string, optional)
- strokeWidth: outline width (number, default 0)
- opacity: transparency 0-1 (number, default 1.0)
- shadowColor: shadow color (hex string, optional)
- shadowStrength: shadow intensity (number, default 0)
- textContent: text content (string, for text type)
- fontSize: text size (number, for text type)
- fontFamily: font name (string, default 'Inter')
- fontWeight: 'normal' | 'bold' | etc. (default 'normal')
- textAlign: 'left' | 'center' | 'right' (default 'left')
- zIndex: layer order (number, higher = on top)
- isVisible: visibility (boolean, default true)

RESPONSE FORMAT:
When users ask to create or modify shapes, provide structured responses that include:
1. Action type: "create", "update", or "delete"
2. Shape properties in a clear JSON-like format
3. Specific values for all required fields

Example responses:
- "I'll create a red rectangle for you. Position: x=100, y=150, width=200, height=150, color=#FF0000"
- "I'll update that circle to be blue. Changes: color=#0000FF, radius=80"
- "I'll add text that says 'Hello World'. Position: x=50, y=50, fontSize=24, color=#FFFFFF, textContent='Hello World'"

BEST PRACTICES:
- Always specify numeric coordinates and dimensions
- Use hex color codes (with or without alpha channel)
- For rectangles: require x, y, width, height, color
- For circles: require x, y, radius, color
- For text: require x, y, textContent, fontSize, color
- Be conversational but include all technical details needed for shape creation
- When users request changes, clearly state what will be modified

Your responses should be natural and conversational while ensuring all necessary technical information is provided for successful shape operations.`,
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenAI API error:', errorData);
            res.status(response.status).json({
                error: 'Failed to create OpenAI relay session',
                details: errorData,
            });
            return;
        }

        const data = await response.json() as OpenAIRealtimeSession;
        const returned = {
            relayUrl: data.client_secret?.value || data.url,
            sessionId: data.id,
            expiresAt: data.client_secret?.expires_at || data.expires_at,
        }
        console.log('returned', returned)
        res.json(returned);
    } catch (error) {
        console.error('Error generating voice relay URL:', error);
        res.status(500).json({
            error: 'Failed to generate voice relay URL',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;


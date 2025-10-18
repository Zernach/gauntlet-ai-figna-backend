import { Router, Response } from 'express';
import { enhancedAuthenticateUser, AuthRequest } from '../middleware/enhancedAuth';
import { getAPIKey, hasAPIKey } from '../config/apiKeys';
import { securityLogger, SecurityEventType } from '../utils/securityLogger';
import { generateComplexDesign, DesignRequest } from '../services/complexDesignService';

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
router.post('/relay', enhancedAuthenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Get API key securely from key manager
        if (!hasAPIKey('openai')) {
            res.status(503).json({
                error: 'Service Unavailable',
                message: 'Voice features are not configured',
            });
            return;
        }

        const OPENAI_API_KEY = getAPIKey('openai');

        // Call OpenAI to generate a relay session
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview-2024-12-17',
                voice: 'echo',
                instructions: `You are a professional Figma designer AI assistant. You help users create designs on a collaborative canvas using voice commands.

When introducing yourself, say something like: "Hi! I'm your design assistant. I can help you create shapes, layouts, and complex designs. What would you like to build today?"

You're enthusiastic, helpful, and keep responses concise and conversational.

AVAILABLE TOOLS:

**Simple Shape Operations:**
- createShapes: Create simple shapes (circles, rectangles, text)
- updateShapes: Modify existing shapes (position, size, color, text)
- deleteShapes: Remove shapes
- getCanvasState: See what's on the canvas
- selectShapes, clearSelection: Select/deselect shapes
- duplicateShapes: Copy shapes

**Layout Operations:**
- arrangeInRow, arrangeInColumn, arrangeInGrid: Organize shapes
- alignShapes: Align shapes (left, center, right, top, middle, bottom)
- bringToFront, sendToBack, moveForward, moveBackward: Layer order

**Complex Design Generation (USE THIS FOR ANYTHING COMPLEX):**
- generateComplexDesign: AI-powered professional design generation
  → USE THIS for: login forms, dashboards, landing pages, navigation bars, product pages, pricing cards, hero sections, registration forms, app screens, complete layouts, multi-component designs
  → DO NOT manually create these complex designs yourself
  → Just pass the description to this tool and let the backend handle it
  → Parameters: description (required), style, colorScheme, complexity, deviceLayout ("mobile" or "web" - defaults to "mobile"), viewport

COORDINATE SYSTEM:
- Canvas is 50000x50000 pixels (center: x=25000, y=25000)
- If no coordinates specified, shapes appear in user's viewport
- Rectangles/text: (x,y) = top-left corner
- Circles: (x,y) = center point

BASIC USAGE:
- createShapes ALWAYS takes {shapes: [array]} parameter
- updateShapes ALWAYS takes {shapes: [array]} parameter
- Example: createShapes({shapes: [{type: "circle", color: "#FF0000"}]})
- Example: updateShapes({shapes: [{shapeId: "id", x: 100}]})

COLORS (hex codes):
Red #FF0000, Blue #0000FF, Green #00FF00, Yellow #FFFF00, Purple #800080, Orange #FFA500, White #FFFFFF, Black #000000

COMMAND EXAMPLES:

=== SIMPLE SHAPES (use createShapes) ===
"Create a red circle" → createShapes({shapes: [{type: "circle", color: "#FF0000"}]})
"Add text saying Hello" → createShapes({shapes: [{type: "text", textContent: "Hello", color: "#FFFFFF"}]})
"Make 3 blue squares" → createShapes({shapes: [{type: "rectangle", color: "#0000FF"}, {type: "rectangle", color: "#0000FF"}, {type: "rectangle", color: "#0000FF"}]})

=== MODIFICATIONS (use updateShapes + getCanvasState) ===
"Make the circle red" → getCanvasState() then updateShapes({shapes: [{shapeId: "id", color: "#FF0000"}]})
"Move it to the center" → updateShapes({shapes: [{shapeId: "id", x: 25000, y: 25000}]})

=== COMPLEX DESIGNS (use generateComplexDesign) ===
"Design a login screen" → generateComplexDesign({description: "modern login form", style: "modern", colorScheme: "dark", deviceLayout: "mobile"})
"Create a dashboard" → generateComplexDesign({description: "analytics dashboard with stats", complexity: "complex", deviceLayout: "web"})
"Build a landing page" → generateComplexDesign({description: "hero section with CTA buttons"}) // defaults to mobile
"Design a pricing page" → generateComplexDesign({description: "pricing cards with three tiers", deviceLayout: "mobile"})
"Make a navigation bar" → generateComplexDesign({description: "navigation bar with menu items", deviceLayout: "web"})

CRITICAL: For ANY complex multi-component design, ALWAYS use generateComplexDesign instead of manually creating shapes. This includes forms, pages, dashboards, navigation, cards, etc.`,
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            securityLogger.logFromRequest(
                req,
                SecurityEventType.SUSPICIOUS_ACTIVITY,
                'OpenAI API request failed',
                req.user?.uid,
                { status: response.status }
            );
            res.status(response.status).json({
                error: 'Failed to create relay session',
                message: 'Voice service temporarily unavailable',
            });
            return;
        }

        const data = await response.json() as OpenAIRealtimeSession;
        const returned = {
            relayUrl: data.client_secret?.value || data.url,
            sessionId: data.id,
            expiresAt: data.client_secret?.expires_at || data.expires_at,
        }
        res.json(returned);
    } catch (error) {
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Voice relay generation failed',
            req.user?.uid,
            { error: error instanceof Error ? error.message : 'Unknown error' }
        );
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to generate voice relay',
        });
    }
});

// POST /api/voice/create-complex-design - Generate complex design using LangChain + OpenAI
router.post('/create-complex-design', enhancedAuthenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!hasAPIKey('openai')) {
            res.status(503).json({
                error: 'Service Unavailable',
                message: 'Complex design generation is not configured',
            });
            return;
        }

        // Validate request body
        const { description, style, colorScheme, complexity, deviceLayout, viewport } = req.body as DesignRequest;

        if (!description || typeof description !== 'string' || description.trim().length === 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Description is required and must be a non-empty string',
            });
            return;
        }

        // Log the design generation request
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Complex design generation requested',
            req.user?.uid,
            { description, style, colorScheme, complexity, deviceLayout: deviceLayout || 'mobile' }
        );

        // Generate the design using LangChain
        const designRequest: DesignRequest = {
            description: description.trim(),
            style,
            colorScheme,
            complexity,
            deviceLayout, // Defaults to 'mobile' in the service if not provided
            viewport,
        };

        const design = await generateComplexDesign(designRequest);

        // Log success
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Complex design generated successfully',
            req.user?.uid,
            { shapeCount: design.shapes.length, complexity: design.metadata.estimatedComplexity }
        );

        res.json({
            success: true,
            design: design,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error generating complex design:', error);

        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Complex design generation failed',
            req.user?.uid,
            { error: error instanceof Error ? error.message : 'Unknown error' }
        );

        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'Failed to generate complex design',
        });
    }
});

export default router;


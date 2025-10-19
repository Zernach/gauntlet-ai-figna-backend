import { Router, Response } from 'express';
import { enhancedAuthenticateUser, AuthRequest } from '../middleware/enhancedAuth';
import { getAPIKey, hasAPIKey } from '../config/apiKeys';
import { securityLogger, SecurityEventType } from '../utils/securityLogger';
import { generateComplexDesign, generateDesignVariation, DesignRequest, ShapeSpec } from '../services/complexDesignService';
import {
    generateImage,
    generateImages,
    ImageGenerationRequest
} from '../services/imageGenerationService';

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

**Design Variations (USE THIS TO MODIFY EXISTING DESIGNS):**
- generateDesignVariation: Modify the current canvas design with AI
  → USE THIS when users want to modify the existing design: "make it darker", "change to blue theme", "add more spacing", "make it more modern", "simplify this", "make it vibrant"
  → Takes the current canvas and applies intelligent modifications
  → Parameters: variationRequest (required) - description of the changes to make

**Image Generation (DALL-E):**
- generateImage: Generate custom images using AI
  → USE THIS for: "create an image of", "generate a photo", "make an illustration", "draw a picture"
  → Creates high-quality AI-generated images that can be placed on the canvas
  → Parameters: 
    * prompt (required) - detailed description of the image
    * style - "vivid" (hyper-real, dramatic) or "natural" (natural, less stylized)
    * size - "1024x1024" (square), "1024x1792" (portrait), "1792x1024" (landscape)
    * quality - "standard" or "hd"
  → Returns: imageUrl (DALL-E hosted URL), revisedPrompt, width, height
  → 🚨 CRITICAL: After generation, use the EXACT imageUrl returned - DO NOT modify or proxy it
  → Use createShapes to place the image on canvas: {type: "image", imageUrl: <exact_url_from_response>, x, y, width, height}

**Batch Generation:**
- generateImages: Generate multiple images in parallel (faster than sequential)
  → Parameters: requests (array of ImageGenerationRequest objects)

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

=== DESIGN VARIATIONS (use generateDesignVariation) ===
"Make it darker" → generateDesignVariation({variationRequest: "make the design darker with darker colors"})
"Change to blue theme" → generateDesignVariation({variationRequest: "change color scheme to blue tones"})
"Add more spacing" → generateDesignVariation({variationRequest: "increase spacing between elements"})
"Make it more modern" → generateDesignVariation({variationRequest: "modernize the design with current trends"})
"Simplify this" → generateDesignVariation({variationRequest: "simplify the design, reduce complexity"})

=== IMAGE GENERATION (use generateImage + createShapes) ===
"Create an image of a sunset" → 
  1. Call: generateImage({prompt: "beautiful sunset over ocean with vibrant colors", style: "vivid"})
  2. Response: {imageUrl: "https://oaidalleapiprodscus.blob.core.windows.net/...", width: 1024, height: 1024}
  3. Use EXACT URL: createShapes({shapes: [{type: "image", imageUrl: "https://oaidalleapiprodscus.blob.core.windows.net/...", x: 25000, y: 25000, width: 1024, height: 1024}]})
  4. 🚨 DO NOT wrap or modify the imageUrl - use it exactly as returned

"Generate a landscape photo" → 
  1. generateImage({prompt: "mountain landscape with trees", size: "1792x1024", quality: "hd"})
  2. createShapes({shapes: [{type: "image", imageUrl: "<EXACT_URL_FROM_STEP_1>", width: 1792, height: 1024}]})

"Draw a futuristic city" → 
  1. generateImage({prompt: "futuristic cityscape with flying cars and neon lights", style: "vivid"})
  2. createShapes({shapes: [{type: "image", imageUrl: "<EXACT_URL_FROM_STEP_1>"}]})

=== BATCH GENERATION (use generateImages) ===
"Create multiple images" →
  1. generateImages({requests: [
      {prompt: "sunset", style: "vivid"},
      {prompt: "mountain landscape", style: "natural"},
      {prompt: "city skyline", style: "vivid"}
    ]})
  2. createShapes({shapes: [
      {type: "image", imageUrl: "<url1>", width: 1024, height: 1024},
      {type: "image", imageUrl: "<url2>", width: 1024, height: 1024, x: 26100},
      {type: "image", imageUrl: "<url3>", width: 1024, height: 1024, x: 27200}
    ]})

CRITICAL: 
- For ANY complex multi-component design, ALWAYS use generateComplexDesign instead of manually creating shapes.
- For custom images/photos/illustrations, use generateImage + createShapes.
- For icons/emojis, just use text shapes with emoji characters - no need to generate them.
- After generating images, ALWAYS add them to the canvas with createShapes using type: "image".`,
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

// POST /api/voice/generate-design-variation - Generate a design variation
router.post('/generate-design-variation', enhancedAuthenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!hasAPIKey('openai')) {
            res.status(503).json({
                error: 'Service Unavailable',
                message: 'Design variation generation is not configured',
            });
            return;
        }

        // Validate request body
        const { originalShapes, variationRequest } = req.body as { originalShapes: ShapeSpec[], variationRequest: string };

        if (!originalShapes || !Array.isArray(originalShapes) || originalShapes.length === 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'originalShapes is required and must be a non-empty array',
            });
            return;
        }

        if (!variationRequest || typeof variationRequest !== 'string' || variationRequest.trim().length === 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'variationRequest is required and must be a non-empty string',
            });
            return;
        }

        // Log the variation generation request
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Design variation generation requested',
            req.user?.uid,
            { shapeCount: originalShapes.length, variationRequest }
        );

        // Generate the variation using LangChain
        const design = await generateDesignVariation(originalShapes, variationRequest.trim());

        // Log success
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Design variation generated successfully',
            req.user?.uid,
            { shapeCount: design.shapes.length }
        );

        res.json({
            success: true,
            design: design,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error generating design variation:', error);

        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Design variation generation failed',
            req.user?.uid,
            { error: error instanceof Error ? error.message : 'Unknown error' }
        );

        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'Failed to generate design variation',
        });
    }
});

// POST /api/voice/generate-image - Generate an image using DALL-E
router.post('/generate-image', enhancedAuthenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!hasAPIKey('openai')) {
            res.status(503).json({
                error: 'Service Unavailable',
                message: 'Image generation is not configured',
            });
            return;
        }

        // Validate request body
        const { prompt, style, size, quality } = req.body as ImageGenerationRequest;

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Prompt is required and must be a non-empty string',
            });
            return;
        }

        // Log the image generation request
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Image generation requested',
            req.user?.uid,
            { prompt, style, size, quality }
        );

        // Generate the image
        const imageRequest: ImageGenerationRequest = {
            prompt: prompt.trim(),
            style,
            size,
            quality,
        };

        const image = await generateImage(imageRequest);

        // Log success
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Image generated successfully',
            req.user?.uid,
            { imageUrl: image.imageUrl }
        );

        res.json({
            success: true,
            image: image,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error generating image:', error);

        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Image generation failed',
            req.user?.uid,
            { error: error instanceof Error ? error.message : 'Unknown error' }
        );

        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'Failed to generate image',
        });
    }
});

// POST /api/voice/generate-images - Generate multiple images in parallel
router.post('/generate-images', enhancedAuthenticateUser, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!hasAPIKey('openai')) {
            res.status(503).json({
                error: 'Service Unavailable',
                message: 'Image generation is not configured',
            });
            return;
        }

        // Validate request body
        const { requests } = req.body as { requests: ImageGenerationRequest[] };

        if (!requests || !Array.isArray(requests) || requests.length === 0) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Requests array is required and must be non-empty',
            });
            return;
        }

        // Validate each request
        for (const request of requests) {
            if (!request.prompt || typeof request.prompt !== 'string' || request.prompt.trim().length === 0) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'Each request must have a valid prompt',
                });
                return;
            }
        }

        // Log the batch image generation request
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Batch image generation requested',
            req.user?.uid,
            { count: requests.length }
        );

        // Generate the images
        const images = await generateImages(requests);

        // Log success
        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Batch images generated successfully',
            req.user?.uid,
            { count: images.length }
        );

        res.json({
            success: true,
            images: images,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error generating images:', error);

        securityLogger.logFromRequest(
            req,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'Batch image generation failed',
            req.user?.uid,
            { error: error instanceof Error ? error.message : 'Unknown error' }
        );

        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'Failed to generate images',
        });
    }
});

// GET /api/voice/proxy-image - Proxy DALL-E images to avoid CORS issues
router.get('/proxy-image', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const imageUrl = req.query.url as string;

        if (!imageUrl || typeof imageUrl !== 'string') {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Image URL is required',
            });
            return;
        }

        // Validate that the URL is from OpenAI's blob storage
        if (!imageUrl.startsWith('https://oaidalleapiprodscus.blob.core.windows.net/')) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Only DALL-E image URLs are supported',
            });
            return;
        }

        // Fetch the image from DALL-E
        const imageResponse = await fetch(imageUrl);

        if (!imageResponse.ok) {
            res.status(imageResponse.status).json({
                error: 'Failed to fetch image',
                message: 'Could not retrieve image from DALL-E',
            });
            return;
        }

        // Get the image buffer
        const imageBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);

        // Set content headers (CORS is handled by global middleware)
        res.setHeader('Content-Type', imageResponse.headers.get('content-type') || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

        // Send the image
        res.send(buffer);
    } catch (error) {
        console.error('Error proxying image:', error);

        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'Failed to proxy image',
        });
    }
});

export default router;


import { ChatOpenAI } from '@langchain/openai';
import { getAPIKey } from '../config/apiKeys';

// Using type annotations for messages instead of importing classes
interface MessageContent {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Complex Design Service
 * Uses LangChain + OpenAI to generate sophisticated design specifications
 * that can be rendered on the canvas
 */

export interface DesignRequest {
    description: string;
    style?: 'modern' | 'minimalist' | 'vibrant' | 'elegant' | 'professional';
    colorScheme?: 'dark' | 'light' | 'colorful' | 'monochrome';
    complexity?: 'simple' | 'moderate' | 'complex';
    viewport?: {
        centerX: number;
        centerY: number;
    };
}

export interface ShapeSpec {
    type: 'rectangle' | 'circle' | 'text';
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    radius?: number;
    color?: string;
    textContent?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    opacity?: number;
    rotation?: number;
    borderRadius?: number;
    zIndex?: number;
}

export interface DesignResponse {
    shapes: ShapeSpec[];
    description: string;
    metadata: {
        shapeCount: number;
        estimatedComplexity: string;
        designStyle: string;
    };
}

/**
 * Generate a complex design using LangChain and OpenAI
 */
export async function generateComplexDesign(request: DesignRequest): Promise<DesignResponse> {
    const openaiKey = getAPIKey('openai');
    console.log('🔥 OpenAI API key', openaiKey)
    if (!openaiKey) {
        throw new Error('OpenAI API key not configured');
    }

    // Initialize ChatOpenAI model with function calling support
    const model = new ChatOpenAI({
        modelName: 'gpt-4o-2024-11-20',
        temperature: 0.8, // Higher temperature for more creative designs
        apiKey: openaiKey, // LangChain uses 'apiKey' parameter
    });

    // Set defaults
    const style = request.style || 'modern';
    const colorScheme = request.colorScheme || 'dark';
    const complexity = request.complexity || 'moderate';
    const viewport = request.viewport || { centerX: 25000, centerY: 25000 };

    // System prompt - teach the AI how to design beautiful interfaces
    const systemPrompt = `You are an expert UI/UX designer specializing in creating beautiful, professional designs for digital interfaces. You have deep knowledge of:

- Visual hierarchy and layering (z-index management)
- Color theory and harmonious color palettes
- Typography and font pairing
- Spacing, alignment, and visual balance
- Modern design trends and best practices

Your task is to generate a complete design specification as a JSON object containing an array of shapes. Each shape should be positioned, sized, and styled to create a cohesive, professional design.

CANVAS SPECIFICATIONS:
- Canvas is 50000x50000 pixels
- Center point is at (25000, 25000)
- Current viewport center is at (${viewport.centerX}, ${viewport.centerY})
- Design elements should be centered around the viewport center

SHAPE TYPES:
1. rectangle: { type, x, y, width, height, color, borderRadius?, opacity?, zIndex? }
2. circle: { type, x, y, radius, color, opacity?, zIndex? }
3. text: { type, x, y, textContent, fontSize, fontFamily?, fontWeight?, color, opacity?, zIndex? }

DESIGN PRINCIPLES:
1. **Layering**: Use zIndex properly - backgrounds (1), containers (2), content (3), overlays (4)
2. **Color Harmony**: Choose complementary colors that work well together
3. **Typography**: Use size hierarchy - headers (32-48px), subheaders (20-24px), body (16-18px)
4. **Spacing**: Use consistent spacing (16px, 24px, 32px, 48px) between elements
5. **Visual Balance**: Distribute elements evenly, use whitespace effectively
6. **Modern Style**: Rounded corners (borderRadius 8-16px), subtle shadows (via opacity)

PROFESSIONAL COLOR SCHEMES:
- Modern Dark: Background #1A1A1A, Cards #2A2A2A, Primary #4A90E2, Accent #50C878, Text #FFFFFF
- Clean Light: Background #F5F5F5, Cards #FFFFFF, Primary #2563EB, Accent #10B981, Text #1F2937
- Vibrant: Background #1E293B, Cards #334155, Primary #8B5CF6, Accent #EC4899, Text #F1F5F9
- Elegant Professional: Background #0F172A, Cards #1E293B, Primary #0EA5E9, Accent #F59E0B, Text #E2E8F0

RESPONSE FORMAT:
Return ONLY a valid JSON object with this exact structure:
{
    "shapes": [
        { "type": "rectangle", "x": 25000, "y": 25000, "width": 400, "height": 300, "color": "#1A1A1A", "borderRadius": 16, "zIndex": 1 },
        { "type": "text", "x": 25050, "y": 25050, "textContent": "Hello", "fontSize": 32, "fontWeight": "bold", "color": "#FFFFFF", "zIndex": 3 }
    ],
    "description": "A clean, modern card design with a dark background and bold headline",
    "metadata": {
        "shapeCount": 2,
        "estimatedComplexity": "simple",
        "designStyle": "modern dark"
    }
}

Do not include any markdown formatting, code blocks, or explanatory text - ONLY the raw JSON object.`;

    // User prompt - specific design request
    const userPrompt = `Create a ${complexity} ${style} design with a ${colorScheme} color scheme.

Design Request: ${request.description}

Generate a professional, visually appealing design that matches these specifications. Center the design around viewport coordinates (${viewport.centerX}, ${viewport.centerY}).

Remember:
- Use proper z-index layering (backgrounds at z:1, content at z:2+)
- Choose harmonious colors from the ${colorScheme} palette
- Apply the ${style} design style
- Create a ${complexity} composition with appropriate detail level
- Return ONLY valid JSON, no markdown or explanations`;

    try {
        // Invoke the model with simple message objects
        const response = await model.invoke([
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt }
        ]);

        const content = response.content as string;

        // Parse the JSON response
        // Remove markdown code blocks if present
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.substring(7);
        }
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.substring(3);
        }
        if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        }
        jsonStr = jsonStr.trim();

        const designSpec: DesignResponse = JSON.parse(jsonStr);

        // Validate the response structure
        if (!designSpec.shapes || !Array.isArray(designSpec.shapes)) {
            throw new Error('Invalid design specification: missing shapes array');
        }

        // Ensure metadata is present
        if (!designSpec.metadata) {
            designSpec.metadata = {
                shapeCount: designSpec.shapes.length,
                estimatedComplexity: complexity,
                designStyle: `${style} ${colorScheme}`
            };
        }

        return designSpec;

    } catch (error) {
        console.error('Error generating complex design:', error);
        throw new Error(
            error instanceof Error
                ? `Failed to generate design: ${error.message}`
                : 'Failed to generate design'
        );
    }
}

/**
 * Generate a design variation based on an existing design
 */
export async function generateDesignVariation(
    originalShapes: ShapeSpec[],
    variationRequest: string
): Promise<DesignResponse> {
    const openaiKey = getAPIKey('openai');

    if (!openaiKey) {
        throw new Error('OpenAI API key not configured');
    }

    const model = new ChatOpenAI({
        modelName: 'gpt-4o-2024-11-20',
        temperature: 0.7,
        apiKey: openaiKey, // LangChain uses 'apiKey' parameter
    });

    const systemPrompt = `You are an expert UI/UX designer. You will receive an existing design and a request to create a variation of it.

Your task is to generate a modified version of the design that incorporates the requested changes while maintaining visual coherence and professional quality.

Return ONLY a valid JSON object with the same structure as the original design.`;

    const userPrompt = `Original Design:
${JSON.stringify(originalShapes, null, 2)}

Variation Request: ${variationRequest}

Create a variation of this design that incorporates the requested changes. Maintain the overall structure but apply the modifications thoughtfully. Return ONLY valid JSON.`;

    try {
        const response = await model.invoke([
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt }
        ]);

        const content = response.content as string;
        let jsonStr = content.trim();

        // Clean up markdown
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
        if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        jsonStr = jsonStr.trim();

        const designSpec: DesignResponse = JSON.parse(jsonStr);

        return designSpec;

    } catch (error) {
        console.error('Error generating design variation:', error);
        throw new Error(
            error instanceof Error
                ? `Failed to generate variation: ${error.message}`
                : 'Failed to generate variation'
        );
    }
}


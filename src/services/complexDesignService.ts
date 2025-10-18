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
    deviceLayout?: 'mobile' | 'web';
    viewport?: {
        centerX: number;
        centerY: number;
        width?: number;
        height?: number;
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
    const deviceLayout = request.deviceLayout || 'mobile';

    // Default viewport dimensions based on device type
    const defaultViewportWidth = deviceLayout === 'mobile' ? 390 : 1440;
    const defaultViewportHeight = deviceLayout === 'mobile' ? 844 : 900;

    const viewport = request.viewport || {
        centerX: 25000,
        centerY: 25000,
        width: defaultViewportWidth,
        height: defaultViewportHeight
    };

    // Ensure viewport has width and height
    viewport.width = viewport.width || defaultViewportWidth;
    viewport.height = viewport.height || defaultViewportHeight;

    // Calculate container dimensions and position
    const containerPadding = deviceLayout === 'mobile' ? 0 : 0; // No padding - full viewport
    const containerWidth = viewport.width;
    const containerHeight = viewport.height;

    // Calculate top-left corner position (container x,y represents top-left in our canvas system)
    const containerX = viewport.centerX - (containerWidth / 2);
    const containerY = viewport.centerY - (containerHeight / 2);

    // Content area (with padding from edges)
    const contentPadding = deviceLayout === 'mobile' ? 20 : 32;
    const contentAreaX = containerX + contentPadding;
    const contentAreaY = containerY + contentPadding;
    const contentAreaWidth = containerWidth - (contentPadding * 2);
    const contentAreaHeight = containerHeight - (contentPadding * 2);

    // System prompt - teach the AI how to design beautiful interfaces
    const systemPrompt = `You are an expert UI/UX designer specializing in creating beautiful, professional designs for digital interfaces. You have deep knowledge of:

- Visual hierarchy and layering (z-index management)
- Color theory and harmonious color palettes
- Typography and font pairing
- Spacing, alignment, and visual balance
- Modern design trends and best practices
- Mobile-first design principles and responsive layouts

Your task is to generate a complete design specification as a JSON object containing an array of shapes. Each shape should be positioned, sized, and styled to create a cohesive, professional design.

CANVAS SPECIFICATIONS:
- Canvas is 50000x50000 pixels
- Center point is at (25000, 25000)
- Current viewport center is at (${viewport.centerX}, ${viewport.centerY})
- Viewport dimensions: ${viewport.width}px × ${viewport.height}px
- Device layout: ${deviceLayout}

🎨 **CRITICAL DESIGN RULES - FOLLOW EXACTLY:**

1. **CONTAINER-FIRST APPROACH (MANDATORY):**
   - The FIRST shape in your array MUST be the device container/background
   - Container specs:
     * type: "rectangle"
     * x: ${containerX} (top-left corner X)
     * y: ${containerY} (top-left corner Y)
     * width: ${containerWidth}
     * height: ${containerHeight}
     * color: Choose from background palette (see color schemes below)
     * borderRadius: ${deviceLayout === 'mobile' ? '32' : '8'} (rounded for mobile, subtle for web)
     * zIndex: 1
   - This creates the ${deviceLayout === 'mobile' ? 'mobile device frame' : 'web application container'}

2. **CONTENT CONTAINMENT (MANDATORY):**
   - ALL subsequent UI elements MUST be positioned WITHIN the container boundaries
   - Content safe area:
     * Start X: ${contentAreaX} (container left + ${contentPadding}px padding)
     * Start Y: ${contentAreaY} (container top + ${contentPadding}px padding)
     * Max Width: ${contentAreaWidth}px
     * Max Height: ${contentAreaHeight}px
   - **NO elements should extend beyond**: 
     * Right edge: ${containerX + containerWidth}
     * Bottom edge: ${containerY + containerHeight}
   - Calculate all positions relative to content area bounds above

3. **BEAUTIFUL VISUAL HIERARCHY:**
   - Layer 1 (z:1): Device container/background (MUST BE FIRST)
   - Layer 2 (z:2-5): Section backgrounds, cards, containers
   - Layer 3 (z:6-10): Primary content (headings, images, icons)
   - Layer 4 (z:11-15): Interactive elements (buttons, inputs)
   - Layer 5 (z:16-20): Text labels and body copy
   - Layer 6 (z:21+): Overlays, tooltips, floating elements

DEVICE-SPECIFIC CONSTRAINTS:
${deviceLayout === 'mobile' ? `
**MOBILE LAYOUT** (${containerWidth}px × ${containerHeight}px):
- Single-column layouts for clarity
- Larger touch targets (minimum 44px height for buttons)
- Simplified navigation (bottom nav or hamburger menu)
- Stack elements vertically with generous spacing
- Font sizes: Headers 24-32px, Subheads 18-20px, Body 16px
- Button widths: Minimum 280px for primary actions
- Use full-width cards with consistent margins (${contentPadding}px)
- Thumb-friendly zones: Bottom 20% for primary actions
` : `
**WEB LAYOUT** (${containerWidth}px × ${containerHeight}px):
- Multi-column layouts and grid systems allowed
- Standard desktop spacing and sizing
- Complex navigation patterns (top nav, sidebars)
- Font sizes: Headers 32-48px, Subheads 20-24px, Body 16-18px
- Use cards, sections, and whitespace generously
- Grid-based alignment (2-3 columns typical)
`}

SHAPE TYPES:
1. rectangle: { type, x, y, width, height, color, borderRadius?, opacity?, zIndex? }
2. circle: { type, x, y, radius, color, opacity?, zIndex? }
3. text: { type, x, y, textContent, fontSize, fontFamily?, fontWeight?, color, opacity?, zIndex? }

DESIGN PRINCIPLES FOR BEAUTY:
1. **Whitespace is Your Friend**: Don't overcrowd - use ${contentPadding * 2}px+ between major sections
2. **Alignment**: Align elements to a consistent grid (left-align text, center important actions)
3. **Color Contrast**: Ensure text has strong contrast against backgrounds
4. **Visual Weight**: Heavier elements (larger, darker) should be balanced across the design
5. **Consistent Spacing**: Use multiples of 8px (8, 16, 24, 32, 48, 64)
6. **Modern Polish**: 
   - Rounded corners (borderRadius: 12-${deviceLayout === 'mobile' ? '32' : '16'}px)
   - Subtle shadows via layering (not opacity unless for transparency effect)
   - Generous padding inside containers
7. **Typography Scale**: Use clear size differences (1.5x-2x between levels)

PROFESSIONAL COLOR SCHEMES (Choose based on ${colorScheme} request):
- Modern Dark: 
  * Background: #0A0A0A, Container: #1A1A1A, Cards: #2A2A2A
  * Primary: #4A90E2, Accent: #50C878, Text: #FFFFFF, Subtext: #B0B0B0
- Clean Light: 
  * Background: #FFFFFF, Container: #F5F5F5, Cards: #FFFFFF
  * Primary: #2563EB, Accent: #10B981, Text: #1F2937, Subtext: #6B7280
- Vibrant: 
  * Background: #0F172A, Container: #1E293B, Cards: #334155
  * Primary: #8B5CF6, Accent: #EC4899, Text: #F1F5F9, Subtext: #94A3B8
- Elegant Professional: 
  * Background: #000000, Container: #0F172A, Cards: #1E293B
  * Primary: #0EA5E9, Accent: #F59E0B, Text: #E2E8F0, Subtext: #94A3B8

COORDINATE CALCULATION EXAMPLES:
- Container background (FIRST): x:${containerX}, y:${containerY}, width:${containerWidth}, height:${containerHeight}
- Header text: x:${contentAreaX}, y:${contentAreaY + 40}, fontSize:${deviceLayout === 'mobile' ? 28 : 36}
- Primary button: x:${contentAreaX}, y:${Math.floor(containerY + containerHeight - contentPadding - 60)}, width:${deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200}, height:48
- Card/Section: x:${contentAreaX}, y:${contentAreaY + 120}, width:${Math.floor(contentAreaWidth)}, height:200

RESPONSE FORMAT:
Return ONLY a valid JSON object with this exact structure:
{
    "shapes": [
        { "type": "rectangle", "x": ${containerX}, "y": ${containerY}, "width": ${containerWidth}, "height": ${containerHeight}, "color": "#0A0A0A", "borderRadius": ${deviceLayout === 'mobile' ? 32 : 8}, "zIndex": 1 },
        { "type": "rectangle", "x": ${contentAreaX}, "y": ${contentAreaY + 20}, "width": ${Math.floor(contentAreaWidth)}, "height": 80, "color": "#1A1A1A", "borderRadius": 16, "zIndex": 3 },
        { "type": "text", "x": ${contentAreaX + 20}, "y": ${contentAreaY + 50}, "textContent": "Welcome", "fontSize": ${deviceLayout === 'mobile' ? 28 : 36}, "fontWeight": "bold", "color": "#FFFFFF", "zIndex": 10 }
    ],
    "description": "A beautiful, contained ${deviceLayout} design with proper hierarchy",
    "metadata": {
        "shapeCount": 3,
        "estimatedComplexity": "simple",
        "designStyle": "${style} ${colorScheme}"
    }
}

Do not include any markdown formatting, code blocks, or explanatory text - ONLY the raw JSON object.`;

    // User prompt - specific design request
    const userPrompt = `Create a ${complexity} ${style} design with a ${colorScheme} color scheme for ${deviceLayout} layout.

Design Request: ${request.description}

Generate a BEAUTIFUL, professional ${deviceLayout === 'mobile' ? 'mobile-first' : 'web'} design that matches these specifications.

🎨 **MANDATORY STRUCTURE - NO EXCEPTIONS:**

1. **FIRST SHAPE = CONTAINER BACKGROUND**
   Shape 1: Rectangle at x:${containerX}, y:${containerY}, width:${containerWidth}, height:${containerHeight}
   This is your ${deviceLayout === 'mobile' ? 'mobile device frame' : 'web container'} - choose a beautiful background color
   borderRadius: ${deviceLayout === 'mobile' ? 32 : 8}, zIndex: 1

2. **ALL OTHER SHAPES = INSIDE THE CONTAINER**
   Content area bounds: x:${contentAreaX} to ${containerX + containerWidth - contentPadding}, y:${contentAreaY} to ${containerY + containerHeight - contentPadding}
   Every single element (text, buttons, cards, etc.) must have coordinates WITHIN these bounds
   Use the coordinate examples provided in the system prompt as reference

3. **DESIGN FOR BEAUTY:**
   - Use generous whitespace (${contentPadding * 2}px+ between sections)
   - Choose harmonious colors from the ${colorScheme} palette
   - Apply consistent ${style} design style throughout
   - Clear visual hierarchy with ${complexity} level of detail
   - Proper z-index layering: container(z:1) → cards(z:2-5) → content(z:6-10) → text(z:11-20)
   - Rounded corners for modern feel (12-${deviceLayout === 'mobile' ? 32 : 16}px)
   - Perfect alignment and consistent spacing (multiples of 8px)
   
4. **${deviceLayout.toUpperCase()} BEST PRACTICES:**
   ${deviceLayout === 'mobile'
            ? '- Single column, vertical stacking\n   - Large touch targets (44px+ height)\n   - Full-width elements with edge padding\n   - Bottom-aligned primary actions'
            : '- Multi-column layouts allowed\n   - Grid-based alignment\n   - Spacious sections with clear separation\n   - Traditional navigation patterns'}

Return ONLY valid JSON with the exact structure shown in the system prompt. No markdown, no explanations.`;

    try {
        // Invoke the model with simple message objects
        const response = await model.invoke([
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt }
        ]);

        const content = response.content as string;

        // Check if content is empty
        if (!content || content.trim().length === 0) {
            throw new Error('Empty response from OpenAI');
        }

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

        // Check if cleaned JSON string is empty
        if (!jsonStr || jsonStr.length === 0) {
            console.error('Empty JSON string after cleaning. Original content:', content);
            throw new Error('Empty JSON after cleaning markdown');
        }

        let designSpec: DesignResponse;
        try {
            designSpec = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Failed to parse JSON. Full content length:', jsonStr.length);
            console.error('First 1000 chars:', jsonStr.substring(0, 1000));
            console.error('Last 500 chars:', jsonStr.substring(Math.max(0, jsonStr.length - 500)));
            throw new Error(`Failed to parse OpenAI response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
        }

        // Validate the response structure
        if (!designSpec.shapes || !Array.isArray(designSpec.shapes)) {
            throw new Error('Invalid design specification: missing shapes array');
        }

        // Ensure metadata is present
        if (!designSpec.metadata) {
            designSpec.metadata = {
                shapeCount: designSpec.shapes.length,
                estimatedComplexity: complexity,
                designStyle: `${style} ${colorScheme} (${deviceLayout})`
            };
        } else {
            // Add device layout info if not present
            designSpec.metadata.designStyle = designSpec.metadata.designStyle || `${style} ${colorScheme} (${deviceLayout})`;
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

        // Check if content is empty
        if (!content || content.trim().length === 0) {
            throw new Error('Empty response from OpenAI');
        }

        let jsonStr = content.trim();

        // Clean up markdown
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.substring(7);
        if (jsonStr.startsWith('```')) jsonStr = jsonStr.substring(3);
        if (jsonStr.endsWith('```')) jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        jsonStr = jsonStr.trim();

        // Check if cleaned JSON string is empty
        if (!jsonStr || jsonStr.length === 0) {
            console.error('Empty JSON string after cleaning. Original content:', content);
            throw new Error('Empty JSON after cleaning markdown');
        }

        let designSpec: DesignResponse;
        try {
            designSpec = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Failed to parse JSON. Full content length:', jsonStr.length);
            console.error('First 1000 chars:', jsonStr.substring(0, 1000));
            console.error('Last 500 chars:', jsonStr.substring(Math.max(0, jsonStr.length - 500)));
            throw new Error(`Failed to parse OpenAI response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
        }

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


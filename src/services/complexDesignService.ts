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

    // Initialize ChatOpenAI model with JSON mode enabled
    const model = new ChatOpenAI({
        modelName: 'gpt-4o-2024-11-20',
        temperature: 0.8, // Higher temperature for more creative designs
        apiKey: openaiKey, // LangChain uses 'apiKey' parameter
        modelKwargs: {
            response_format: { type: 'json_object' }
        }
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
    // For mobile, reserve 100px at bottom for tab bar (80px bar + 20px padding)
    const tabBarReservedSpace = deviceLayout === 'mobile' ? 100 : 0;
    const contentAreaHeight = containerHeight - (contentPadding * 2) - tabBarReservedSpace;

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

**🚨 MANDATORY BOTTOM TAB BAR FOR MOBILE (CRITICAL):**
EVERY mobile design MUST include a bottom navigation tab bar with these exact specifications:
- Position: Bottom of container
  * x: ${containerX}
  * y: ${containerY + containerHeight - 80}
  * width: ${containerWidth}
  * height: 80
- borderRadius: 0 (tab bars have no top corners rounded, only container has rounded corners)
- zIndex: 100 (must be on top of all other content)
- Contains 4-5 tab items evenly distributed across the width
- Each tab item MUST have:
  * A circle icon placeholder (radius: 12px)
  * A text label CENTERED DIRECTLY BELOW the icon (fontSize: 11px)
  * **CRITICAL CENTERING**: Icon and text must share the SAME x-coordinate for perfect vertical alignment
  * Icon y-position: ${containerY + containerHeight - 60} (20px from bottom, centered in upper portion)
  * Text y-position: ${containerY + containerHeight - 28} (12px from bottom, centered in lower portion)
  * Spacing: Divide tab bar width into equal sections (${containerWidth} / 4 or ${containerWidth} / 5)
  * For 4 tabs, x-positions: ${containerX + Math.floor(containerWidth / 8)}, ${containerX + Math.floor(containerWidth * 3 / 8)}, ${containerX + Math.floor(containerWidth * 5 / 8)}, ${containerX + Math.floor(containerWidth * 7 / 8)}
  * For 5 tabs, x-positions: ${containerX + Math.floor(containerWidth / 10)}, ${containerX + Math.floor(containerWidth * 3 / 10)}, ${containerX + Math.floor(containerWidth * 5 / 10)}, ${containerX + Math.floor(containerWidth * 7 / 10)}, ${containerX + Math.floor(containerWidth * 9 / 10)}
  * Colors: Use subtext color for inactive tabs, primary color for active tab
- Active tab: First tab should be in active state (primary color)
- Content safe zone MUST account for tab bar: Content should not extend below y: ${containerY + containerHeight - 100}
` : `
**WEB LAYOUT** (${containerWidth}px × ${containerHeight}px):
- Multi-column layouts and grid systems allowed
- Standard desktop spacing and sizing
- Complex navigation patterns (top nav, sidebars)
- Font sizes: Headers 32-48px, Subheads 20-24px, Body 16-18px
- Use cards, sections, and whitespace generously
- Grid-based alignment (2-3 columns typical)
- NO bottom tab bar required for web layouts
`}

SHAPE TYPES:
1. rectangle: { type, x, y, width, height, color, borderRadius?, opacity?, zIndex? }
2. circle: { type, x, y, radius, color, opacity?, zIndex? }
3. text: { type, x, y, textContent, fontSize, fontFamily?, fontWeight?, color, opacity?, zIndex? }
   - **CRITICAL**: Text (x,y) represents the CENTER point of the text
   - Text expands outward from center in all directions based on fontSize and textContent length
   
**📐 TEXT POSITIONING MATHEMATICS (CRITICAL FOR MOBILE):**
When positioning text, you must calculate the center position based on where the text should appear:
- If you want text centered at x=100 with estimated width of 200px:
  * Text will span from: 100 - (200/2) = 0 to 100 + (200/2) = 200
  * Center position x should be: 100
- For text inside a button at x=300, width=280:
  * Button spans from x=300 to x=580
  * Text center should be at: 300 + (280/2) = 440
  * This ensures text is perfectly centered within the button bounds
- For text near container edges:
  * Left edge at ${contentAreaX}, avoid text center closer than ${contentAreaX + 75} (allows ~150px text width)
  * Right edge at ${containerX + containerWidth}, avoid text center closer than ${containerX + containerWidth - 75}
  * Always calculate: textCenterX = desiredCenterX, ensuring (textCenterX - estimatedWidth/2) >= leftBound and (textCenterX + estimatedWidth/2) <= rightBound

**🚨 TEXT BOUNDARY RULES (MANDATORY):**
${deviceLayout === 'mobile' ? `
For MOBILE designs, ALL text must stay within container boundaries using CENTER-BASED POSITIONING:

**CENTER POINT CALCULATION METHOD:**
- Text (x,y) is the CENTER of the text, not top-left corner
- If text center is at x=100 and estimated width is 200px:
  * Text spans from: 100 - (200/2) = 0 to 100 + (200/2) = 200
  * Therefore, center at 100 correctly positions a 200px-wide text from 0 to 200
  
**BOUNDARY CONSTRAINTS (with center-based math):**
- Left boundary: Text center x >= ${contentAreaX + 75} 
  * Allows ~150px total text width (75px left + 75px right of center)
  * Example: center at ${contentAreaX + 75} means text spans from ${contentAreaX} to ${contentAreaX + 150}
- Right boundary: Text center x <= ${containerX + containerWidth - 75}
  * Prevents text from overflowing right edge
  * Example: center at ${containerX + containerWidth - 75} keeps text within bounds
- Top boundary: Text center y >= ${contentAreaY + 20}
- Bottom boundary: Text center y <= ${containerY + containerHeight - 100} (above tab bar)

**FOR BUTTONS/UI ELEMENTS - PERFECT CENTERING:**
- Button at x=${contentAreaX}, width=280: Text center x = ${contentAreaX} + (280/2) = ${contentAreaX + 140}
- Button at y=${contentAreaY + 100}, height=48: Text center y = ${contentAreaY + 100} + (48/2) = ${contentAreaY + 124}
- This ensures text center aligns with button center for perfect visual centering

**TEXT WIDTH ESTIMATION GUIDE:**
- Short text (<10 chars): ~80-120px width → safe with 75px margin from edges
- Medium text (10-20 chars): ~120-200px width → position center closer to middle
- Long text (>20 chars): ~200-300px width → must be centered in content area
` : `
For WEB designs, text should stay comfortably within content area:
- Keep text x between ${contentAreaX + 30} and ${containerX + containerWidth - 30}
- Keep text y between ${contentAreaY + 20} and ${containerY + containerHeight - 20}
- Same center-based positioning applies: text (x,y) is the center point
`}

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
8. **BUTTON TEXT CENTERING (CRITICAL - CENTER-BASED POSITIONING)**: 
   - For ANY text inside a button/rectangle:
     * HORIZONTAL CENTER: textX = buttonX + (buttonWidth / 2)
     * VERTICAL CENTER: textY = buttonY + (buttonHeight / 2)
   - The (x, y) for text represents the CENTER POINT, not top-left
   - **MATHEMATICS OF CENTER-BASED TEXT:**
     * If button is at x=100, width=200: Button spans from 100 to 300
     * Text center should be at: 100 + (200/2) = 200 (middle of 100 and 300)
     * With text width of 80px, text spans from: 200 - 40 = 160 to 200 + 40 = 240
     * This positions the 80px text perfectly centered within the 200px button
   - Example calculation for mobile button:
     * Button: x=${contentAreaX}, width=280, height=48
     * Text center: x=${contentAreaX + 140}, y=${contentAreaY + 24}
     * If text is "Sign Up" (~60px wide), it spans from ${contentAreaX + 110} to ${contentAreaX + 170}
     * Result: Perfectly centered within button bounds
   - ALWAYS calculate text position relative to button center, not edges
   - Remember: center at C, width W → text spans from (C - W/2) to (C + W/2)

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

COORDINATE CALCULATION EXAMPLES (with CENTER-BASED TEXT math):
- Container background (FIRST): x:${containerX}, y:${containerY}, width:${containerWidth}, height:${containerHeight}

- Header text example: 
  * Text: "Welcome Back" (~160px estimated width, fontSize:28)
  * Position: x:${contentAreaX + 80}, y:${contentAreaY + 40}
  * Spans from: ${contentAreaX + 80} - 80 = ${contentAreaX} to ${contentAreaX + 80} + 80 = ${contentAreaX + 160}
  * Result: Left-aligned within content area, properly contained

- Primary button with centered text:
  * Button: x:${contentAreaX}, y:${Math.floor(containerY + containerHeight - contentPadding - 60)}, width:${deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200}, height:48
  * Button text calculation:
    - Button center x: ${contentAreaX} + (${deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200}/2) = ${contentAreaX + (deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200) / 2}
    - Button center y: ${Math.floor(containerY + containerHeight - contentPadding - 60)} + (48/2) = ${Math.floor(containerY + containerHeight - contentPadding - 60) + 24}
  * Text: x:${contentAreaX + (deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200) / 2}, y:${Math.floor(containerY + containerHeight - contentPadding - 60) + 24}, textContent:"Click Me", fontSize:16
  * With "Click Me" (~70px wide): spans from ${contentAreaX + (deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200) / 2 - 35} to ${contentAreaX + (deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200) / 2 + 35}
  * Result: PERFECTLY centered within button

- Card/Section: x:${contentAreaX}, y:${contentAreaY + 120}, width:${Math.floor(contentAreaWidth)}, height:200
${deviceLayout === 'mobile' ? `
- **BOTTOM TAB BAR (MANDATORY FOR MOBILE):**
  * Tab bar background: x:${containerX}, y:${containerY + containerHeight - 80}, width:${containerWidth}, height:80, zIndex:100, borderRadius:0
  * Tab 1 (ACTIVE) - Icon: x:${containerX + Math.floor(containerWidth / 8)}, y:${containerY + containerHeight - 60}, radius:12, color:primary, zIndex:101
  * Tab 1 (ACTIVE) - Label: x:${containerX + Math.floor(containerWidth / 8)}, y:${containerY + containerHeight - 28}, text:"Home", fontSize:11, color:primary, zIndex:101
  * Tab 2 - Icon: x:${containerX + Math.floor(containerWidth * 3 / 8)}, y:${containerY + containerHeight - 60}, radius:12, color:subtext, zIndex:101
  * Tab 2 - Label: x:${containerX + Math.floor(containerWidth * 3 / 8)}, y:${containerY + containerHeight - 28}, text:"Search", fontSize:11, color:subtext, zIndex:101
  * Tab 3 - Icon: x:${containerX + Math.floor(containerWidth * 5 / 8)}, y:${containerY + containerHeight - 60}, radius:12, color:subtext, zIndex:101
  * Tab 3 - Label: x:${containerX + Math.floor(containerWidth * 5 / 8)}, y:${containerY + containerHeight - 28}, text:"Create", fontSize:11, color:subtext, zIndex:101
  * Tab 4 - Icon: x:${containerX + Math.floor(containerWidth * 7 / 8)}, y:${containerY + containerHeight - 60}, radius:12, color:subtext, zIndex:101
  * Tab 4 - Label: x:${containerX + Math.floor(containerWidth * 7 / 8)}, y:${containerY + containerHeight - 28}, text:"Profile", fontSize:11, color:subtext, zIndex:101
  * **NOTICE**: Each icon and its label share the EXACT SAME x-coordinate for perfect centering!
` : ''}

RESPONSE FORMAT:
Return ONLY a valid JSON object with this exact structure:
{
    "shapes": [
        { "type": "rectangle", "x": ${containerX}, "y": ${containerY}, "width": ${containerWidth}, "height": ${containerHeight}, "color": "#0A0A0A", "borderRadius": ${deviceLayout === 'mobile' ? 32 : 8}, "zIndex": 1 },
        { "type": "rectangle", "x": ${contentAreaX}, "y": ${contentAreaY + 20}, "width": ${Math.floor(contentAreaWidth)}, "height": 80, "color": "#1A1A1A", "borderRadius": 16, "zIndex": 3 },
        { "type": "text", "x": ${contentAreaX + 20}, "y": ${contentAreaY + 50}, "textContent": "Welcome", "fontSize": ${deviceLayout === 'mobile' ? 28 : 36}, "fontWeight": "bold", "color": "#FFFFFF", "zIndex": 10 },
        { "type": "rectangle", "x": ${contentAreaX}, "y": ${contentAreaY + 120}, "width": 200, "height": 48, "color": "#4A90E2", "borderRadius": 12, "zIndex": 11 },
        { "type": "text", "x": ${contentAreaX + 100}, "y": ${contentAreaY + 144}, "textContent": "Button", "fontSize": 16, "fontWeight": "600", "color": "#FFFFFF", "zIndex": 12 }
    ],
    "description": "A beautiful, contained ${deviceLayout} design with proper hierarchy and centered button text",
    "metadata": {
        "shapeCount": 5,
        "estimatedComplexity": "simple",
        "designStyle": "${style} ${colorScheme}"
    }
}

CRITICAL: Note in the example above, the button text positioning demonstrates CENTER-BASED math:
- Button: x=${contentAreaX}, width=200 → Button spans from ${contentAreaX} to ${contentAreaX + 200}
- Text center: x=${contentAreaX + 100} (which is ${contentAreaX} + 200/2)
- If text "Button" is ~60px wide, it spans from ${contentAreaX + 70} (100-30) to ${contentAreaX + 130} (100+30)
- Result: 60px text perfectly centered within 200px button
- Same for y-axis: Button y=${contentAreaY + 120}, height=48 → Text center y=${contentAreaY + 144} (which is ${contentAreaY + 120} + 48/2)
- This is the EXACT calculation you must use for ALL text in mobile designs!

🚨 **RESPONSE FORMAT RULES (CRITICAL):**
1. Return ONLY the raw JSON object - NO markdown, NO code blocks, NO explanations
2. Start with { and end with }
3. NO trailing commas before closing braces or brackets
4. NO comments (no // or /* */)
5. ALL string values must use double quotes, not single quotes
6. NO text before the opening { or after the closing }
7. Ensure valid JSON syntax - test it mentally before returning

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
   - **BUTTON TEXT MUST BE PERFECTLY CENTERED (CENTER-BASED MATH)**: 
     * Formula: textCenterX = buttonX + (buttonWidth / 2), textCenterY = buttonY + (buttonHeight / 2)
     * Example: Button at x=${contentAreaX}, width=280, height=48
     * Text center: x=${contentAreaX + 140}, y=${contentAreaY + 24}
     * If text "Sign Up" is 60px wide, it spans from ${contentAreaX + 110} to ${contentAreaX + 170}
     * This achieves perfect centering because: center(${contentAreaX + 140}) - width/2(30) = ${contentAreaX + 110} starts properly within button
     * Apply this calculation to EVERY text element in buttons, cards, and UI components
   
4. **${deviceLayout.toUpperCase()} BEST PRACTICES:**
   ${deviceLayout === 'mobile'
            ? `- Single column, vertical stacking
   - Large touch targets (44px+ height)
   - Full-width elements with edge padding
   - Bottom-aligned primary actions
   
   🚨 **MANDATORY BOTTOM TAB BAR (CRITICAL):**
   - EVERY mobile design MUST include a bottom navigation tab bar
   - Tab bar specs: x:${containerX}, y:${containerY + containerHeight - 80}, width:${containerWidth}, height:80, zIndex:100, borderRadius:0
   - Include 4 tab items (Home, Search, Create, Profile) with icons and labels
   - **CRITICAL**: Each tab's icon and label MUST share the SAME x-coordinate (centered alignment)
   - Icon y: ${containerY + containerHeight - 60}, Label y: ${containerY + containerHeight - 28}
   - Tab x-positions (for 4 tabs): ${containerX + Math.floor(containerWidth / 8)}, ${containerX + Math.floor(containerWidth * 3 / 8)}, ${containerX + Math.floor(containerWidth * 5 / 8)}, ${containerX + Math.floor(containerWidth * 7 / 8)}
   - First tab should be active (primary color), others inactive (subtext color)
   - Main content MUST NOT extend below y:${containerY + containerHeight - 100} to avoid tab bar overlap
   
   🚨 **TEXT BOUNDARY ENFORCEMENT (CENTER-BASED MATH):**
   - Remember: Text position (x,y) is the CENTER, not top-left corner
   - Text with center at C and width W spans from (C - W/2) to (C + W/2)
   
   **Calculation approach:**
   - Container left edge: ${containerX + contentPadding} (content area start)
   - Container right edge: ${containerX + containerWidth - contentPadding} (content area end)
   - For text with estimated width W:
     * Minimum text center x: ${containerX + contentPadding} + (W/2)
     * Maximum text center x: ${containerX + containerWidth - contentPadding} - (W/2)
   
   **Practical examples:**
   - Short text "Home" (~50px): center between ${containerX + contentPadding + 25} and ${containerX + containerWidth - contentPadding - 25}
   - Medium "Welcome Back" (~150px): center between ${containerX + contentPadding + 75} and ${containerX + containerWidth - contentPadding - 75}
   - Long text (>200px): MUST be centered near horizontal middle of content area
   
   **Safe positioning strategy:**
   - Estimate text width based on character count and fontSize
   - Calculate: textCenterX = elementCenterX (for buttons) OR safeAreaCenterX (for standalone text)
   - Verify: (textCenterX - estimatedWidth/2) >= ${containerX + contentPadding} AND (textCenterX + estimatedWidth/2) <= ${containerX + containerWidth - contentPadding}
   - All text y positions must stay between ${contentAreaY + 20} and ${containerY + containerHeight - 100}`
            : '- Multi-column layouts allowed\n   - Grid-based alignment\n   - Spacious sections with clear separation\n   - Traditional navigation patterns\n   - NO bottom tab bar required'}

🚨 **CRITICAL OUTPUT REQUIREMENTS:**
Your response must be ONLY a valid JSON object. Follow these rules EXACTLY:
✓ Start with { and end with }
✓ NO markdown (no \`\`\`json or \`\`\`)
✓ NO trailing commas
✓ NO comments
✓ NO explanatory text before or after the JSON
✗ Do NOT add any text outside the JSON object
✗ Do NOT use code blocks or formatting

Return the raw JSON object now:`;

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
        console.log('[ComplexDesign] Raw response length:', content.length);

        // Remove markdown code blocks if present
        let jsonStr = content.trim();

        // Remove markdown code blocks
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.substring(7);
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.substring(3);
        }
        if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        }
        jsonStr = jsonStr.trim();

        // Remove any text before the first { or after the last }
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        // Fix common JSON issues
        // Remove trailing commas before closing braces/brackets
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

        // Remove comments (// or /* */)
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

        jsonStr = jsonStr.trim();

        // Check if cleaned JSON string is empty
        if (!jsonStr || jsonStr.length === 0) {
            console.error('[ComplexDesign] Empty JSON after cleaning. Original content:', content.substring(0, 500));
            throw new Error('Empty JSON after cleaning markdown');
        }

        console.log('[ComplexDesign] Cleaned JSON length:', jsonStr.length);
        console.log('[ComplexDesign] First 300 chars:', jsonStr.substring(0, 300));

        let designSpec: DesignResponse;
        try {
            designSpec = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('[ComplexDesign] JSON Parse Error:', parseError);
            console.error('[ComplexDesign] Failed JSON length:', jsonStr.length);
            console.error('[ComplexDesign] First 1200 chars:', jsonStr.substring(0, 1200));
            console.error('[ComplexDesign] Last 500 chars:', jsonStr.substring(Math.max(0, jsonStr.length - 500)));

            // Try to identify the problematic area
            if (parseError instanceof Error) {
                const match = parseError.message.match(/position (\d+)/);
                if (match) {
                    const pos = parseInt(match[1]);
                    console.error('[ComplexDesign] Context around error position:', jsonStr.substring(Math.max(0, pos - 100), Math.min(jsonStr.length, pos + 100)));
                }
            }

            throw new Error(`Failed to parse OpenAI response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
        }

        console.log('[ComplexDesign] Successfully parsed design with', designSpec.shapes?.length || 0, 'shapes');

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
        modelKwargs: {
            response_format: { type: 'json_object' }
        }
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

        // Remove markdown code blocks
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.substring(7);
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.substring(3);
        }
        if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.substring(0, jsonStr.length - 3);
        }
        jsonStr = jsonStr.trim();

        // Remove any text before the first { or after the last }
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        // Fix common JSON issues
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
        jsonStr = jsonStr.replace(/\/\/.*$/gm, ''); // Remove // comments
        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments
        jsonStr = jsonStr.trim();

        // Check if cleaned JSON string is empty
        if (!jsonStr || jsonStr.length === 0) {
            console.error('[DesignVariation] Empty JSON after cleaning. Original content:', content.substring(0, 500));
            throw new Error('Empty JSON after cleaning markdown');
        }

        let designSpec: DesignResponse;
        try {
            designSpec = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('[DesignVariation] JSON Parse Error:', parseError);
            console.error('[DesignVariation] Failed JSON length:', jsonStr.length);
            console.error('[DesignVariation] First 1000 chars:', jsonStr.substring(0, 1000));
            console.error('[DesignVariation] Last 500 chars:', jsonStr.substring(Math.max(0, jsonStr.length - 500)));
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


import { ChatOpenAI } from '@langchain/openai';
import { getAPIKey } from '../config/apiKeys';
import { generateImage } from './imageGenerationService';

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
    type: 'rectangle' | 'circle' | 'text' | 'icon' | 'image';
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
    iconName?: string;
    imageUrl?: string;
    imagePrompt?: string;  // Used to generate the image
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
 * Process image shapes by generating actual images using DALL-E
 */
async function processImageShapes(shapes: ShapeSpec[]): Promise<ShapeSpec[]> {
    const processedShapes: ShapeSpec[] = [];

    for (const shape of shapes) {
        if (shape.type === 'image' && shape.imagePrompt && !shape.imageUrl) {
            try {
                console.log(`[ComplexDesign] Generating image for: "${shape.imagePrompt}"`);

                // Determine best image size based on shape dimensions
                let size: '1024x1024' | '1024x1792' | '1792x1024' = '1024x1024';
                if (shape.width && shape.height) {
                    const aspectRatio = shape.width / shape.height;
                    if (aspectRatio > 1.3) {
                        size = '1792x1024'; // Landscape
                    } else if (aspectRatio < 0.7) {
                        size = '1024x1792'; // Portrait
                    }
                }

                // Generate the image
                const result = await generateImage({
                    prompt: shape.imagePrompt,
                    style: 'vivid', // Use vivid for more dramatic, eye-catching images
                    size: size,
                    quality: 'hd', // Always use HD for design work
                });

                console.log(`[ComplexDesign] Image generated successfully: ${result.imageUrl.substring(0, 100)}...`);

                // Replace imagePrompt with actual imageUrl
                processedShapes.push({
                    ...shape,
                    imageUrl: result.imageUrl,
                    // Keep imagePrompt for reference but it won't be used by frontend
                });
            } catch (error) {
                console.error('[ComplexDesign] Failed to generate image:', error);
                // If image generation fails, convert to a placeholder rectangle
                processedShapes.push({
                    type: 'rectangle',
                    x: shape.x,
                    y: shape.y,
                    width: shape.width,
                    height: shape.height,
                    color: '#333333',
                    borderRadius: shape.borderRadius,
                    opacity: shape.opacity,
                    zIndex: shape.zIndex,
                });
                // Add text indicating failed image generation
                if (shape.x && shape.y && shape.width && shape.height) {
                    processedShapes.push({
                        type: 'text',
                        x: shape.x + (shape.width / 2),
                        y: shape.y + (shape.height / 2),
                        textContent: 'Image Failed',
                        fontSize: 16,
                        color: '#888888',
                        zIndex: (shape.zIndex || 0) + 1,
                    });
                }
            }
        } else {
            // Keep non-image shapes as-is
            processedShapes.push(shape);
        }
    }

    return processedShapes;
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
- Position: Bottom of container (no background rectangle needed)
- Contains 4-5 tab items evenly distributed across the width
- Each tab item MUST have:
  * An icon shape (type: 'icon', iconName: choose appropriate icon, fontSize: 24)
  * A text label CENTERED DIRECTLY BELOW the icon (fontSize: 11px)
  * **CRITICAL CENTERING**: Icon and text must share the SAME x-coordinate for perfect vertical alignment
  * Icon y-position: ${containerY + containerHeight - 60} (60px from bottom)
  * Text y-position: ${containerY + containerHeight - 28} (28px from bottom)
  * Spacing: Divide tab bar width into equal sections (${containerWidth} / 4 or ${containerWidth} / 5)
  * For 4 tabs, x-positions: ${containerX + Math.floor(containerWidth / 8)}, ${containerX + Math.floor(containerWidth * 3 / 8)}, ${containerX + Math.floor(containerWidth * 5 / 8)}, ${containerX + Math.floor(containerWidth * 7 / 8)}
  * For 5 tabs, x-positions: ${containerX + Math.floor(containerWidth / 10)}, ${containerX + Math.floor(containerWidth * 3 / 10)}, ${containerX + Math.floor(containerWidth * 5 / 10)}, ${containerX + Math.floor(containerWidth * 7 / 10)}, ${containerX + Math.floor(containerWidth * 9 / 10)}
  * Suggested icons: 'home', 'search', 'plus' (for Create), 'user' (for Profile)
  * Colors: Use subtext color for inactive tabs, primary color for active tab
  * zIndex: 100 (must be on top of all other content)
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

SHAPE TYPES & POSITIONING:

🎯 **CRITICAL: ALL TEXT AND ICONS USE CENTER-BASED POSITIONING**
The (x, y) coordinates for text and icons represent the CENTER POINT, not the top-left corner.

1. rectangle: { type, x, y, width, height, color, borderRadius?, opacity?, zIndex? }
   - (x, y) = top-left corner

2. circle: { type, x, y, radius, color, opacity?, zIndex? }
   - (x, y) = center point

3. text: { type, x, y, textContent, fontSize, fontFamily?, fontWeight?, color, opacity?, zIndex? }
   - (x, y) = CENTER POINT of the text
   - Text renders symmetrically around this center point
   
4. icon: { type, x, y, iconName, fontSize?, color?, opacity?, zIndex? }
   - (x, y) = CENTER POINT of the icon
   - fontSize controls the icon size (default: 64, typical range: 24-128)
   - Available iconName values: 'smile', 'heart', 'star', 'check', 'cross', 'fire', 'rocket', 'thumbs-up', 'thumbs-down', 'warning', 'info', 'question', 'lightbulb', 'flag', 'pin', 'calendar', 'clock', 'home', 'folder', 'email', 'user', 'users', 'lock', 'unlock', 'key', 'settings', 'profile', 'shield', 'cart', 'card', 'money', 'tag', 'package', 'payment', 'bag', 'receipt', 'gift', 'diamond', 'plane', 'hotel', 'ticket', 'globe', 'map', 'compass', 'car', 'train', 'chat', 'phone', 'camera', 'eye', 'bell', 'message', 'megaphone', 'video', 'mic', 'chart', 'trending-up', 'trending-down', 'search', 'edit', 'save', 'cloud', 'refresh', 'download', 'upload', 'plus', 'minus', 'trash', 'clipboard', 'document', 'book', 'bookmark', 'link', 'party', 'cake', 'balloons', 'trophy', 'medal', 'crown', 'battery', 'signal', 'wifi', 'location', 'target', 'hourglass', 'stopwatch', 'timer', 'music', 'play', 'pause', 'film', 'tv', 'headphones', 'tool', 'wrench', 'paintbrush', 'palette', 'bulb', 'magnet'

5. image: { type, x, y, width, height, imagePrompt, borderRadius?, opacity?, zIndex? }
   - (x, y) = top-left corner
   - imagePrompt = detailed description of the image to generate (e.g., "professional photo of a modern office workspace", "vibrant illustration of a sunset over mountains")
   - USE THIS for: hero images, product photos, background images, illustrations, any visual content
   - The system will automatically generate the actual image using DALL-E based on your prompt
   - Make imagePrompt detailed and specific for best results
   - Common sizes: 300x200 (small), 600x400 (medium), 1200x800 (large), full container width for hero sections
   - Example: { type: "image", x: ${contentAreaX}, y: ${contentAreaY + 20}, width: ${Math.floor(contentAreaWidth)}, height: 300, imagePrompt: "modern tech dashboard with graphs and charts, professional style", borderRadius: 12, zIndex: 3 }

📐 **TEXT CENTERING FORMULA (USE THIS FOR EVERY TEXT ELEMENT):**

To center text inside any element (button, card, container):
- Horizontal: textX = elementX + (elementWidth / 2)
- Vertical: textY = elementY + (elementHeight / 2)

Example for button at x=${contentAreaX}, y=${contentAreaY + 100}, width=280, height=48:
- Button text X: ${contentAreaX} + (280 / 2) = ${contentAreaX + 140}
- Button text Y: ${contentAreaY + 100} + (48 / 2) = ${contentAreaY + 124}
- Result: Text perfectly centered in button

🚨 **TEXT BOUNDARY RULES:**
${deviceLayout === 'mobile' ? `
MOBILE: All text must fit within content area (${contentAreaX} to ${containerX + containerWidth - contentPadding}, ${contentAreaY} to ${containerY + containerHeight - 100})
- For standalone text: Use horizontal center of content area (x ≈ ${contentAreaX + Math.floor(contentAreaWidth / 2)})
- For text in elements: Use center formula above
- Vertical spacing: Keep y between ${contentAreaY + 20} and ${containerY + containerHeight - 100}
` : `
WEB: All text must fit within content area (${contentAreaX} to ${containerX + containerWidth - contentPadding}, ${contentAreaY} to ${containerY + containerHeight - contentPadding})
- For standalone text: Use horizontal center of content area (x ≈ ${contentAreaX + Math.floor(contentAreaWidth / 2)})
- For text in elements: Use center formula above
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
8. **TEXT CENTERING**: Always use the centering formula from "SHAPE TYPES & POSITIONING" section above
9. **🖼️ USE IMAGES AGGRESSIVELY AND PROACTIVELY (CRITICAL - HIGHEST PRIORITY):**
   - **DEFAULT TO IMAGES**: When designing ANY interface, your FIRST instinct should be to include compelling, contextually relevant images
   - **MINIMUM IMAGE USAGE**: Include AT LEAST 3+ images in every design, even simple ones
   - **DON'T WAIT TO BE ASKED**: Generate images proactively based on the design context, even if the user doesn't explicitly request them
   - **IMAGE-FIRST DESIGN PHILOSOPHY**: Modern professional designs are image-heavy. Empty designs look unfinished.
   
   **MANDATORY Image Use Cases (Generate images for ALL of these):**
   - ✅ Hero sections should include a hero image (full-width, 200-400px height)
   - ✅ Product/E-commerce: should always show product photos or mockups
   - ✅ Landing pages: Multiple images showing features, benefits, or lifestyle shots
   - ✅ Dashboards: Charts, graphs, data visualizations rendered as images
   - ✅ Profile sections: User avatars, profile photos, team member photos
   - ✅ Content cards: Each card should have a relevant thumbnail or featured image
   - ✅ App screens: Screenshots of the app interface or feature demonstrations
   - ✅ Marketing pages: Lifestyle images, customer photos, testimonial images
   - ✅ Restaurant/Food: Beautiful food photography, dish presentations, interior shots
   - ✅ Real Estate: Property photos, interior shots, neighborhood views
   - ✅ Fitness/Health: Workout images, healthy food, people exercising
   - ✅ Travel: Destination photos, hotels, attractions, travel scenes
   - ✅ Finance/Banking: Professional office scenes, people using financial apps, data visualizations
   - ✅ Social Media: User-generated content, posts with images, photo feeds and user avatars
   - ✅ Blog/News: Article featured images, thumbnails, author photos
   - ✅ Education: Students learning, classroom scenes, educational materials
   - ✅ Background imagery: Subtle background images or patterns to add depth
   
   **Image Sizing Strategy:**
   - Hero images: Full content width × 200-400px height
   - Card thumbnails: 80-120px squares or 150x100px rectangles
   - Featured content: 300-600px wide × 200-400px tall
   - Profile avatars: 60-100px circles or rounded squares
   - Gallery items: 150x150px to 250x250px squares
   
   **Remember**: Professional designers use images extensively. A design with 3+ images looks complete and polished. ALWAYS err on the side of MORE images.
   
10. **🚨 CONTEXTUALLY RELEVANT TEXT CONTENT (CRITICAL):**
   - **NEVER use generic placeholder text** like "Lorem Ipsum", "Welcome", "Click Here", "Sample Text"
   - **ALL text content MUST be relevant** to the user's design request (industry, topic, use case)
   - Generate realistic, topic-specific sample text that feels authentic to the design context
   - Examples:
     * Coffee shop app: "Fresh Brew Daily", "Artisan Coffee & Pastries", "Order Your Favorite Blend", "Espresso • Latte • Cappuccino"
     * Fitness app: "Track Your Progress", "30-Day Challenge", "Burn Calories, Build Strength", "Today's Workout"
     * Banking app: "Your Financial Dashboard", "Recent Transactions", "Transfer Funds", "Savings: $12,450.00"
     * E-commerce: "New Arrivals", "Shop By Category", "Limited Time Offer", "Free Shipping on Orders $50+"
     * Real estate: "Find Your Dream Home", "Properties in Your Area", "Schedule a Viewing", "3 Bed • 2 Bath • 1,850 sq ft"
     * Restaurant: "Reserve a Table", "Chef's Special Tonight", "View Our Menu", "Open 5pm - 11pm"
   - For longer text blocks, create industry-appropriate filler content (not Lorem Ipsum)
   - Button text should be actionable and contextually relevant: "Order Now", "Book Appointment", "Get Started", "Learn More"
   - Numbers and data should feel realistic for the context: "$24.99", "4.8 ★★★★★", "2.5k members", "15 min delivery"

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

- Button with centered text:
  * Button: x:${contentAreaX}, y:${Math.floor(containerY + containerHeight - contentPadding - 60)}, width:${deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200}, height:48
  * Text (centered): x:${contentAreaX + (deviceLayout === 'mobile' ? Math.floor(contentAreaWidth) : 200) / 2}, y:${Math.floor(containerY + containerHeight - contentPadding - 60) + 24}, textContent:"Click Me", fontSize:16

- Card/Section: x:${contentAreaX}, y:${contentAreaY + 120}, width:${Math.floor(contentAreaWidth)}, height:200
${deviceLayout === 'mobile' ? `
- **BOTTOM TAB BAR (MANDATORY FOR MOBILE):**
  * Tab 1 (ACTIVE) - Icon: type:"icon", x:${containerX + Math.floor(containerWidth / 8)}, y:${containerY + containerHeight - 60}, iconName:"home", fontSize:24, color:primary, zIndex:100
  * Tab 1 (ACTIVE) - Label: type:"text", x:${containerX + Math.floor(containerWidth / 8)}, y:${containerY + containerHeight - 28}, textContent:"Home", fontSize:11, color:primary, zIndex:100
  * Tab 2 - Icon: type:"icon", x:${containerX + Math.floor(containerWidth * 3 / 8)}, y:${containerY + containerHeight - 60}, iconName:"search", fontSize:24, color:subtext, zIndex:100
  * Tab 2 - Label: type:"text", x:${containerX + Math.floor(containerWidth * 3 / 8)}, y:${containerY + containerHeight - 28}, textContent:"Search", fontSize:11, color:subtext, zIndex:100
  * Tab 3 - Icon: type:"icon", x:${containerX + Math.floor(containerWidth * 5 / 8)}, y:${containerY + containerHeight - 60}, iconName:"plus", fontSize:24, color:subtext, zIndex:100
  * Tab 3 - Label: type:"text", x:${containerX + Math.floor(containerWidth * 5 / 8)}, y:${containerY + containerHeight - 28}, textContent:"Create", fontSize:11, color:subtext, zIndex:100
  * Tab 4 - Icon: type:"icon", x:${containerX + Math.floor(containerWidth * 7 / 8)}, y:${containerY + containerHeight - 60}, iconName:"user", fontSize:24, color:subtext, zIndex:100
  * Tab 4 - Label: type:"text", x:${containerX + Math.floor(containerWidth * 7 / 8)}, y:${containerY + containerHeight - 28}, textContent:"Profile", fontSize:11, color:subtext, zIndex:100
  * **NOTICE**: Each icon and its label share the EXACT SAME x-coordinate for perfect centering!
` : ''}

RESPONSE FORMAT:
Return ONLY a valid JSON object with this exact structure:
{
    "shapes": [
        { "type": "rectangle", "x": ${containerX}, "y": ${containerY}, "width": ${containerWidth}, "height": ${containerHeight}, "color": "#0A0A0A", "borderRadius": ${deviceLayout === 'mobile' ? 32 : 8}, "zIndex": 1 },
        { "type": "image", "x": ${contentAreaX}, "y": ${contentAreaY + 20}, "width": ${Math.floor(contentAreaWidth)}, "height": 240, "imagePrompt": "professional high-quality photo of a modern tech workspace with laptop and coffee, clean minimalist desk, natural lighting, shallow depth of field", "borderRadius": 16, "zIndex": 3 },
        { "type": "text", "x": ${contentAreaX + Math.floor(contentAreaWidth / 2)}, "y": ${contentAreaY + 290}, "textContent": "[Use contextually relevant text based on design request - e.g., 'Track Your Fitness Goals' for fitness app]", "fontSize": ${deviceLayout === 'mobile' ? 28 : 36}, "fontWeight": "bold", "color": "#FFFFFF", "zIndex": 10 },
        { "type": "image", "x": ${contentAreaX}, "y": ${contentAreaY + 330}, "width": 80, "height": 80, "imagePrompt": "professional user profile photo, friendly person smiling, studio lighting, professional headshot", "borderRadius": 40, "zIndex": 4 },
        { "type": "rectangle", "x": ${contentAreaX}, "y": ${contentAreaY + 440}, "width": 200, "height": 48, "color": "#4A90E2", "borderRadius": 12, "zIndex": 11 },
        { "type": "text", "x": ${contentAreaX + 100}, "y": ${contentAreaY + 464}, "textContent": "[Contextual CTA - e.g., 'Start Training' for fitness app]", "fontSize": 16, "fontWeight": "600", "color": "#FFFFFF", "zIndex": 12 }
    ],
    "description": "A beautiful, image-rich ${deviceLayout} design with hero image, profile photo, centered text, and call-to-action button",
    "metadata": {
        "shapeCount": 6,
        "estimatedComplexity": "simple",
        "designStyle": "${style} ${colorScheme}"
    }
}

NOTE: This example includes 2 images (hero + profile photo). Your designs should typically include 3+ images depending on complexity and context.

NOTE: Replace bracketed placeholder text with actual contextually relevant text based on the user's design request (see rule #10 above).

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
   - **ALL TEXT MUST BE CENTERED**: Use formula textX = elementX + (elementWidth / 2), textY = elementY + (elementHeight / 2)
   - **🚨 USE CONTEXTUALLY RELEVANT TEXT**: All text content (headings, buttons, labels) MUST relate to the design request's topic/industry. NO generic placeholders like "Welcome" or "Lorem Ipsum"!
   - **🖼️ MANDATORY: INCLUDE 2+ IMAGES in every design**: Every professional design needs rich visual content. Add hero images, thumbnails, profile photos, product shots, or illustrations relevant to the context. Use detailed imagePrompt values.
   
4. **${deviceLayout.toUpperCase()} BEST PRACTICES:**
   ${deviceLayout === 'mobile'
            ? `- Single column, vertical stacking
   - Large touch targets (44px+ height)
   - Full-width elements with edge padding
   - Bottom-aligned primary actions
   
   🚨 **MANDATORY BOTTOM TAB BAR (CRITICAL):**
   - EVERY mobile design MUST include a bottom navigation tab bar (no background rectangle needed)
   - Include 4 tab items (Home, Search, Create, Profile) using icon shapes and text labels
   - Use type: "icon" with iconName: "home", "search", "plus", "user" and fontSize: 24
   - **CRITICAL**: Each tab's icon and label MUST share the SAME x-coordinate (centered alignment)
   - Icon y: ${containerY + containerHeight - 60}, Label y: ${containerY + containerHeight - 28}
   - Tab x-positions (for 4 tabs): ${containerX + Math.floor(containerWidth / 8)}, ${containerX + Math.floor(containerWidth * 3 / 8)}, ${containerX + Math.floor(containerWidth * 5 / 8)}, ${containerX + Math.floor(containerWidth * 7 / 8)}
   - First tab should be active (primary color), others inactive (subtext color)
   - zIndex: 100 for all tab items
   - Main content MUST NOT extend below y:${containerY + containerHeight - 100} to avoid tab bar overlap
   
   🚨 **TEXT POSITIONING RULES:**
   - For text in buttons/cards: Use centering formula (textX = elementX + elementWidth/2)
   - For standalone text: Center it horizontally (x ≈ ${contentAreaX + Math.floor(contentAreaWidth / 2)})
   - All text must stay between y:${contentAreaY + 20} and y:${containerY + containerHeight - 100}`
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

        // Process any image shapes to generate actual images
        const imageShapes = designSpec.shapes.filter(s => s.type === 'image' && s.imagePrompt);
        if (imageShapes.length > 0) {
            console.log(`[ComplexDesign] Processing ${imageShapes.length} image shape(s)...`);
            designSpec.shapes = await processImageShapes(designSpec.shapes);
            console.log('[ComplexDesign] Image processing complete');
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

CRITICAL: Return ONLY a valid JSON object with this EXACT structure:
{
    "shapes": [array of shape objects],
    "description": "string describing the variation",
    "metadata": {
        "shapeCount": number,
        "estimatedComplexity": "simple" | "moderate" | "complex",
        "designStyle": "string describing the style"
    }
}

RESPONSE FORMAT RULES:
1. Return ONLY the raw JSON object - NO markdown, NO code blocks, NO explanations
2. Start with { and end with }
3. NO trailing commas before closing braces or brackets
4. NO comments (no // or /* */)
5. ALL string values must use double quotes, not single quotes
6. The "shapes" array MUST contain at least one shape
7. All three top-level fields (shapes, description, metadata) are REQUIRED

Do not include any markdown formatting, code blocks, or explanatory text - ONLY the raw JSON object.`;

    const userPrompt = `Original Design (${originalShapes.length} shapes):
${JSON.stringify(originalShapes, null, 2)}

Variation Request: ${variationRequest}

Create a variation of this design that incorporates the requested changes. Maintain the overall structure but apply the modifications thoughtfully.

CRITICAL: Your response must be a complete JSON object with shapes, description, and metadata fields. Return ONLY the raw JSON object, no other text.`;

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


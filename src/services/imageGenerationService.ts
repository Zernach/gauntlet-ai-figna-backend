import { getAPIKey } from '../config/apiKeys';

export interface ImageGenerationRequest {
    prompt: string;
    style?: 'vivid' | 'natural';
    size?: '1024x1024' | '1024x1792' | '1792x1024';
    quality?: 'standard' | 'hd';
}

export interface ImageGenerationResult {
    imageUrl: string;
    revisedPrompt: string;
    width: number;
    height: number;
}

/**
 * Generate a single image using DALL-E 3
 */
export async function generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const apiKey = getAPIKey('openai');
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }

    const { prompt, style = 'vivid', size = '1792x1024', quality = 'hd' } = request;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'dall-e-3',
            prompt,
            size,
            quality,
            style,
            n: 1,
        }),
    });

    if (!response.ok) {
        const error = await response.json() as { error?: { message?: string } };
        throw new Error(`DALL-E API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json() as { data: Array<{ url: string; revised_prompt?: string }> };
    const imageData = data.data[0];

    // Parse dimensions from size parameter
    const [width, height] = size.split('x').map(Number);

    return {
        imageUrl: imageData.url,
        revisedPrompt: imageData.revised_prompt || prompt,
        width,
        height,
    };
}

/**
 * Generate multiple images in parallel
 */
export async function generateImages(requests: ImageGenerationRequest[]): Promise<ImageGenerationResult[]> {
    return Promise.all(requests.map(request => generateImage(request)));
}


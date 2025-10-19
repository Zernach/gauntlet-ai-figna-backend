/**
 * Utility to fix existing image shapes that have localhost proxy URLs saved
 * This script extracts the real DALL-E URLs from proxy URLs and updates the database
 * 
 * Run with: npx tsx src/utils/fixImageUrls.ts
 */

import { getDatabaseClient } from '../config/database';

/**
 * Extract the real image URL from proxy URLs
 */
function extractRealImageUrl(url: string): string | null {
    try {
        // Check if this is a proxy URL pattern
        if (url.includes('/api/voice/proxy-image?url=') || url.includes('/proxy-image?url=')) {
            // Extract the URL parameter
            const urlObj = new URL(url, 'http://localhost:3001');
            const realUrl = urlObj.searchParams.get('url');

            if (realUrl) {
                return decodeURIComponent(realUrl);
            }
        }

        // If it's a localhost URL without the proxy pattern, it's invalid
        if (url.includes('localhost') || url.includes('127.0.0.1')) {
            return null;
        }

        // Return null if no extraction needed (URL is already valid)
        return null;
    } catch (error) {
        console.error('Error extracting URL:', error);
        return null;
    }
}

async function fixImageUrls() {
    const client = getDatabaseClient();

    console.log('🔍 Scanning for image shapes with localhost URLs...\n');

    // Find all image shapes with localhost URLs
    const { data: shapes, error: fetchError } = await client
        .from('canvas_objects')
        .select('id, image_url, canvas_id')
        .eq('type', 'image')
        .eq('is_deleted', false)
        .or('image_url.ilike.%localhost%,image_url.ilike.%127.0.0.1%');

    if (fetchError) {
        console.error('❌ Error fetching shapes:', fetchError);
        return;
    }

    if (!shapes || shapes.length === 0) {
        console.log('✅ No shapes with localhost URLs found. Database is clean!');
        return;
    }

    console.log(`📊 Found ${shapes.length} shape(s) with localhost URLs\n`);

    let fixedCount = 0;
    let failedCount = 0;

    for (const shape of shapes) {
        const imageUrl = shape.image_url;

        if (!imageUrl) {
            console.log(`⚠️  Shape ${shape.id}: No image_url found`);
            failedCount++;
            continue;
        }

        console.log(`🔧 Processing shape ${shape.id}...`);
        console.log(`   Current URL: ${imageUrl.substring(0, 100)}...`);

        const realUrl = extractRealImageUrl(imageUrl);

        if (!realUrl) {
            console.log(`   ❌ Could not extract real URL (invalid format)`);
            failedCount++;
            continue;
        }

        console.log(`   Real URL: ${realUrl.substring(0, 100)}...`);

        // Update the shape with the real URL
        const { error: updateError } = await client
            .from('canvas_objects')
            .update({
                image_url: realUrl,
                updated_at: new Date().toISOString(),
            })
            .eq('id', shape.id);

        if (updateError) {
            console.log(`   ❌ Failed to update: ${updateError.message}`);
            failedCount++;
        } else {
            console.log(`   ✅ Fixed successfully\n`);
            fixedCount++;
        }
    }

    console.log('\n📈 Summary:');
    console.log(`   ✅ Fixed: ${fixedCount}`);
    console.log(`   ❌ Failed: ${failedCount}`);
    console.log(`   📊 Total: ${shapes.length}`);
}

// Run the fix
fixImageUrls()
    .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });


import { getDatabaseClient } from '../config/database';
import { Canvas, CanvasObject, CreateShapeRequest, UpdateShapeRequest } from '../types';

/**
 * Simple LRU cache for frequently accessed data
 */
class LRUCache<T> {
    private cache: Map<string, { value: T; timestamp: number }> = new Map();
    private maxSize: number;
    private ttlMs: number;

    constructor(maxSize: number = 100, ttlMs: number = 5000) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    get(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if entry is expired
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return null;
        }

        // Move to end (most recent)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }

    set(key: string, value: T): void {
        // Remove oldest entry if cache is full
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, { value, timestamp: Date.now() });
    }

    invalidate(key: string): void {
        this.cache.delete(key);
    }

    invalidatePattern(pattern: string): void {
        const keys = Array.from(this.cache.keys());
        for (const key of keys) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }
}

export class CanvasService {
    // Cache instances
    private static canvasCache = new LRUCache<Canvas>(10, 30000); // 30s TTL for canvases
    private static shapesCache = new LRUCache<CanvasObject[]>(50, 5000); // 5s TTL for shapes
    private static shapeCache = new LRUCache<CanvasObject>(200, 3000); // 3s TTL for individual shapes

    // Public canvas ID - hardcoded for global shared canvas
    private static readonly PUBLIC_CANVAS_ID = '00000000-0000-0000-0000-000000000000';
    private static readonly PUBLIC_CANVAS_OWNER_ID = '00000000-0000-0000-0000-000000000001'; // System user

    /**
     * Extract the real image URL from proxy URLs
     * NEVER save localhost URLs to the database
     * @param url The URL to process (might be a proxy URL)
     * @returns The real image URL (unwrapped from proxy if necessary)
     */
    private static extractRealImageUrl(url: string): string {
        try {
            // Check if this is a proxy URL pattern: /api/voice/proxy-image?url=...
            if (url.includes('/api/voice/proxy-image?url=') || url.includes('/proxy-image?url=')) {
                // Extract the URL parameter from the proxy URL
                const urlObj = new URL(url, 'http://localhost:3001'); // Provide base for relative URLs
                const realUrl = urlObj.searchParams.get('url');

                if (realUrl) {
                    // Decode and return the real URL
                    return decodeURIComponent(realUrl);
                }
            }

            // If it's a localhost URL without the proxy pattern, reject it
            if (url.includes('localhost') || url.includes('127.0.0.1')) {
                throw new Error('Localhost URLs cannot be saved to the database');
            }

            // Return the URL as-is if it's not a proxy URL
            return url;
        } catch (error) {
            console.error('[CanvasService] Error extracting real image URL:', error);
            throw new Error(`Invalid image URL: ${error instanceof Error ? error.message : 'URL processing failed'}`);
        }
    }

    /**
     * Ensure the system user exists (for owning public resources)
     */
    private static async ensureSystemUser(): Promise<void> {
        const client = getDatabaseClient();

        // Check if system user already exists
        const { data: existingUser } = await client
            .from('users')
            .select('id')
            .eq('id', this.PUBLIC_CANVAS_OWNER_ID)
            .single();

        if (existingUser) {
            return; // System user already exists
        }

        // Create system user
        const { error: userError } = await client
            .from('users')
            .insert({
                id: this.PUBLIC_CANVAS_OWNER_ID,
                username: 'system',
                email: 'system@figna.app',
                display_name: 'System',
                avatar_color: '#3B82F6',
                is_online: false,
            });

        if (userError) {
            // Don't throw - system user might already exist (race condition)
        }
    }

    /**
     * Ensure the public canvas exists, create it if it doesn't
     */
    private static async ensurePublicCanvas(): Promise<Canvas> {
        const client = getDatabaseClient();

        // First ensure system user exists
        await this.ensureSystemUser();

        // Try to find existing public canvas
        const { data: existingCanvas } = await client
            .from('canvases')
            .select('*')
            .eq('id', this.PUBLIC_CANVAS_ID)
            .eq('is_deleted', false)
            .single();

        if (existingCanvas) {
            return existingCanvas as Canvas;
        }

        // Create the public canvas if it doesn't exist
        const { data: newCanvas, error: createError } = await client
            .from('canvases')
            .insert({
                id: this.PUBLIC_CANVAS_ID,
                owner_id: this.PUBLIC_CANVAS_OWNER_ID,
                name: 'Public Canvas',
                description: 'A shared canvas accessible by all users',
                is_public: true,
                is_template: false,
                background_color: '#1a1a1a',
                viewport_x: 0,
                viewport_y: 0,
                viewport_zoom: 1.0,
                grid_enabled: false,
                grid_size: 20,
                snap_to_grid: false,
                last_accessed_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (createError) {
            throw createError;
        }

        return newCanvas as Canvas;
    }

    /**
     * Get all canvases accessible to a user (owned + shared)
     * Always includes the public canvas at the top
     * Ordered by last accessed time (most recent first)
     */
    static async getUserCanvases(userId: string): Promise<Canvas[]> {
        const client = getDatabaseClient();

        // Ensure public canvas exists
        const publicCanvas = await this.ensurePublicCanvas();

        // Get canvases where user is owner or collaborator
        const { data: ownedCanvases, error: ownedError } = await client
            .from('canvases')
            .select('*')
            .eq('owner_id', userId)
            .eq('is_deleted', false)
            .order('last_accessed_at', { ascending: false, nullsFirst: false });

        if (ownedError) throw ownedError;

        // TODO: Add collaborator canvases when collaboration feature is implemented
        // Return public canvas first, then user's owned canvases
        return [publicCanvas, ...(ownedCanvases || [])] as Canvas[];
    }

    /**
     * Create a new canvas
     */
    static async create(userId: string, data: {
        name: string;
        description?: string;
        backgroundColor?: string;
        isPublic?: boolean;
    }): Promise<Canvas> {
        const client = getDatabaseClient();

        const { data: newCanvas, error: createError } = await client
            .from('canvases')
            .insert({
                owner_id: userId,
                name: data.name || 'Untitled Canvas',
                description: data.description || '',
                is_public: data.isPublic !== undefined ? data.isPublic : false,
                background_color: data.backgroundColor || '#1a1a1a',
                viewport_x: 0,
                viewport_y: 0,
                viewport_zoom: 1.0,
                grid_enabled: false,
                grid_size: 20,
                snap_to_grid: false,
                last_accessed_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (createError) throw createError;
        return newCanvas as Canvas;
    }

    /**
     * Get or create default canvas for user
     * Used for initial login to ensure user always has at least one canvas
     */
    static async getOrCreateDefaultCanvas(userId: string): Promise<Canvas> {
        const canvases = await this.getUserCanvases(userId);

        if (canvases.length > 0) {
            // Return most recently accessed canvas
            return canvases[0];
        }

        // Create default canvas for new user
        return this.create(userId, {
            name: 'My First Canvas',
            description: 'Welcome to Figna!',
            backgroundColor: '#1a1a1a',
            isPublic: false,
        });
    }

    /**
     * Get canvas by ID
     */
    static async findById(canvasId: string): Promise<Canvas | null> {
        // Check cache first
        const cached = this.canvasCache.get(canvasId);
        if (cached) {
            return cached;
        }

        const client = getDatabaseClient();
        const { data, error } = await client
            .from('canvases')
            .select('*')
            .eq('id', canvasId)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return null;

        const canvas = data as Canvas;
        this.canvasCache.set(canvasId, canvas);
        return canvas;
    }

    /**
     * Update canvas
     */
    static async update(canvasId: string, data: Partial<Canvas>): Promise<Canvas> {
        const client = getDatabaseClient();

        const updateData: any = {};
        const allowedFields = [
            'name', 'description', 'is_public', 'viewport_x', 'viewport_y',
            'viewport_zoom', 'background_color', 'grid_enabled', 'grid_size', 'snap_to_grid'
        ];

        for (const field of allowedFields) {
            if (data[field as keyof Canvas] !== undefined) {
                updateData[field] = data[field as keyof Canvas];
            }
        }

        if (Object.keys(updateData).length === 0) {
            throw new Error('No fields to update');
        }

        updateData.updated_at = new Date().toISOString();

        const { data: updatedCanvas, error } = await client
            .from('canvases')
            .update(updateData)
            .eq('id', canvasId)
            .eq('is_deleted', false)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new Error('Canvas not found');
            }
            throw error;
        }

        const canvas = updatedCanvas as Canvas;
        // Invalidate cache on update
        this.canvasCache.invalidate(canvasId);
        return canvas;
    }

    /**
     * Delete canvas (soft delete)
     * Only owner can delete the canvas
     * Public canvas cannot be deleted
     */
    static async delete(canvasId: string, userId: string): Promise<boolean> {
        const client = getDatabaseClient();

        // Prevent deletion of public canvas
        if (canvasId === this.PUBLIC_CANVAS_ID) {
            throw new Error('The public canvas cannot be deleted');
        }

        // First check if user is the owner
        const canvas = await this.findById(canvasId);
        if (!canvas) {
            throw new Error('Canvas not found');
        }

        if (canvas.owner_id !== userId) {
            throw new Error('Only the canvas owner can delete it');
        }

        // Soft delete the canvas
        const { error } = await client
            .from('canvases')
            .update({
                is_deleted: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', canvasId)
            .eq('is_deleted', false);

        if (error) {
            return false;
        }

        // Invalidate cache
        this.canvasCache.invalidate(canvasId);
        this.shapesCache.invalidate(`shapes:${canvasId}`);

        return true;
    }

    /**
     * Get all shapes for a canvas
     */
    static async getShapes(canvasId: string): Promise<CanvasObject[]> {
        // Check cache first
        const cacheKey = `shapes:${canvasId}`;
        const cached = this.shapesCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const client = getDatabaseClient();
        const { data, error } = await client
            .from('canvas_objects')
            .select('*')
            .eq('canvas_id', canvasId)
            .eq('is_deleted', false)
            .order('z_index', { ascending: true });

        if (error) throw error;

        const shapes = (data || []) as CanvasObject[];
        this.shapesCache.set(cacheKey, shapes);
        return shapes;
    }

    /**
     * Get shapes in a specific viewport region (spatial query)
     * Optimized for large canvases with 1000+ objects
     * @param canvasId Canvas ID
     * @param viewport Viewport bounds { minX, maxX, minY, maxY }
     * @param limit Maximum number of shapes to return (default: 500)
     */
    static async getShapesInViewport(
        canvasId: string,
        viewport: { minX: number; maxX: number; minY: number; maxY: number },
        limit: number = 500
    ): Promise<CanvasObject[]> {
        const client = getDatabaseClient();

        // Use spatial query with indexed columns
        const { data, error } = await client
            .from('canvas_objects')
            .select('*')
            .eq('canvas_id', canvasId)
            .eq('is_deleted', false)
            .gte('x', viewport.minX)
            .lte('x', viewport.maxX)
            .gte('y', viewport.minY)
            .lte('y', viewport.maxY)
            .order('z_index', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return (data || []) as CanvasObject[];
    }

    /**
     * Get shape by ID
     */
    static async getShapeById(shapeId: string): Promise<CanvasObject | null> {
        // Check cache first
        const cached = this.shapeCache.get(shapeId);
        if (cached) {
            return cached;
        }

        const client = getDatabaseClient();
        const { data, error } = await client
            .from('canvas_objects')
            .select('*')
            .eq('id', shapeId)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return null;

        const shape = data as CanvasObject;
        this.shapeCache.set(shapeId, shape);
        return shape;
    }

    /**
     * Create shape
     */
    static async createShape(
        canvasId: string,
        userId: string,
        shapeData: CreateShapeRequest
    ): Promise<CanvasObject> {
        const client = getDatabaseClient();

        // Get next z-index
        const { data: maxZData } = await client
            .from('canvas_objects')
            .select('z_index')
            .eq('canvas_id', canvasId)
            .order('z_index', { ascending: false })
            .limit(1)
            .single();

        const nextZIndex = (maxZData?.z_index || 0) + 1;

        // Set default image URL and dimensions for image type if not provided
        let imageUrl = shapeData.imageUrl;
        let width = shapeData.width;
        let height = shapeData.height;

        if (shapeData.type === 'image') {
            // CRITICAL FIX: Extract real URL from proxy URLs
            // Never save localhost URLs to the database
            if (imageUrl) {
                imageUrl = this.extractRealImageUrl(imageUrl);
            }

            if (!imageUrl) {
                imageUrl = 'https://raw.githubusercontent.com/landscapesupply/images/refs/heads/main/products/sod/TifBlaire_Centipede_Grass_Sod_Sale_Landscape_Supply_App.png';
            }
            if (!width) {
                width = 800;
            }
            if (!height) {
                height = 525;
            }
        }

        const { data: shape, error } = await client
            .from('canvas_objects')
            .insert({
                canvas_id: canvasId,
                type: shapeData.type,
                x: shapeData.x,
                y: shapeData.y,
                width: width,
                height: height,
                radius: shapeData.radius,
                rotation: shapeData.rotation || 0,
                color: shapeData.color,
                stroke_color: shapeData.strokeColor,
                stroke_width: shapeData.strokeWidth || 0,
                opacity: shapeData.opacity || 1.0,
                shadow_color: shapeData.shadowColor,
                shadow_strength: shapeData.shadowStrength,
                border_radius: shapeData.borderRadius || 0,
                text_content: shapeData.textContent,
                font_size: shapeData.fontSize,
                font_family: shapeData.fontFamily || 'Inter',
                font_weight: shapeData.fontWeight || 'normal',
                text_align: shapeData.textAlign || 'left',
                image_url: imageUrl,
                icon_name: shapeData.iconName,
                keep_aspect_ratio: shapeData.keepAspectRatio ?? (shapeData.type === 'image' ? true : undefined),
                z_index: shapeData.zIndex || nextZIndex,
                created_by: userId,
            })
            .select()
            .single();

        if (error) throw error;

        const createdShape = shape as CanvasObject;
        // Invalidate shapes cache for this canvas
        this.shapesCache.invalidate(`shapes:${canvasId}`);
        return createdShape;
    }

    /**
     * Update shape
     */
    static async updateShape(
        shapeId: string,
        userId: string,
        shapeData: UpdateShapeRequest
    ): Promise<CanvasObject> {
        const client = getDatabaseClient();

        const updateData: any = {};
        const fieldMap: Record<string, string> = {
            x: 'x', y: 'y', width: 'width', height: 'height', radius: 'radius',
            rotation: 'rotation', color: 'color', strokeColor: 'stroke_color',
            strokeWidth: 'stroke_width', opacity: 'opacity', shadowColor: 'shadow_color', shadowStrength: 'shadow_strength', borderRadius: 'border_radius', textContent: 'text_content',
            fontSize: 'font_size', fontFamily: 'font_family', fontWeight: 'font_weight',
            textAlign: 'text_align', imageUrl: 'image_url', iconName: 'icon_name',
            keepAspectRatio: 'keep_aspect_ratio',
            zIndex: 'z_index', lockedAt: 'locked_at',
            lockedBy: 'locked_by', isVisible: 'is_visible'
        };

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (shapeData[key as keyof UpdateShapeRequest] !== undefined) {
                let value = shapeData[key as keyof UpdateShapeRequest];

                // CRITICAL FIX: Extract real URL from proxy URLs for imageUrl
                if (key === 'imageUrl' && typeof value === 'string') {
                    value = this.extractRealImageUrl(value);
                }

                updateData[dbField] = value;
            }
        }

        if (Object.keys(updateData).length === 0) {
            throw new Error('No fields to update');
        }

        updateData.last_modified_by = userId;
        updateData.updated_at = new Date().toISOString();

        const { data: updatedShape, error } = await client
            .from('canvas_objects')
            .update(updateData)
            .eq('id', shapeId)
            .eq('is_deleted', false)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new Error('Shape not found');
            }
            throw error;
        }

        const shape = updatedShape as CanvasObject;
        // Invalidate caches
        this.shapeCache.invalidate(shapeId);
        // Get canvas_id from the shape to invalidate shapes cache
        if ((shape as any).canvas_id) {
            this.shapesCache.invalidate(`shapes:${(shape as any).canvas_id}`);
        }
        return shape;
    }

    /**
     * Delete shapes (soft delete)
     */
    static async deleteShapes(shapeIds: string[]): Promise<boolean> {
        if (!shapeIds || shapeIds.length === 0) {
            return true; // Nothing to delete
        }

        const client = getDatabaseClient();

        // Get shapes first to invalidate canvas cache
        const canvasIds = new Set<string>();
        for (const shapeId of shapeIds) {
            const shape = await this.getShapeById(shapeId);
            if (shape && (shape as any).canvas_id) {
                canvasIds.add((shape as any).canvas_id);
            }
        }

        const { error } = await client
            .from('canvas_objects')
            .update({
                is_deleted: true,
                updated_at: new Date().toISOString(),
            })
            .in('id', shapeIds)
            .eq('is_deleted', false);

        // Invalidate caches
        shapeIds.forEach(shapeId => this.shapeCache.invalidate(shapeId));
        canvasIds.forEach(canvasId => this.shapesCache.invalidate(`shapes:${canvasId}`));

        return !error;
    }

    /**
     * Batch update shapes
     */
    static async batchUpdateShapes(
        updates: Array<{ id: string; data: UpdateShapeRequest }>,
        userId: string
    ): Promise<CanvasObject[]> {
        const results: CanvasObject[] = [];

        for (const update of updates) {
            const shape = await this.updateShape(update.id, userId, update.data);
            results.push(shape);
        }

        return results;
    }

    /**
     * Check if user has access to canvas
     * User has access if they are:
     * 1. The owner
     * 2. A collaborator (TODO: implement when collaboration feature is added)
     * 3. Canvas is public (read-only)
     */
    static async checkAccess(canvasId: string, userId: string): Promise<boolean> {
        const client = getDatabaseClient();

        // Public canvas is accessible to everyone
        if (canvasId === this.PUBLIC_CANVAS_ID) {
            return true;
        }

        const { data, error } = await client
            .from('canvases')
            .select('id, owner_id, is_public')
            .eq('id', canvasId)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return false;

        // Owner always has access
        if (data.owner_id === userId) return true;

        // TODO: Check collaborators table when collaboration feature is implemented

        // Public canvases are accessible to all
        return data.is_public === true;
    }

    /**
     * Update last accessed timestamp
     */
    static async updateLastAccessed(canvasId: string): Promise<void> {
        const client = getDatabaseClient();
        await client
            .from('canvases')
            .update({ last_accessed_at: new Date().toISOString() })
            .eq('id', canvasId);
    }

    /**
     * Check if a shape's lock has expired (>10 seconds old)
     */
    static isLockExpired(lockedAt?: Date): boolean {
        if (!lockedAt) return true;
        const lockDuration = Date.now() - new Date(lockedAt).getTime();
        return lockDuration > 5000; // 10 seconds
    }

    /**
     * Auto-unlock shapes that have been locked for more than 10 seconds
     * Returns the count of shapes unlocked
     */
    static async autoUnlockExpiredShapes(canvasId: string): Promise<number> {
        const client = getDatabaseClient();

        // Calculate the timestamp for 10 seconds ago
        const tenSecondsAgo = new Date(Date.now() - 5000).toISOString();

        const { data, error } = await client
            .from('canvas_objects')
            .update({
                locked_at: null,
                locked_by: null,
                updated_at: new Date().toISOString(),
            })
            .eq('canvas_id', canvasId)
            .not('locked_at', 'is', null)
            .lt('locked_at', tenSecondsAgo)
            .eq('is_deleted', false)
            .select();

        if (error) {
            return 0;
        }

        return data?.length || 0;
    }

    /**
     * Get all expired locks for a canvas
     * Used to notify clients about auto-unlocked shapes
     */
    static async getExpiredLocks(canvasId: string): Promise<CanvasObject[]> {
        const client = getDatabaseClient();

        const tenSecondsAgo = new Date(Date.now() - 5000).toISOString();

        const { data, error } = await client
            .from('canvas_objects')
            .select('*')
            .eq('canvas_id', canvasId)
            .not('locked_at', 'is', null)
            .lt('locked_at', tenSecondsAgo)
            .eq('is_deleted', false);

        if (error) return [];
        return (data || []) as CanvasObject[];
    }

    /**
     * Unlock all shapes locked by a specific user
     * Used when a user disconnects
     */
    static async unlockShapesByUser(userId: string, canvasId: string): Promise<CanvasObject[]> {
        const client = getDatabaseClient();

        const { data, error } = await client
            .from('canvas_objects')
            .update({
                locked_at: null,
                locked_by: null,
                updated_at: new Date().toISOString(),
            })
            .eq('canvas_id', canvasId)
            .eq('locked_by', userId)
            .not('locked_at', 'is', null)
            .eq('is_deleted', false)
            .select();

        if (error) {
            return [];
        }

        return (data || []) as CanvasObject[];
    }

    /**
     * Group multiple shapes together
     * Assigns a unique group_id to all specified shapes
     * @param shapeIds Array of shape IDs to group
     * @param userId User performing the operation
     * @returns Array of updated shapes with group_id assigned
     */
    static async groupShapes(shapeIds: string[], userId: string): Promise<CanvasObject[]> {
        if (!shapeIds || shapeIds.length < 2) {
            throw new Error('At least 2 shapes are required to create a group');
        }

        const client = getDatabaseClient();

        // Generate a unique group ID (UUID)
        const { v4: uuidv4 } = require('uuid');
        const groupId = uuidv4();

        // Update all shapes with the new group_id
        const { data, error } = await client
            .from('canvas_objects')
            .update({
                group_id: groupId,
                last_modified_by: userId,
                updated_at: new Date().toISOString(),
            })
            .in('id', shapeIds)
            .eq('is_deleted', false)
            .select();

        if (error) {
            throw new Error(`Failed to group shapes: ${error.message}`);
        }

        if (!data || data.length === 0) {
            throw new Error('No shapes found to group');
        }

        // Invalidate caches for these shapes and their canvas
        data.forEach((shape: any) => {
            this.shapeCache.invalidate(shape.id);
            if (shape.canvas_id) {
                this.shapesCache.invalidate(`shapes:${shape.canvas_id}`);
            }
        });

        return data as CanvasObject[];
    }

    /**
     * Ungroup shapes by removing their group_id
     * @param shapeIds Array of shape IDs to ungroup
     * @param userId User performing the operation
     * @returns Array of updated shapes with group_id removed
     */
    static async ungroupShapes(shapeIds: string[], userId: string): Promise<CanvasObject[]> {
        if (!shapeIds || shapeIds.length === 0) {
            throw new Error('At least 1 shape is required to ungroup');
        }

        const client = getDatabaseClient();

        // Get the group IDs of these shapes first
        const { data: shapesData } = await client
            .from('canvas_objects')
            .select('id, group_id, canvas_id')
            .in('id', shapeIds)
            .eq('is_deleted', false);

        if (!shapesData || shapesData.length === 0) {
            throw new Error('No shapes found to ungroup');
        }

        // Get unique group IDs
        const groupIds = [...new Set(shapesData.map((s: any) => s.group_id).filter(Boolean))];

        if (groupIds.length === 0) {
            throw new Error('Selected shapes are not part of any group');
        }

        // For each group, ungroup ALL shapes in that group (not just selected ones)
        const allShapesToUngroup: string[] = [];
        for (const groupId of groupIds) {
            const { data: groupShapes } = await client
                .from('canvas_objects')
                .select('id')
                .eq('group_id', groupId)
                .eq('is_deleted', false);

            if (groupShapes) {
                allShapesToUngroup.push(...groupShapes.map((s: any) => s.id));
            }
        }

        // Remove group_id from all shapes in the group(s)
        const { data, error } = await client
            .from('canvas_objects')
            .update({
                group_id: null,
                last_modified_by: userId,
                updated_at: new Date().toISOString(),
            })
            .in('id', allShapesToUngroup)
            .eq('is_deleted', false)
            .select();

        if (error) {
            throw new Error(`Failed to ungroup shapes: ${error.message}`);
        }

        // Invalidate caches
        if (data) {
            data.forEach((shape: any) => {
                this.shapeCache.invalidate(shape.id);
                if (shape.canvas_id) {
                    this.shapesCache.invalidate(`shapes:${shape.canvas_id}`);
                }
            });
        }

        return (data || []) as CanvasObject[];
    }

    /**
     * Get all shapes that belong to a specific group
     * @param groupId Group ID to query
     * @returns Array of shapes in the group
     */
    static async getGroupShapes(groupId: string): Promise<CanvasObject[]> {
        const client = getDatabaseClient();

        const { data, error } = await client
            .from('canvas_objects')
            .select('*')
            .eq('group_id', groupId)
            .eq('is_deleted', false)
            .order('z_index', { ascending: true });

        if (error) {
            throw new Error(`Failed to get group shapes: ${error.message}`);
        }

        return (data || []) as CanvasObject[];
    }
}

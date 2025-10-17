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
    /**
     * Get all canvases accessible to a user (owned + shared)
     * Ordered by last accessed time (most recent first)
     */
    static async getUserCanvases(userId: string): Promise<Canvas[]> {
        const client = getDatabaseClient();

        // Get canvases where user is owner or collaborator
        const { data: ownedCanvases, error: ownedError } = await client
            .from('canvases')
            .select('*')
            .eq('owner_id', userId)
            .eq('is_deleted', false)
            .order('last_accessed_at', { ascending: false, nullsFirst: false });

        if (ownedError) throw ownedError;

        // TODO: Add collaborator canvases when collaboration feature is implemented
        // For now, just return owned canvases
        return (ownedCanvases || []) as Canvas[];
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
     */
    static async delete(canvasId: string, userId: string): Promise<boolean> {
        const client = getDatabaseClient();

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
            console.error('Error deleting canvas:', error);
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

        const { data: shape, error } = await client
            .from('canvas_objects')
            .insert({
                canvas_id: canvasId,
                type: shapeData.type,
                x: shapeData.x,
                y: shapeData.y,
                width: shapeData.width,
                height: shapeData.height,
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
            textAlign: 'text_align', zIndex: 'z_index', lockedAt: 'locked_at',
            lockedBy: 'locked_by', isVisible: 'is_visible'
        };

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (shapeData[key as keyof UpdateShapeRequest] !== undefined) {
                updateData[dbField] = shapeData[key as keyof UpdateShapeRequest];
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
     * Delete shape (soft delete)
     */
    static async deleteShape(shapeId: string): Promise<boolean> {
        // Get shape first to invalidate canvas cache
        const shape = await this.getShapeById(shapeId);

        const client = getDatabaseClient();
        const { error } = await client
            .from('canvas_objects')
            .update({
                is_deleted: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', shapeId)
            .eq('is_deleted', false);

        // Invalidate caches
        this.shapeCache.invalidate(shapeId);
        if (shape && (shape as any).canvas_id) {
            this.shapesCache.invalidate(`shapes:${(shape as any).canvas_id}`);
        }

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
            console.error('Error auto-unlocking shapes:', error);
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
            console.error('Error unlocking shapes by user:', error);
            return [];
        }

        return (data || []) as CanvasObject[];
    }
}

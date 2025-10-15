import { getDatabaseClient } from '../config/database';
import { Canvas, CanvasObject, CreateShapeRequest, UpdateShapeRequest } from '../types';

export class CanvasService {
    /**
     * Get the single global canvas (or create it if it doesn't exist)
     */
    static async getGlobalCanvas(userId: string): Promise<Canvas> {
        const client = getDatabaseClient();

        // Try to get existing canvas (the first non-deleted one)
        const { data: existingCanvas, error: fetchError } = await client
            .from('canvases')
            .select('*')
            .eq('is_deleted', false)
            .limit(1)
            .single();

        if (existingCanvas) {
            return existingCanvas as Canvas;
        }

        // If no canvas exists, create the global canvas
        const { data: newCanvas, error: createError } = await client
            .from('canvases')
            .insert({
                owner_id: userId,
                name: 'Global Collaborative Canvas',
                description: 'A shared canvas for all users to collaborate',
                is_public: true,
                // Ensure a non-white default background for the global canvas
                background_color: '#1c1c1c',
            })
            .select()
            .single();

        if (createError) throw createError;
        return newCanvas as Canvas;
    }

    /**
     * Get canvas by ID
     */
    static async findById(canvasId: string): Promise<Canvas | null> {
        const client = getDatabaseClient();
        const { data, error } = await client
            .from('canvases')
            .select('*')
            .eq('id', canvasId)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return null;
        return data as Canvas;
    }

    /**
     * Update canvas
     */
    static async update(canvasId: string, data: Partial<Canvas>): Promise<Canvas> {
        const client = getDatabaseClient();

        const updateData: any = {};
        const allowedFields = [
            'name', 'description', 'isPublic', 'viewportX', 'viewportY',
            'viewportZoom', 'backgroundColor', 'gridEnabled', 'gridSize', 'snapToGrid'
        ];

        for (const field of allowedFields) {
            if (data[field as keyof Canvas] !== undefined) {
                // Convert camelCase to snake_case
                const snakeField = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                updateData[snakeField] = data[field as keyof Canvas];
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

        return updatedCanvas as Canvas;
    }

    /**
     * Delete canvas (soft delete) - DISABLED for global canvas
     * Keeping this for backward compatibility but it won't allow deletion
     */
    static async delete(canvasId: string, userId: string): Promise<boolean> {
        // Prevent deletion of the global canvas
        console.warn('Canvas deletion is disabled - using single global canvas');
        return false;
    }

    /**
     * Get all shapes for a canvas
     */
    static async getShapes(canvasId: string): Promise<CanvasObject[]> {
        const client = getDatabaseClient();
        const { data, error } = await client
            .from('canvas_objects')
            .select('*')
            .eq('canvas_id', canvasId)
            .eq('is_deleted', false)
            .order('z_index', { ascending: true });

        if (error) throw error;
        return (data || []) as CanvasObject[];
    }

    /**
     * Get shape by ID
     */
    static async getShapeById(shapeId: string): Promise<CanvasObject | null> {
        const client = getDatabaseClient();
        const { data, error } = await client
            .from('canvas_objects')
            .select('*')
            .eq('id', shapeId)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return null;
        return data as CanvasObject;
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
        return shape as CanvasObject;
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
            strokeWidth: 'stroke_width', opacity: 'opacity', shadowColor: 'shadow_color', shadowStrength: 'shadow_strength', textContent: 'text_content',
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

        return updatedShape as CanvasObject;
    }

    /**
     * Delete shape (soft delete)
     */
    static async deleteShape(shapeId: string): Promise<boolean> {
        const client = getDatabaseClient();
        const { error } = await client
            .from('canvas_objects')
            .update({
                is_deleted: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', shapeId)
            .eq('is_deleted', false);

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
     * Since we're using a single global canvas, all authenticated users have access
     */
    static async checkAccess(canvasId: string, userId: string): Promise<boolean> {
        const client = getDatabaseClient();

        const { data, error } = await client
            .from('canvases')
            .select('id, is_public')
            .eq('id', canvasId)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return false;

        // For global canvas, all users have access if it's public
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

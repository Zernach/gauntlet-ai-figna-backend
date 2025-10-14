import { getDatabaseClient } from '../config/database';
import { Canvas, CanvasObject, CreateShapeRequest, UpdateShapeRequest } from '../types';

export class CanvasService {
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
     * Get canvases for user
     */
    static async findByUserId(userId: string, limit: number = 50): Promise<Canvas[]> {
        const client = getDatabaseClient();
        const { data, error } = await client
            .from('canvases')
            .select(`
        *,
        canvas_collaborators!inner(user_id)
      `)
            .or(`owner_id.eq.${userId},canvas_collaborators.user_id.eq.${userId}`)
            .eq('is_deleted', false)
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []) as Canvas[];
    }

    /**
     * Create new canvas
     */
    static async create(data: {
        ownerId: string;
        name: string;
        description?: string;
        isPublic?: boolean;
    }): Promise<Canvas> {
        const client = getDatabaseClient();
        const { data: canvas, error } = await client
            .from('canvases')
            .insert({
                owner_id: data.ownerId,
                name: data.name,
                description: data.description,
                is_public: data.isPublic || false,
            })
            .select()
            .single();

        if (error) throw error;
        return canvas as Canvas;
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
     * Delete canvas (soft delete)
     */
    static async delete(canvasId: string, userId: string): Promise<boolean> {
        const client = getDatabaseClient();
        const { error } = await client
            .from('canvases')
            .update({
                is_deleted: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', canvasId)
            .eq('owner_id', userId)
            .eq('is_deleted', false);

        return !error;
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
                text_content: shapeData.textContent,
                font_size: shapeData.fontSize,
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
            strokeWidth: 'stroke_width', opacity: 'opacity', textContent: 'text_content',
            fontSize: 'font_size', zIndex: 'z_index', isLocked: 'is_locked',
            isVisible: 'is_visible'
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
     */
    static async checkAccess(canvasId: string, userId: string): Promise<boolean> {
        const client = getDatabaseClient();

        const { data, error } = await client
            .from('canvases')
            .select(`
        id,
        owner_id,
        is_public,
        canvas_collaborators(user_id)
      `)
            .eq('id', canvasId)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return false;

        // User has access if they're the owner, or it's public, or they're a collaborator
        return (
            data.owner_id === userId ||
            data.is_public === true ||
            (data.canvas_collaborators && data.canvas_collaborators.some((c: any) => c.user_id === userId))
        );
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
}

import { getDatabaseClient } from '../config/database';
import { Presence } from '../types';

export class PresenceService {
    /**
     * Update or create presence record
     */
    static async upsert(data: {
        userId: string;
        canvasId: string;
        cursorX: number;
        cursorY: number;
        viewportX?: number;
        viewportY?: number;
        viewportZoom?: number;
        selectedObjectIds?: string[];
        color: string;
        connectionId: string;
    }): Promise<Presence> {
        const client = getDatabaseClient();

        const presenceData = {
            user_id: data.userId,
            canvas_id: data.canvasId,
            cursor_x: data.cursorX,
            cursor_y: data.cursorY,
            viewport_x: data.viewportX,
            viewport_y: data.viewportY,
            viewport_zoom: data.viewportZoom,
            selected_object_ids: data.selectedObjectIds || [],
            color: data.color,
            connection_id: data.connectionId,
            is_active: true,
            last_heartbeat: new Date().toISOString(),
        };

        const { data: presence, error } = await client
            .from('presence')
            .upsert(presenceData, {
                onConflict: 'user_id,canvas_id',
            })
            .select()
            .single();

        if (error) throw error;
        return presence as Presence;
    }

    /**
     * Update heartbeat
     */
    static async updateHeartbeat(userId: string, canvasId: string): Promise<void> {
        const client = getDatabaseClient();
        await client
            .from('presence')
            .update({
                last_heartbeat: new Date().toISOString(),
                is_active: true,
            })
            .eq('user_id', userId)
            .eq('canvas_id', canvasId);
    }

    /**
     * Get active users on canvas
     */
    static async getActiveUsers(canvasId: string): Promise<Presence[]> {
        const client = getDatabaseClient();
        const ttlSeconds = parseInt(process.env.PRESENCE_TTL_SECONDS || '30');

        const cutoffTime = new Date(Date.now() - ttlSeconds * 1000).toISOString();

        const { data, error } = await client
            .from('presence')
            .select(`
        *,
        users!inner(username, display_name, email, avatar_color)
      `)
            .eq('canvas_id', canvasId)
            .eq('is_active', true)
            .gte('last_heartbeat', cutoffTime);

        if (error) throw error;
        return (data || []) as Presence[];
    }

    /**
     * Remove user presence
     */
    static async remove(userId: string, canvasId: string): Promise<void> {
        const client = getDatabaseClient();
        await client
            .from('presence')
            .delete()
            .eq('user_id', userId)
            .eq('canvas_id', canvasId);
    }

    /**
     * Remove by connection ID
     */
    static async removeByConnectionId(connectionId: string): Promise<void> {
        const client = getDatabaseClient();
        await client
            .from('presence')
            .delete()
            .eq('connection_id', connectionId);
    }

    /**
     * Cleanup stale presence records
     */
    static async cleanupStale(): Promise<number> {
        const client = getDatabaseClient();
        const ttlSeconds = parseInt(process.env.PRESENCE_TTL_SECONDS || '30');

        const cutoffTime = new Date(Date.now() - ttlSeconds * 1000).toISOString();

        const { error, count } = await client
            .from('presence')
            .delete()
            .lt('last_heartbeat', cutoffTime);

        return count || 0;
    }

    /**
     * Set user as inactive
     */
    static async setInactive(userId: string, canvasId: string): Promise<void> {
        const client = getDatabaseClient();
        await client
            .from('presence')
            .update({ is_active: false })
            .eq('user_id', userId)
            .eq('canvas_id', canvasId);
    }
}

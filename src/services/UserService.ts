import { getDatabaseClient } from '../config/database';
import { User } from '../types';

export class UserService {
    /**
     * Find user by Supabase UID
     */
    static async findBySupabaseId(supabaseUid: string): Promise<User | null> {
        const client = getDatabaseClient();
        const { data, error } = await client
            .from('users')
            .select('*')
            .eq('id', supabaseUid)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return null;
        return data as User;
    }

    /**
     * Find user by email
     */
    static async findByEmail(email: string): Promise<User | null> {
        const client = getDatabaseClient();
        const { data, error } = await client
            .from('users')
            .select('*')
            .eq('email', email)
            .eq('is_deleted', false)
            .single();

        if (error || !data) return null;
        return data as User;
    }

    /**
     * Create new user
     */
    static async create(data: {
        id: string;
        username: string;
        email: string;
        displayName?: string;
        avatarColor?: string;
        avatarUrl?: string;
    }): Promise<User> {
        const client = getDatabaseClient();

        const userData = {
            id: data.id,
            username: data.username,
            email: data.email,
            display_name: data.displayName || data.username,
            avatar_color: data.avatarColor || this.generateRandomColor(),
            avatar_url: data.avatarUrl,
        };

        const { data: newUser, error } = await client
            .from('users')
            .insert(userData)
            .select()
            .single();

        if (error) throw error;
        return newUser as User;
    }

    /**
     * Update user
     */
    static async update(
        userId: string,
        data: Partial<Pick<User, 'username' | 'displayName' | 'avatarColor' | 'avatarUrl' | 'preferences'>>
    ): Promise<User> {
        const client = getDatabaseClient();

        const updateData: any = {};
        if (data.username !== undefined) updateData.username = data.username;
        if (data.displayName !== undefined) updateData.display_name = data.displayName;
        if (data.avatarColor !== undefined) updateData.avatar_color = data.avatarColor;
        if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;
        if (data.preferences !== undefined) updateData.preferences = data.preferences;

        if (Object.keys(updateData).length === 0) {
            throw new Error('No fields to update');
        }

        updateData.updated_at = new Date().toISOString();

        const { data: updatedUser, error } = await client
            .from('users')
            .update(updateData)
            .eq('id', userId)
            .eq('is_deleted', false)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new Error('User not found');
            }
            throw error;
        }

        return updatedUser as User;
    }

    /**
     * Update user online status
     */
    static async updateOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
        const client = getDatabaseClient();
        await client
            .from('users')
            .update({
                is_online: isOnline,
                last_seen_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', userId);
    }

    /**
     * Get or create user from Supabase auth
     */
    static async getOrCreateFromSupabase(supabaseData: {
        uid: string;
        email: string;
        name?: string;
        picture?: string;
    }): Promise<User> {
        // Check if user exists
        let user = await this.findBySupabaseId(supabaseData.uid);

        if (!user) {
            // Create new user
            const username = supabaseData.email.split('@')[0];
            const avatarColor = this.generateRandomColor();

            user = await this.create({
                id: supabaseData.uid,
                username,
                email: supabaseData.email,
                displayName: supabaseData.name || username,
                avatarColor,
                avatarUrl: supabaseData.picture,
            });
        }

        return user;
    }

    /**
     * Generate random avatar color
     */
    private static generateRandomColor(): string {
        const colors = [
            '#3B82F6', // Blue
            '#10B981', // Green
            '#F59E0B', // Orange
            '#EF4444', // Red
            '#8B5CF6', // Purple
            '#EC4899', // Pink
            '#14B8A6', // Teal
            '#F97316', // Orange-red
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}

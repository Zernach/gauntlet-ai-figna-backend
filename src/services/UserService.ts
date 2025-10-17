import { getDatabaseClient } from '../config/database';
import { User } from '../types';
import { CanvasService } from './CanvasService';

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
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            // Create new user
            let username = supabaseData.email.split('@')[0];
            const avatarColor = this.generateRandomColor();

            // Try to create user, handle username conflicts
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
                try {
                    user = await this.create({
                        id: supabaseData.uid,
                        username: attempts === 0 ? username : `${username}_${attempts}`,
                        email: supabaseData.email,
                        displayName: supabaseData.name || username,
                        avatarColor,
                        avatarUrl: supabaseData.picture,
                    });
                    break; // Success, exit loop
                } catch (error: any) {
                    // Check if it's a unique constraint violation on username
                    if (error.code === '23505' && error.message?.includes('username')) {
                        attempts++;
                        if (attempts >= maxAttempts) {
                            // Fallback to using part of the UID as suffix
                            username = `${username}_${supabaseData.uid.substring(0, 8)}`;
                            user = await this.create({
                                id: supabaseData.uid,
                                username,
                                email: supabaseData.email,
                                displayName: supabaseData.name || username,
                                avatarColor,
                                avatarUrl: supabaseData.picture,
                            });
                            break;
                        }
                    } else {
                        // Some other error, re-throw
                        throw error;
                    }
                }
            }

            // Create default canvas for new user
            if (user) {
                try {
                    await CanvasService.create(user.id, {
                        name: 'My First Canvas',
                        description: 'Welcome to Figna! Start creating here.',
                        backgroundColor: '#1a1a1a',
                        isPublic: false,
                    });
                } catch (canvasError: any) {
                    // Don't throw - user creation succeeded, canvas creation is a nice-to-have
                }
            }
        }

        return user!;
    }

    private static generateRandomColor(): string {
        const NEON_COLORS = [
            '#24ccff', '#fbff00', '#ff69b4', '#00ffff',
            '#ff00ff', '#ff0080', '#80ff00', '#ff8000',
            '#0080ff', '#ff0040', '#00ff80', '#8000ff'
        ];
        return NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
    }
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

let supabase: SupabaseClient | null = null;

export function initializeSupabase(): SupabaseClient {
    if (supabase) {
        console.log('⚠️ Supabase already initialized');
        return supabase;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    }

    try {
        // Initialize Supabase client with service role key (bypasses RLS)
        supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        return supabase;
    } catch (error: any) {
        console.error('❌ Supabase initialization failed:', error.message);
        throw error;
    }
}

/**
 * Get Supabase client instance
 */
export function getSupabase(): SupabaseClient {
    if (!supabase) {
        throw new Error('Supabase not initialized. Call initializeSupabase() first.');
    }
    return supabase;
}

/**
 * Verify Supabase JWT token
 */
export async function verifySupabaseToken(token: string): Promise<{
    userId: string;
    email?: string;
    [key: string]: any;
}> {
    try {
        const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

        if (!supabaseJwtSecret) {
            throw new Error('SUPABASE_JWT_SECRET not configured');
        }

        // Verify JWT token
        const decoded = jwt.verify(token, supabaseJwtSecret) as any;

        if (!decoded.sub) {
            throw new Error('Invalid token: missing subject');
        }

        return {
            userId: decoded.sub,
            email: decoded.email,
            role: decoded.role,
            ...decoded,
        };
    } catch (error: any) {
        console.error('Token verification failed:', error.message);
        throw new Error('Invalid or expired token');
    }
}

/**
 * Get user from Supabase by ID
 */
export async function getSupabaseUser(userId: string) {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.admin.getUserById(userId);

        if (error) {
            throw error;
        }

        return data.user;
    } catch (error: any) {
        console.error('Get user failed:', error.message);
        throw new Error('User not found');
    }
}

/**
 * Get database connection from Supabase
 * This returns the underlying PostgreSQL connection
 */
export function getDatabaseClient() {
    return getSupabase();
}

export default { initializeSupabase, getSupabase, verifySupabaseToken, getSupabaseUser };


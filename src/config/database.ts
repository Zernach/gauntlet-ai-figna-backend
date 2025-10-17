import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client for database operations
 */
export function initializeDatabaseClient(): SupabaseClient {
    if (supabaseClient) {
        return supabaseClient;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase configuration in environment variables');
    }

    supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    return supabaseClient;
}

/**
 * Get Supabase client instance
 */
export function getDatabaseClient(): SupabaseClient {
    if (!supabaseClient) {
        return initializeDatabaseClient();
    }
    return supabaseClient;
}

/**
 * Test database connection
 */
export async function testDatabaseConnection(): Promise<boolean> {
    try {
        const client = getDatabaseClient();

        // Test connection by querying a simple table
        const { data, error } = await client
            .from('users')
            .select('count')
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned (which is fine)
            throw error;
        }

        return true;
    } catch (error: any) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

/**
 * Close database connection (Supabase handles this automatically)
 */
export async function closeDatabaseConnection(): Promise<void> {
    supabaseClient = null;
}

/**
 * Query helper using Supabase client
 * This provides a simple interface for SQL queries
 */
export async function query<T = any>(
    text: string,
    params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
    const start = Date.now();

    try {
        const client = getDatabaseClient();

        // Use Supabase's RPC for raw SQL queries
        const { data, error } = await client.rpc('exec_sql', {
            query_text: text,
            query_params: params || [],
        });

        if (error) {
            throw error;
        }

        const duration = Date.now() - start;

        if (process.env.LOG_LEVEL === 'debug') {
            console.log('Executed query', { text, duration, rows: data?.length || 0 });
        }

        return {
            rows: (data || []) as T[],
            rowCount: data?.length || 0,
        };
    } catch (error: any) {
        // If RPC function doesn't exist, provide a helpful error message
        if (error.code === '42883') {
            console.error('⚠️ Note: For raw SQL queries, you need to create the exec_sql function in Supabase.');
            console.error('   Alternatively, use Supabase client methods directly.');
        }

        console.error('Database query error:', {
            error: error.message,
            query: text,
            params,
        });
        throw error;
    }
}

/**
 * Transaction helper
 * Note: Supabase transactions are handled differently than raw pg
 */
export async function transaction<T>(
    callback: (client: SupabaseClient) => Promise<T>
): Promise<T> {
    const client = getDatabaseClient();

    try {
        // Supabase doesn't expose traditional transaction control
        // Instead, use the callback with the client
        const result = await callback(client);
        return result;
    } catch (error) {
        throw error;
    }
}

export default getDatabaseClient;

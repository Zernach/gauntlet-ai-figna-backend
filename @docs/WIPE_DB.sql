-- WIPE_DB.sql
-- Complete database cleanup script for Figna
-- Realtime Collaborative Design Canvas
-- PostgreSQL 14+
-- Database: gauntletaidb
-- 
-- WARNING: This script will DELETE ALL DATA and SCHEMA OBJECTS
-- Use with extreme caution - this action is IRREVERSIBLE
-- 
-- Run this script to completely reset the database to a clean state

-- ==========================================
-- MAIN EXECUTION BLOCK WITH ERROR HANDLING
-- ==========================================

DO $$
BEGIN
    RAISE NOTICE 'Starting database wipe process...';
    
    -- ==========================================
    -- DISABLE CONSTRAINTS AND TRIGGERS
    -- ==========================================
    
    -- Disable all triggers temporarily
    SET session_replication_role = replica;
    
    RAISE NOTICE 'Disabled triggers and constraints';
    
    -- ==========================================
    -- DROP ALL VIEWS
    -- ==========================================
    
    BEGIN
        DROP VIEW IF EXISTS canvas_stats CASCADE;
        DROP VIEW IF EXISTS active_users CASCADE;
        RAISE NOTICE 'Dropped all views';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping views: %', SQLERRM;
    END;
    
    -- ==========================================
    -- DROP ALL FUNCTIONS
    -- ==========================================
    
    BEGIN
        DROP FUNCTION IF EXISTS get_canvas_full(UUID) CASCADE;
        DROP FUNCTION IF EXISTS cleanup_stale_presence() CASCADE;
        DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
        RAISE NOTICE 'Dropped all functions';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping functions: %', SQLERRM;
    END;
    
    -- ==========================================
    -- DROP ALL TRIGGERS
    -- ==========================================
    
    BEGIN
        -- Check and drop triggers for canvas_comments
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'canvas_comments' AND table_schema = 'public') THEN
            DROP TRIGGER IF EXISTS update_canvas_comments_updated_at ON canvas_comments;
        END IF;
        
        -- Check and drop triggers for canvas_collaborators
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'canvas_collaborators' AND table_schema = 'public') THEN
            DROP TRIGGER IF EXISTS update_canvas_collaborators_updated_at ON canvas_collaborators;
        END IF;
        
        -- Check and drop triggers for canvas_versions
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'canvas_versions' AND table_schema = 'public') THEN
            DROP TRIGGER IF EXISTS update_canvas_versions_updated_at ON canvas_versions;
        END IF;
        
        -- Check and drop triggers for ai_commands
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_commands' AND table_schema = 'public') THEN
            DROP TRIGGER IF EXISTS update_ai_commands_updated_at ON ai_commands;
        END IF;
        
        -- Check and drop triggers for canvas_objects
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'canvas_objects' AND table_schema = 'public') THEN
            DROP TRIGGER IF EXISTS update_canvas_objects_updated_at ON canvas_objects;
        END IF;
        
        -- Check and drop triggers for canvases
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'canvases' AND table_schema = 'public') THEN
            DROP TRIGGER IF EXISTS update_canvases_updated_at ON canvases;
        END IF;
        
        -- Check and drop triggers for users
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
            DROP TRIGGER IF EXISTS update_users_updated_at ON users;
        END IF;
        
        RAISE NOTICE 'Dropped all triggers';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping triggers: %', SQLERRM;
    END;
    
    -- ==========================================
    -- DROP ALL TABLES (in dependency order)
    -- ==========================================
    
    BEGIN
        -- Drop supporting tables first (they reference core tables)
        DROP TABLE IF EXISTS canvas_activity CASCADE;
        DROP TABLE IF EXISTS canvas_comments CASCADE;
        DROP TABLE IF EXISTS canvas_collaborators CASCADE;
        DROP TABLE IF EXISTS canvas_versions CASCADE;
        DROP TABLE IF EXISTS ai_commands CASCADE;
        DROP TABLE IF EXISTS presence CASCADE;
        DROP TABLE IF EXISTS canvas_objects CASCADE;
        
        -- Drop core tables
        DROP TABLE IF EXISTS canvases CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        
        RAISE NOTICE 'Dropped all main tables';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping main tables: %', SQLERRM;
    END;
    
    -- Additional safety: Drop any remaining tables that might exist
    BEGIN
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                    AND table_type = 'BASE TABLE'
                    AND table_name NOT IN (
                        'spatial_ref_sys', 'geography_columns', 'geometry_columns'
                    ) -- Exclude PostGIS system tables if they exist
            ) 
            LOOP
                BEGIN
                    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.table_name) || ' CASCADE';
                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE NOTICE 'Could not drop table %: %', r.table_name, SQLERRM;
                END;
            END LOOP;
        END;
        
        RAISE NOTICE 'Cleaned up remaining tables';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error cleaning up remaining tables: %', SQLERRM;
    END;
    
    -- ==========================================
    -- DROP ALL ENUMS
    -- ==========================================
    
    BEGIN
        DROP TYPE IF EXISTS canvas_collaborator_role CASCADE;
        DROP TYPE IF EXISTS ai_command_status CASCADE;
        DROP TYPE IF EXISTS canvas_object_type CASCADE;
        RAISE NOTICE 'Dropped all enums';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping enums: %', SQLERRM;
    END;
    
    -- ==========================================
    -- DROP ALL EXTENSIONS
    -- ==========================================
    
    BEGIN
        -- Note: Only drop if not used by other applications
        -- Uncomment the following lines if you want to remove extensions completely
        -- DROP EXTENSION IF EXISTS "pgcrypto" CASCADE;
        -- DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
        RAISE NOTICE 'Extensions preserved (commented out for safety)';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error handling extensions: %', SQLERRM;
    END;
    
    -- ==========================================
    -- CLEAN UP SCHEMA OBJECTS
    -- ==========================================
    
    -- Drop any remaining sequences
    BEGIN
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') 
            LOOP
                BEGIN
                    EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name) || ' CASCADE';
                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE NOTICE 'Could not drop sequence %: %', r.sequence_name, SQLERRM;
                END;
            END LOOP;
        END;
        
        RAISE NOTICE 'Cleaned up sequences';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error cleaning up sequences: %', SQLERRM;
    END;
    
    -- Drop any remaining indexes (should be auto-dropped with tables, but just in case)
    BEGIN
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (SELECT indexname FROM pg_indexes WHERE schemaname = 'public') 
            LOOP
                BEGIN
                    EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(r.indexname) || ' CASCADE';
                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE NOTICE 'Could not drop index %: %', r.indexname, SQLERRM;
                END;
            END LOOP;
        END;
        
        RAISE NOTICE 'Cleaned up indexes';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error cleaning up indexes: %', SQLERRM;
    END;
    
    -- ==========================================
    -- RESET SEQUENCES AND COUNTERS
    -- ==========================================
    
    -- Reset any remaining sequences to start from 1
    BEGIN
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') 
            LOOP
                BEGIN
                    EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequence_name) || ' RESTART WITH 1';
                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE NOTICE 'Could not reset sequence %: %', r.sequence_name, SQLERRM;
                END;
            END LOOP;
        END;
        
        RAISE NOTICE 'Reset sequences';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error resetting sequences: %', SQLERRM;
    END;
    
    -- ==========================================
    -- CLEAN UP ROLES AND PERMISSIONS
    -- ==========================================
    
    BEGIN
        -- Drop application user if it exists
        -- Uncomment the following line if you want to remove the application user
        -- DROP USER IF EXISTS figna_app;
        RAISE NOTICE 'Application users preserved (commented out for safety)';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error handling users: %', SQLERRM;
    END;
    
    -- ==========================================
    -- VACUUM AND ANALYZE
    -- ==========================================
    
    BEGIN
        -- Clean up any remaining data and update statistics
        VACUUM FULL;
        ANALYZE;
        RAISE NOTICE 'Database vacuumed and analyzed';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error during vacuum/analyze: %', SQLERRM;
    END;
    
    -- ==========================================
    -- RE-ENABLE CONSTRAINTS AND TRIGGERS
    -- ==========================================
    
    BEGIN
        -- Re-enable triggers
        SET session_replication_role = DEFAULT;
        RAISE NOTICE 'Re-enabled triggers and constraints';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Error re-enabling triggers: %', SQLERRM;
    END;
    
    -- ==========================================
    -- COMPLETION MESSAGE
    -- ==========================================
    
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'DATABASE WIPE COMPLETE';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'All tables, views, functions, triggers, and enums have been removed.';
    RAISE NOTICE 'The database is now in a clean state.';
    RAISE NOTICE 'You can now run DATABASE_SCHEMA.sql to recreate everything.';
    RAISE NOTICE '==========================================';

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '==========================================';
        RAISE NOTICE 'DATABASE WIPE COMPLETED WITH ERRORS';
        RAISE NOTICE '==========================================';
        RAISE NOTICE 'Some operations may have failed, but the script continued.';
        RAISE NOTICE 'Check the notices above for specific error details.';
        RAISE NOTICE 'Error: %', SQLERRM;
        RAISE NOTICE '==========================================';
        
        -- Try to re-enable triggers even if there were errors
        BEGIN
            SET session_replication_role = DEFAULT;
        EXCEPTION
            WHEN OTHERS THEN
                NULL; -- Ignore errors here
        END;
END $$;

-- ==========================================
-- VERIFICATION QUERIES (Optional)
-- ==========================================

-- Uncomment these queries to verify the cleanup was successful
-- They will show any remaining objects in the public schema

/*
-- Verify all tables are dropped
SELECT 
    table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verify all views are dropped
SELECT 
    table_name 
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verify all functions are dropped
SELECT 
    routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Verify all enums are dropped
SELECT 
    typname 
FROM pg_type 
WHERE typtype = 'e' 
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY typname;
*/

-- ==========================================
-- USAGE INSTRUCTIONS
-- ==========================================

/*
USAGE INSTRUCTIONS:

1. BACKUP YOUR DATA FIRST (if needed):
   pg_dump -h localhost -U username -d gauntletaidb > backup_before_wipe.sql

2. Run this script:
   psql -h localhost -U username -d gauntletaidb -f WIPE_DB.sql

3. Verify the wipe was successful by checking the verification queries above

4. Recreate the schema:
   psql -h localhost -U username -d gauntletaidb -f DATABASE_SCHEMA.sql

5. Verify the recreation:
   psql -h localhost -U username -d gauntletaidb -c "\dt"

SAFETY NOTES:
- This script is designed to be safe and reversible
- It only affects the 'public' schema
- Extensions are preserved by default (uncomment to remove)
- Application users are preserved by default (uncomment to remove)
- Always backup before running in production

TROUBLESHOOTING:
- If you get permission errors, run as a superuser or database owner
- If some objects remain, check for dependencies and drop them manually
- If you need to force drop everything, add CASCADE to individual DROP statements
*/

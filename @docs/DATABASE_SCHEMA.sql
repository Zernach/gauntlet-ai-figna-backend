-- Figna Database Schema
-- Realtime Collaborative Design Canvas
-- PostgreSQL 14+
-- Database: gauntletaidb

-- ==========================================
-- EXTENSIONS
-- ==========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- ENUMS
-- ==========================================

CREATE TYPE canvas_object_type AS ENUM (
    'rectangle',
    'circle',
    'text',
    'line',
    'polygon',
    'image'
);

CREATE TYPE ai_command_status AS ENUM (
    'pending',
    'executing',
    'completed',
    'failed',
    'cancelled'
);

CREATE TYPE canvas_collaborator_role AS ENUM (
    'owner',
    'editor',
    'viewer'
);

-- ==========================================
-- CORE TABLES
-- ==========================================

-- Users Table (Canvas Users)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    avatar_color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    avatar_url TEXT,
    is_online BOOLEAN DEFAULT FALSE,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_username ON users(username) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_is_online ON users(is_online) WHERE is_deleted = FALSE;

-- Canvases Table
CREATE TABLE canvases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    is_template BOOLEAN DEFAULT FALSE,
    thumbnail_url TEXT,
    viewport_x FLOAT DEFAULT 0,
    viewport_y FLOAT DEFAULT 0,
    viewport_zoom FLOAT DEFAULT 1.0,
    background_color VARCHAR(7) DEFAULT '#1C1C1C',
    grid_enabled BOOLEAN DEFAULT FALSE,
    grid_size INTEGER DEFAULT 20,
    snap_to_grid BOOLEAN DEFAULT FALSE,
    width INTEGER,
    height INTEGER,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for canvases
CREATE INDEX idx_canvases_owner_id ON canvases(owner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_canvases_updated_at ON canvases(updated_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_canvases_is_public ON canvases(is_public) WHERE is_deleted = FALSE;
CREATE INDEX idx_canvases_owner_updated ON canvases(owner_id, updated_at DESC) WHERE is_deleted = FALSE;

-- Canvas Objects Table
CREATE TABLE canvas_objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    type canvas_object_type NOT NULL,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    width FLOAT,
    height FLOAT,
    radius FLOAT,
    rotation FLOAT DEFAULT 0,
    color VARCHAR(9) NOT NULL,
    stroke_color VARCHAR(9),
    stroke_width INTEGER DEFAULT 0,
    opacity FLOAT DEFAULT 1.0,
    shadow_color VARCHAR(9),
    shadow_strength INTEGER DEFAULT 0,
    text_content TEXT,
    font_size INTEGER,
    font_family VARCHAR(100) DEFAULT 'Inter',
    font_weight VARCHAR(20) DEFAULT 'normal',
    text_align VARCHAR(20) DEFAULT 'left',
    z_index INTEGER NOT NULL,
    locked_at TIMESTAMP,
    locked_by UUID REFERENCES users(id),
    is_visible BOOLEAN DEFAULT TRUE,
    group_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID NOT NULL REFERENCES users(id),
    last_modified_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for canvas_objects
CREATE INDEX idx_canvas_objects_canvas_id ON canvas_objects(canvas_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_canvas_objects_z_index ON canvas_objects(canvas_id, z_index) WHERE is_deleted = FALSE;
CREATE INDEX idx_canvas_objects_created_by ON canvas_objects(created_by);
CREATE INDEX idx_canvas_objects_group_id ON canvas_objects(group_id) WHERE group_id IS NOT NULL AND is_deleted = FALSE;
CREATE INDEX idx_canvas_objects_locked_at ON canvas_objects(locked_at) WHERE locked_at IS NOT NULL AND is_deleted = FALSE;

-- Note: Shapes are automatically unlocked after 10 seconds of inactivity
-- The locked_at timestamp is used to track when a shape was last locked
-- If (NOW() - locked_at) > 10 seconds, the shape is considered unlocked

-- Presence Table (Ephemeral - TTL 30s)
CREATE TABLE presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    cursor_x FLOAT NOT NULL,
    cursor_y FLOAT NOT NULL,
    viewport_x FLOAT,
    viewport_y FLOAT,
    viewport_zoom FLOAT,
    selected_object_ids JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    color VARCHAR(7),
    connection_id VARCHAR(100),
    last_heartbeat TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, canvas_id)
);

-- Indexes for presence
CREATE INDEX idx_presence_canvas_id ON presence(canvas_id);
CREATE INDEX idx_presence_user_canvas ON presence(user_id, canvas_id);
CREATE INDEX idx_presence_heartbeat ON presence(last_heartbeat);

-- AI Commands Table
CREATE TABLE ai_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    command_text TEXT NOT NULL,
    parsed_intent TEXT,
    status ai_command_status NOT NULL DEFAULT 'pending',
    result_object_ids JSONB DEFAULT '[]'::jsonb,
    operations_executed JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    execution_time_ms INTEGER,
    tokens_used INTEGER,
    model VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for ai_commands
CREATE INDEX idx_ai_commands_canvas_id ON ai_commands(canvas_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_ai_commands_user_id ON ai_commands(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_ai_commands_created_at ON ai_commands(created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_ai_commands_status ON ai_commands(status) WHERE is_deleted = FALSE;

-- ==========================================
-- SUPPORTING TABLES
-- ==========================================

-- Canvas Versions Table
CREATE TABLE canvas_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot_data JSONB NOT NULL,
    object_count INTEGER,
    change_description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    is_auto_save BOOLEAN DEFAULT TRUE,
    is_named_version BOOLEAN DEFAULT FALSE,
    version_name VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,
    UNIQUE(canvas_id, version_number)
);

-- Indexes for canvas_versions
CREATE INDEX idx_canvas_versions_canvas_id ON canvas_versions(canvas_id, created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_canvas_versions_version ON canvas_versions(canvas_id, version_number) WHERE is_deleted = FALSE;

-- Canvas Collaborators Table
CREATE TABLE canvas_collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role canvas_collaborator_role NOT NULL DEFAULT 'viewer',
    invited_by UUID REFERENCES users(id),
    can_edit BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    can_share BOOLEAN DEFAULT FALSE,
    can_export BOOLEAN DEFAULT FALSE,
    invited_at TIMESTAMP,
    accepted_at TIMESTAMP,
    last_accessed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,
    UNIQUE(canvas_id, user_id)
);

-- Indexes for canvas_collaborators
CREATE INDEX idx_canvas_collaborators_canvas ON canvas_collaborators(canvas_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_canvas_collaborators_user ON canvas_collaborators(user_id) WHERE is_deleted = FALSE;

-- Canvas Comments Table
CREATE TABLE canvas_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_id UUID REFERENCES canvas_objects(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    x FLOAT,
    y FLOAT,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP,
    parent_comment_id UUID REFERENCES canvas_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for canvas_comments
CREATE INDEX idx_canvas_comments_canvas ON canvas_comments(canvas_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_canvas_comments_object ON canvas_comments(object_id) WHERE object_id IS NOT NULL AND is_deleted = FALSE;
CREATE INDEX idx_canvas_comments_user ON canvas_comments(user_id) WHERE is_deleted = FALSE;

-- Canvas Activity Table
CREATE TABLE canvas_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    object_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for canvas_activity
CREATE INDEX idx_canvas_activity_canvas ON canvas_activity(canvas_id, created_at DESC);
CREATE INDEX idx_canvas_activity_user ON canvas_activity(user_id, created_at DESC);
CREATE INDEX idx_canvas_activity_type ON canvas_activity(activity_type);

-- ==========================================
-- TRIGGERS
-- ==========================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_canvases_updated_at BEFORE UPDATE ON canvases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_canvas_objects_updated_at BEFORE UPDATE ON canvas_objects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_commands_updated_at BEFORE UPDATE ON ai_commands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_canvas_versions_updated_at BEFORE UPDATE ON canvas_versions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_canvas_collaborators_updated_at BEFORE UPDATE ON canvas_collaborators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_canvas_comments_updated_at BEFORE UPDATE ON canvas_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- FUNCTIONS
-- ==========================================

-- Clean up stale presence records (TTL 30s)
CREATE OR REPLACE FUNCTION cleanup_stale_presence()
RETURNS void AS $$
BEGIN
    DELETE FROM presence
    WHERE last_heartbeat < NOW() - INTERVAL '30 seconds';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-presence', '*/1 * * * *', 'SELECT cleanup_stale_presence()');

-- Get canvas with all related data
CREATE OR REPLACE FUNCTION get_canvas_full(canvas_uuid UUID)
RETURNS TABLE (
    canvas_data JSONB,
    objects_data JSONB,
    collaborators_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        to_jsonb(c.*) as canvas_data,
        COALESCE(
            (SELECT jsonb_agg(to_jsonb(co.*))
             FROM canvas_objects co
             WHERE co.canvas_id = c.id AND co.is_deleted = FALSE),
            '[]'::jsonb
        ) as objects_data,
        COALESCE(
            (SELECT jsonb_agg(to_jsonb(cc.*))
             FROM canvas_collaborators cc
             WHERE cc.canvas_id = c.id AND cc.is_deleted = FALSE),
            '[]'::jsonb
        ) as collaborators_data
    FROM canvases c
    WHERE c.id = canvas_uuid AND c.is_deleted = FALSE;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- VIEWS
-- ==========================================

-- Active users view
CREATE VIEW active_users AS
SELECT DISTINCT
    u.id,
    u.username,
    u.display_name,
    u.avatar_color,
    u.is_online,
    p.canvas_id
FROM users u
JOIN presence p ON u.id = p.user_id
WHERE p.last_heartbeat > NOW() - INTERVAL '30 seconds';

-- Canvas stats view
CREATE VIEW canvas_stats AS
SELECT
    c.id as canvas_id,
    c.name,
    c.owner_id,
    COUNT(DISTINCT co.id) as object_count,
    COUNT(DISTINCT cc.user_id) as collaborator_count,
    COUNT(DISTINCT p.user_id) as active_user_count,
    MAX(c.updated_at) as last_updated
FROM canvases c
LEFT JOIN canvas_objects co ON c.id = co.canvas_id AND co.is_deleted = FALSE
LEFT JOIN canvas_collaborators cc ON c.id = cc.canvas_id AND cc.is_deleted = FALSE
LEFT JOIN presence p ON c.id = p.canvas_id AND p.last_heartbeat > NOW() - INTERVAL '30 seconds'
WHERE c.is_deleted = FALSE
GROUP BY c.id, c.name, c.owner_id;

-- ==========================================
-- SEED DATA (Optional)
-- ==========================================

-- Insert demo user
INSERT INTO users (id, username, email, display_name, avatar_color)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'demo_user',
    'demo@figna.com',
    'Demo User',
    '#3B82F6'
) ON CONFLICT (email) DO NOTHING;

-- Insert demo canvas
INSERT INTO canvases (id, owner_id, name, description, is_public)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Demo Canvas',
    'A sample canvas for testing',
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- PERMISSIONS (Run as superuser)
-- ==========================================

-- Create application user
-- CREATE USER figna_app WITH PASSWORD 'your_secure_password';

-- Grant permissions
-- GRANT CONNECT ON DATABASE gauntletaidb TO figna_app;
-- GRANT USAGE ON SCHEMA public TO figna_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO figna_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO figna_app;

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON TABLE users IS 'User accounts for canvas collaboration';
COMMENT ON TABLE canvases IS 'Canvas metadata and settings';
COMMENT ON TABLE canvas_objects IS 'Individual shapes and elements on canvas';
COMMENT ON TABLE presence IS 'Real-time user presence tracking (ephemeral)';
COMMENT ON TABLE ai_commands IS 'AI command history and execution results';
COMMENT ON TABLE canvas_versions IS 'Canvas snapshots for history/recovery';
COMMENT ON TABLE canvas_collaborators IS 'Canvas sharing and permissions';
COMMENT ON TABLE canvas_comments IS 'Comments on canvas areas or objects';
COMMENT ON TABLE canvas_activity IS 'Audit trail for canvas activities';

-- ==========================================
-- PERFORMANCE NOTES
-- ==========================================

/*
1. Regular VACUUM and ANALYZE:
   - Run weekly: VACUUM ANALYZE;
   - Monitor table bloat

2. Index maintenance:
   - Rebuild indexes monthly: REINDEX TABLE table_name;

3. Presence cleanup:
   - Run cleanup_stale_presence() every minute
   - Consider using pg_cron for automation

4. Partitioning (for large scale):
   - Consider partitioning canvas_activity by date
   - Partition ai_commands by month for archival

5. Connection pooling:
   - Use PgBouncer for connection management
   - Recommended pool size: 20-50 connections
*/

# Environment Variables Template - Supabase Edition

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# CORS Configuration (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006,http://localhost:19000

# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_JWT_SECRET=your-jwt-secret-here

# WebSocket Configuration
WS_PORT=3002
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_PAYLOAD=10485760

# Session Configuration
SESSION_SECRET=your-super-secret-session-key-change-this-in-production

# Logging
LOG_LEVEL=info

# Performance
MAX_OBJECTS_PER_CANVAS=1000
PRESENCE_TTL_SECONDS=30

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Setup Instructions

1. Copy this content to `.env` file
2. Replace all placeholder values with your actual Supabase configuration
3. Never commit the `.env` file to version control

## Getting Supabase Credentials

### Step 1: Create a Supabase Project
1. Go to [Supabase](https://supabase.com/)
2. Sign in or create an account
3. Click "New Project"
4. Fill in project details and wait for setup to complete

### Step 2: Get Your Credentials

#### From Supabase Dashboard:
1. Go to **Project Settings** (gear icon in sidebar)
2. Navigate to **API** section

You'll find:
- **Project URL** → Use for `SUPABASE_URL`
- **anon/public key** → Use for `SUPABASE_ANON_KEY`
- **service_role key** → Use for `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret!)
- **JWT Secret** → Use for `SUPABASE_JWT_SECRET`

### Step 3: Set Up Database Schema

1. In Supabase Dashboard, go to **SQL Editor**
2. Copy the contents of `../gauntlet-ai-frontend/@docs/DATABASE_SCHEMA.sql`
3. Paste and execute in SQL Editor
4. Verify tables were created in **Table Editor**

### Step 4: Enable Row Level Security (Optional)

If you want to use Supabase's Row Level Security:
1. Go to **Authentication** → **Policies**
2. Enable RLS on tables that need protection
3. Create policies for each table

**Note:** The backend uses the service role key which bypasses RLS by default.

## Security Notes

⚠️ **IMPORTANT:**
- Never commit `.env` to version control
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code
- Use `SUPABASE_ANON_KEY` in frontend, `SERVICE_ROLE_KEY` in backend
- The JWT Secret is used to verify tokens server-side
- Keep all credentials secure and rotate them regularly

## Supabase vs Firebase

**Advantages of Supabase:**
- ✅ PostgreSQL database included
- ✅ Authentication + Database in one service
- ✅ Real-time subscriptions built-in
- ✅ Open source and self-hostable
- ✅ SQL-based (more powerful queries)
- ✅ Row Level Security for fine-grained permissions

## Example .env (Development)

```env
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006

SUPABASE_URL=https://abc123.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...very-long-key
SUPABASE_ANON_KEY=eyJhbGc...another-long-key
SUPABASE_JWT_SECRET=your-jwt-secret-from-dashboard

WS_PORT=3002
WS_HEARTBEAT_INTERVAL=30000

PRESENCE_TTL_SECONDS=30
MAX_OBJECTS_PER_CANVAS=1000

RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=debug
```

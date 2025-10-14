# Supabase Setup Guide for CollabCanvas

Complete guide to setting up Supabase for authentication and PostgreSQL database.

## Why Supabase?

Supabase provides both **authentication** and **PostgreSQL database** in one service, making it perfect for this project:

- ✅ No need for separate Firebase and PostgreSQL setup
- ✅ Built-in authentication with JWTs
- ✅ PostgreSQL database with real-time capabilities
- ✅ Easy to use dashboard
- ✅ Great free tier for development
- ✅ Open source and self-hostable

## Step 1: Create Supabase Project

### 1.1 Sign Up
1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign in with GitHub, GitLab, or email

### 1.2 Create New Project
1. Click "New Project"
2. Choose your organization (or create one)
3. Fill in project details:
   - **Name:** `collabcanvas` (or your preferred name)
   - **Database Password:** Generate a strong password (save it!)
   - **Region:** Choose closest to your users
4. Click "Create new project"
5. Wait 2-3 minutes for setup to complete

## Step 2: Get Your Credentials

### 2.1 Navigate to Project Settings
1. In your project dashboard, click the **⚙️ Settings** icon (bottom left)
2. Go to **API** section

### 2.2 Copy Your Credentials
You'll see several keys:

```
Project URL: https://xxxxx.supabase.co
anon/public: eyJhbGc...
service_role: eyJhbGc... (⚠️ secret!)
JWT Secret: your-secret-here
```

### 2.3 Add to .env File
Create `/Users/zernach/code/gauntlet/gauntlet-ai-backend/.env`:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

## Step 3: Set Up Database Schema

### 3.1 Open SQL Editor
1. In Supabase Dashboard, click **🗄️ SQL Editor** (left sidebar)
2. Click **+ New query**

### 3.2 Copy Schema
Copy the contents of:
```
/Users/zernach/code/gauntlet/gauntlet-ai-frontend/@docs/DATABASE_SCHEMA.sql
```

### 3.3 Execute Schema
1. Paste the SQL into the editor
2. Click **Run** (or press Cmd/Ctrl + Enter)
3. Verify no errors appear

### 3.4 Verify Tables Created
1. Click **🗂️ Table Editor** (left sidebar)
2. You should see these tables:
   - users
   - canvases
   - canvas_objects
   - presence
   - ai_commands
   - canvas_collaborators
   - canvas_comments
   - canvas_activity
   - canvas_versions

## Step 4: Configure Authentication

### 4.1 Enable Email Auth
1. Go to **🔐 Authentication** → **Providers**
2. Enable **Email** provider (should be on by default)

### 4.2 Configure Additional Providers (Optional)
Enable any OAuth providers you want:
- Google
- GitHub
- Discord
- etc.

### 4.3 Update Site URL (Important!)
1. Go to **Authentication** → **URL Configuration**
2. Add your frontend URLs:
   ```
   Site URL: http://localhost:19006
   Redirect URLs:
   - http://localhost:19006
   - http://localhost:8081
   - http://localhost:19000
   ```

## Step 5: Create Admin User (Optional)

### 5.1 Via Dashboard
1. Go to **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter email and password
4. Click **Create user**

### 5.2 Via SQL
```sql
-- Insert a test user directly
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'test@example.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW()
);
```

## Step 6: Test Connection

### 6.1 From Backend
```bash
cd /Users/zernach/code/gauntlet/gauntlet-ai-backend
npm run dev
```

You should see:
```
✅ Supabase initialized successfully
✅ Database connected successfully
```

### 6.2 Test API
```bash
curl http://localhost:3001/api/health
```

## Step 7: Frontend Configuration

### 7.1 Install Supabase Client
```bash
cd /Users/zernach/code/gauntlet/gauntlet-ai-frontend
npm install @supabase/supabase-js
```

### 7.2 Create Supabase Config
Create `lib/supabase/config.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xxxxx.supabase.co';
const supabaseAnonKey = 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 7.3 Use in Authentication
```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123',
});

// Get session token for backend
const session = await supabase.auth.getSession();
const token = session.data.session?.access_token;

// Use token with backend
fetch('http://localhost:3001/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

## Security Best Practices

### ✅ Do's
- ✅ Use `SUPABASE_ANON_KEY` in frontend
- ✅ Use `SUPABASE_SERVICE_ROLE_KEY` in backend only
- ✅ Enable Row Level Security (RLS) on sensitive tables
- ✅ Keep JWT secret secure
- ✅ Use HTTPS in production
- ✅ Validate tokens server-side

### ❌ Don'ts
- ❌ Never expose service role key in frontend
- ❌ Never commit `.env` to git
- ❌ Don't use anon key for admin operations
- ❌ Don't skip token verification

## Row Level Security (Optional)

If you want to use Supabase's built-in RLS:

### Enable RLS on Tables
```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_objects ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own data"
ON users FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
ON users FOR UPDATE
USING (auth.uid() = id);

-- Canvas policies
CREATE POLICY "Users can view accessible canvases"
ON canvases FOR SELECT
USING (
  owner_id = auth.uid() OR
  is_public = true OR
  EXISTS (
    SELECT 1 FROM canvas_collaborators
    WHERE canvas_id = canvases.id
    AND user_id = auth.uid()
  )
);
```

**Note:** The backend uses service role key which bypasses RLS.

## Monitoring & Debugging

### View Logs
1. Go to **🔍 Logs** in Supabase Dashboard
2. See API requests, errors, and database queries

### Check Database
1. Go to **🗂️ Table Editor** to browse data
2. Go to **🗄️ SQL Editor** to run queries

### Monitor Auth
1. Go to **🔐 Authentication** → **Users** to see all users
2. Check user sessions and metadata

## Troubleshooting

### Error: "Invalid JWT"
- Check `SUPABASE_JWT_SECRET` matches dashboard
- Verify token is being sent correctly
- Check token hasn't expired

### Error: "Database connection failed"
- Verify `SUPABASE_URL` is correct
- Check `SUPABASE_SERVICE_ROLE_KEY` is set
- Ensure project is not paused (free tier)

### Error: "User not found"
- User must exist in `auth.users` AND your `users` table
- Backend creates user on first login
- Check user was synced properly

## Production Deployment

### 1. Update Environment
```env
NODE_ENV=production
SUPABASE_URL=https://your-prod-project.supabase.co
# Use production keys
```

### 2. Database Backups
1. Go to **⚙️ Settings** → **Database**
2. Enable automatic backups
3. Set up point-in-time recovery

### 3. Enable SSL
Supabase enforces SSL by default ✅

### 4. Set Up Custom Domain (Optional)
1. Go to **⚙️ Settings** → **Custom Domains**
2. Follow instructions to set up custom domain

## Next Steps

1. ✅ Supabase project created
2. ✅ Database schema loaded
3. ✅ Authentication configured
4. ✅ Backend connected
5. 🔄 Configure frontend
6. 🔄 Test authentication flow
7. 🔄 Test real-time features

---

**Need Help?**
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- Check `README.md` for API documentation


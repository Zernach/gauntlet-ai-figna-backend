# Quick Start Guide - CollabCanvas Backend with Supabase

Get the backend running in 5 minutes!

## Prerequisites Checklist
- [ ] Node.js 18+ installed (`node --version`)
- [ ] Supabase account ([sign up free](https://supabase.com))
- [ ] Git repository cloned

## 🚀 Quick Setup (5 Steps)

### Step 1: Create Supabase Project
```bash
# 1. Go to https://supabase.com/dashboard
# 2. Click "New Project"
# 3. Fill in:
#    - Name: collabcanvas
#    - Database Password: (save this!)
#    - Region: (choose closest)
# 4. Wait 2-3 minutes for setup
```

### Step 2: Get Supabase Credentials
```bash
# In Supabase Dashboard:
# 1. Click Settings (⚙️) → API
# 2. Copy these values:

Project URL: https://xxxxx.supabase.co
anon/public: eyJhbGc...
service_role: eyJhbGc... (keep secret!)
JWT Secret: your-jwt-secret
```

### Step 3: Install Dependencies
```bash
cd gauntlet-ai-backend
npm install
```

### Step 4: Configure Environment
```bash
# Create .env file
cat > .env << 'EOF'
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
WS_PORT=3002

# Replace these with your Supabase credentials
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_JWT_SECRET=your-jwt-secret

ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006
PRESENCE_TTL_SECONDS=30
LOG_LEVEL=info
EOF

# Edit with your actual credentials
nano .env
```

### Step 5: Set Up Database
```bash
# 1. In Supabase Dashboard → SQL Editor
# 2. Click "+ New query"
# 3. Copy contents of:
cat ../gauntlet-ai-frontend/@docs/DATABASE_SCHEMA.sql

# 4. Paste in SQL Editor
# 5. Click "Run" (or Cmd/Ctrl + Enter)
# 6. Verify tables created in Table Editor
```

### Step 6: Start the Server
```bash
npm run dev
```

You should see:
```
✅ Supabase initialized successfully
✅ Database connected successfully
✅ HTTP Server running on http://0.0.0.0:3001
✅ WebSocket Server running on ws://0.0.0.0:3002
```

## ✅ Verify Installation

### Test HTTP Server
```bash
curl http://localhost:3001/api/health
```

Expected:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-13T...",
  "uptime": 5.123
}
```

### Test Supabase Connection
Look for this in console:
```
✅ Supabase initialized successfully
✅ Database connected successfully
```

### Check Tables Created
```bash
# In Supabase Dashboard → Table Editor
# You should see:
- users
- canvases
- canvas_objects
- presence
- ai_commands
```

## 🎯 Common Issues

### "Missing Supabase configuration"
```bash
# Check .env file exists and has all values
cat .env | grep SUPABASE
```

### "Database connection failed"
```bash
# Verify Supabase project is active
# Go to dashboard and check it's not paused

# Check credentials are correct
# Project Settings → API
```

### "Invalid JWT Secret"
```bash
# Make sure SUPABASE_JWT_SECRET matches
# the one in Project Settings → API → JWT Secret
```

### Port Already in Use
```bash
# Kill process on port
lsof -ti:3001 | xargs kill -9

# Or change port in .env
PORT=3003
```

## 📚 Next Steps

### 1. Test with Frontend
Update frontend config:
```typescript
// In frontend: lib/supabase/config.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key' // NOT service role key!
);
```

### 2. Create Test User
```bash
# In Supabase Dashboard → Authentication → Users
# Click "Add user" → "Create new user"
# Or use frontend sign-up form
```

### 3. Test Authentication
```typescript
// Frontend sign-in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'password123',
});

// Get token
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Test with backend
fetch('http://localhost:3001/api/auth/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### 4. Test WebSocket
```javascript
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

const ws = new WebSocket(
  `ws://localhost:3002?token=${token}&canvasId=test-canvas`
);

ws.onopen = () => console.log('Connected!');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
```

## 🔥 Supabase Dashboard Features

### View Data
- **Table Editor** → Browse and edit data
- **SQL Editor** → Run custom queries
- **Database** → View schema and relationships

### Monitor
- **Logs** → See API requests and errors
- **Reports** → Database performance stats

### Authentication
- **Authentication** → Manage users
- **Policies** → Set up Row Level Security

## 💡 Development Tips

### View Logs
```bash
# Backend logs
npm run dev

# Supabase logs
# Dashboard → Logs
```

### Debug Authentication
```bash
# Check token is valid
# In Supabase Dashboard → Authentication → Users
# Find user, check "Last Sign In"
```

### Database Queries
```sql
-- In Supabase SQL Editor

-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- View users
SELECT * FROM users;

-- View canvases
SELECT * FROM canvases;
```

### Reset Database
```sql
-- In Supabase SQL Editor
-- ⚠️ This deletes all data!

DROP TABLE IF EXISTS canvas_activity CASCADE;
DROP TABLE IF EXISTS canvas_comments CASCADE;
DROP TABLE IF EXISTS canvas_collaborators CASCADE;
DROP TABLE IF EXISTS canvas_versions CASCADE;
DROP TABLE IF EXISTS ai_commands CASCADE;
DROP TABLE IF EXISTS presence CASCADE;
DROP TABLE IF EXISTS canvas_objects CASCADE;
DROP TABLE IF EXISTS canvases CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Then re-run DATABASE_SCHEMA.sql
```

## 📖 Full Documentation

- **Complete Setup:** [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- **API Reference:** [README.md](./README.md)
- **Environment Config:** [ENV_TEMPLATE.md](./ENV_TEMPLATE.md)
- **Migration Guide:** [SUPABASE_MIGRATION_COMPLETE.md](./SUPABASE_MIGRATION_COMPLETE.md)

## ✅ Success Checklist

Before moving forward:

- [ ] Supabase project created
- [ ] Credentials copied to `.env`
- [ ] Database schema executed successfully
- [ ] Dependencies installed (`npm install`)
- [ ] Server starts without errors
- [ ] Health check returns success
- [ ] Tables visible in Supabase Table Editor
- [ ] Frontend can authenticate users

---

**🎉 Backend Ready!** Your CollabCanvas backend is running with Supabase.

Time to build something awesome! 🚀

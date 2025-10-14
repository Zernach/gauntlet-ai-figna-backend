# Installation Guide - CollabCanvas Backend

Complete step-by-step installation guide for the Phase 1 MVP backend.

## Prerequisites

Before you begin, ensure you have:

- ✅ Node.js 18+ installed
- ✅ PostgreSQL 14+ installed and running
- ✅ Firebase project created with Authentication enabled
- ✅ Git installed
- ✅ Terminal/command line access

## Installation Steps

### Step 1: Navigate to Backend Directory
```bash
cd /Users/zernach/code/gauntlet/gauntlet-ai-backend
```

### Step 2: Install Dependencies
```bash
npm install
```

This will install all required packages:
- Express (HTTP server)
- ws (WebSocket server)
- pg (PostgreSQL client)
- firebase-admin (Authentication)
- TypeScript and dev tools

### Step 3: Set Up PostgreSQL Database

#### Create Database
```bash
createdb gauntletaidb
```

#### Run Database Schema
```bash
psql gauntletaidb < ../gauntlet-ai-frontend/@docs/DATABASE_SCHEMA.sql
```

#### Verify Database
```bash
psql gauntletaidb -c "\dt"
```

You should see tables like:
- users
- canvases
- canvas_objects
- presence
- ai_commands

### Step 4: Configure Environment Variables

#### Create .env file
```bash
touch .env
```

#### Add Required Configuration
Open `.env` in your editor and add:

```env
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# CORS (adjust for your frontend)
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006,http://localhost:19000

# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=gauntletaidb
DATABASE_USER=your_postgres_username
DATABASE_PASSWORD=your_postgres_password
DATABASE_SSL=false
DATABASE_MAX_CONNECTIONS=20

# Firebase Configuration (Option 1 - Recommended)
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# WebSocket Configuration
WS_PORT=3002
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_PAYLOAD=10485760

# Performance Settings
PRESENCE_TTL_SECONDS=30
MAX_OBJECTS_PER_CANVAS=1000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

**Important:** Replace `your_postgres_username` and `your_postgres_password` with your actual PostgreSQL credentials.

### Step 5: Set Up Firebase Authentication

#### Download Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon → Project Settings
4. Navigate to "Service Accounts" tab
5. Click "Generate New Private Key"
6. Download the JSON file

#### Save Service Account File
```bash
# Save the downloaded JSON file as:
mv ~/Downloads/your-project-firebase-adminsdk-*.json ./firebase-service-account.json
```

#### Verify File Exists
```bash
ls -la firebase-service-account.json
```

### Step 6: Verify Installation

Run the verification script:
```bash
node verify-setup.js
```

This will check:
- ✅ Node.js version
- ✅ Required files
- ✅ Environment configuration
- ✅ Dependencies
- ✅ Firebase credentials

### Step 7: Start the Server

#### Development Mode (with hot reload)
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

### Step 8: Verify Server is Running

You should see output like:
```
🚀 Starting CollabCanvas Backend Server...
🔥 Initializing Firebase...
✅ Firebase initialized with service account file
🗄️  Testing database connection...
✅ Database connected successfully at: 2025-10-13...

✅ HTTP Server running on http://0.0.0.0:3001
📡 API Base URL: http://0.0.0.0:3001/api
❤️  Health Check: http://0.0.0.0:3001/api/health

🔌 Starting WebSocket server...
✅ WebSocket Server running on ws://0.0.0.0:3002

============================================================
🎨 CollabCanvas Backend - Ready for Connections!
============================================================
```

### Step 9: Test the Installation

#### Test HTTP Server
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-13T...",
  "uptime": 5.123
}
```

#### Test API Info
```bash
curl http://localhost:3001/api
```

#### Test WebSocket Stats
```bash
curl http://localhost:3001/api/ws/stats
```

## Common Issues and Solutions

### Issue: Database Connection Failed

**Error:** `Database connection failed`

**Solution:**
```bash
# Check if PostgreSQL is running
pg_isready

# If not running, start it:
# macOS (Homebrew):
brew services start postgresql@14

# Linux (systemd):
sudo systemctl start postgresql

# Check database exists:
psql -l | grep gauntletaidb

# If database doesn't exist:
createdb gauntletaidb
```

### Issue: Firebase Initialization Failed

**Error:** `Firebase initialization failed`

**Solution:**
1. Verify service account file exists:
   ```bash
   ls -la firebase-service-account.json
   ```

2. Check .env configuration:
   ```bash
   cat .env | grep FIREBASE
   ```

3. Ensure file path is correct in .env:
   ```env
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   ```

### Issue: Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3001`

**Solution:**
```bash
# Find process using port 3001
lsof -ti:3001

# Kill the process
lsof -ti:3001 | xargs kill -9

# Or use a different port in .env
PORT=3003
WS_PORT=3004
```

### Issue: Permission Denied on PostgreSQL

**Error:** `FATAL: password authentication failed`

**Solution:**
```bash
# Connect to PostgreSQL and create/modify user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE USER your_username WITH PASSWORD 'your_password';
ALTER USER your_username WITH SUPERUSER;
GRANT ALL PRIVILEGES ON DATABASE gauntletaidb TO your_username;

# Exit with \q
```

### Issue: Module Not Found

**Error:** `Cannot find module 'express'`

**Solution:**
```bash
# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: TypeScript Errors

**Error:** `Cannot find name 'process'`

**Solution:**
```bash
# Install Node.js type definitions
npm install --save-dev @types/node

# Or reinstall all dependencies
npm install
```

## Post-Installation Configuration

### Configure CORS for Your Frontend

Update `.env` with your frontend URLs:
```env
ALLOWED_ORIGINS=http://localhost:8081,http://192.168.1.100:8081,https://yourapp.com
```

### Set Up Database User Permissions

For production, create a dedicated database user:
```sql
CREATE USER collabcanvas_app WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE gauntletaidb TO collabcanvas_app;
GRANT USAGE ON SCHEMA public TO collabcanvas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO collabcanvas_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO collabcanvas_app;
```

### Enable Production Logging

Update `.env`:
```env
NODE_ENV=production
LOG_LEVEL=warn
```

## Connecting Your Frontend

Update your frontend configuration to point to the backend:

```typescript
// constants/config.ts
export const API_BASE_URL = 'http://localhost:3001/api';
export const WS_URL = 'ws://localhost:3002';
```

For WebSocket connections, include the Firebase token and canvas ID:
```typescript
const ws = new WebSocket(
  `${WS_URL}?token=${firebaseIdToken}&canvasId=${canvasId}`
);
```

## Development Workflow

### Running in Development
```bash
npm run dev
```
- Auto-reloads on code changes
- Detailed logging
- Source maps enabled

### Building for Production
```bash
npm run build
```
- Compiles TypeScript to JavaScript
- Output in `dist/` directory

### Running Production Build
```bash
npm start
```
- Runs compiled JavaScript
- No hot reload
- Optimized for performance

### Code Quality
```bash
# Lint code
npm run lint

# Format code
npm run format
```

## Environment-Specific Configuration

### Development
```env
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_SSL=false
```

### Staging
```env
NODE_ENV=staging
LOG_LEVEL=info
DATABASE_SSL=true
```

### Production
```env
NODE_ENV=production
LOG_LEVEL=warn
DATABASE_SSL=true
RATE_LIMIT_MAX_REQUESTS=50
```

## Next Steps

After successful installation:

1. ✅ **Test with Frontend** - Connect your React Native app
2. ✅ **Test Collaboration** - Open multiple browser tabs
3. ✅ **Monitor Performance** - Check WebSocket stats
4. ✅ **Test Shape Operations** - Create, update, delete shapes
5. ✅ **Test Real-time Features** - Cursor tracking, presence

## Getting Help

- **Quick Start:** See `QUICKSTART.md` for 5-minute setup
- **Full Documentation:** See `README.md` for API reference
- **Setup Summary:** See `SETUP_COMPLETE.md` for overview
- **Environment Config:** See `ENV_TEMPLATE.md` for all options

## Verification Checklist

Before moving to production:

- [ ] Database schema loaded successfully
- [ ] All environment variables configured
- [ ] Firebase service account working
- [ ] HTTP server responds to health check
- [ ] WebSocket server accepts connections
- [ ] Frontend can authenticate users
- [ ] Real-time features working (cursors, shapes)
- [ ] Multiple users can collaborate
- [ ] State persists after disconnection

---

**🎉 Installation Complete!**

Your CollabCanvas backend is ready for Phase 1 MVP testing.


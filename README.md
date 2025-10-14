# CollabCanvas Backend - Phase 1 MVP

Real-time collaborative design canvas backend with WebSocket support, Supabase Authentication, and Supabase PostgreSQL database.

## 🚀 Features

### Core Features (Phase 1 MVP)
- ✅ **Express REST API** - Canvas and user management endpoints
- ✅ **WebSocket Server** - Real-time collaboration and synchronization
- ✅ **Firebase Authentication** - Secure user authentication
- ✅ **PostgreSQL Database** - Persistent data storage
- ✅ **Shape Operations** - Create, update, delete shapes in real-time
- ✅ **Presence Tracking** - See who's online and active cursors
- ✅ **Cursor Broadcasting** - Real-time cursor position updates (<50ms)
- ✅ **State Synchronization** - Automatic canvas state sync for new users
- ✅ **Conflict Resolution** - Handle simultaneous operations
- ✅ **Automatic Reconnection** - Heartbeat monitoring and recovery

## 📋 Prerequisites

- Node.js >= 18.0.0
- Supabase account and project (includes PostgreSQL + Authentication)
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   cd gauntlet-ai-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase project**
   
   See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed instructions.
   
   Quick steps:
   ```bash
   # 1. Create project at https://supabase.com
   # 2. Get credentials from Project Settings → API
   # 3. Run schema in SQL Editor
   ```

4. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=3001
   HOST=0.0.0.0
   
   # CORS Configuration
   ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006
   
   # Supabase Configuration
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_JWT_SECRET=your-jwt-secret
   
   # WebSocket Configuration
   WS_PORT=3002
   WS_HEARTBEAT_INTERVAL=30000
   
   # Performance
   PRESENCE_TTL_SECONDS=30
   MAX_OBJECTS_PER_CANVAS=1000
   
   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   
   # Logging
   LOG_LEVEL=info
   ```

5. **Get Supabase credentials**
   
   1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
   2. Select your project
   3. Go to **Project Settings** → **API**
   4. Copy the following to your `.env`:
      - Project URL → `SUPABASE_URL`
      - anon/public key → `SUPABASE_ANON_KEY`
      - service_role key → `SUPABASE_SERVICE_ROLE_KEY`
      - JWT Secret → `SUPABASE_JWT_SECRET`

## 🏃 Running the Server

### Development Mode
```bash
npm run dev
```

This will start:
- HTTP Server on `http://localhost:3001`
- WebSocket Server on `ws://localhost:3002`

### Production Build
```bash
npm run build
npm start
```

### Available Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## 📡 API Endpoints

### Authentication
- `GET /api/auth/me` - Get current authenticated user
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/logout` - Logout (update status)

### Canvas Management
- `GET /api/canvas` - List user's canvases
- `GET /api/canvas/:canvasId` - Get canvas details
- `POST /api/canvas` - Create new canvas
- `PUT /api/canvas/:canvasId` - Update canvas
- `DELETE /api/canvas/:canvasId` - Delete canvas
- `GET /api/canvas/:canvasId/shapes` - Get all shapes

### System
- `GET /api/health` - Health check
- `GET /api/ws/stats` - WebSocket statistics

## 🔌 WebSocket Protocol

### Connection
```typescript
// Connect with authentication
const ws = new WebSocket('ws://localhost:3002?token=FIREBASE_ID_TOKEN&canvasId=CANVAS_ID');
```

### Message Types

#### Client → Server
```typescript
// Cursor movement
{
  type: 'CURSOR_MOVE',
  payload: { x: number, y: number, viewportX?, viewportY?, viewportZoom? }
}

// Create shape
{
  type: 'SHAPE_CREATE',
  payload: { type, x, y, width, height, color, ... }
}

// Update shape
{
  type: 'SHAPE_UPDATE',
  payload: { shapeId, updates: { x?, y?, color?, ... } }
}

// Delete shape
{
  type: 'SHAPE_DELETE',
  payload: { shapeId }
}

// Batch update
{
  type: 'SHAPES_BATCH_UPDATE',
  payload: { updates: [{ id, data }, ...] }
}

// Request canvas sync
{
  type: 'CANVAS_SYNC_REQUEST'
}

// Ping
{
  type: 'PING'
}
```

#### Server → Client
```typescript
// Canvas sync (full state)
{
  type: 'CANVAS_SYNC',
  payload: { canvas, shapes, activeUsers }
}

// User joined
{
  type: 'USER_JOIN',
  payload: { userId, username, displayName, color }
}

// User left
{
  type: 'USER_LEAVE',
  payload: { userId, username }
}

// Cursor movement (from other users)
{
  type: 'CURSOR_MOVE',
  payload: { userId, username, color, x, y }
}

// Shape created
{
  type: 'SHAPE_CREATE',
  payload: { shape }
}

// Shape updated
{
  type: 'SHAPE_UPDATE',
  payload: { shape }
}

// Shape deleted
{
  type: 'SHAPE_DELETE',
  payload: { shapeId }
}

// Pong
{
  type: 'PONG',
  timestamp: number
}

// Error
{
  type: 'ERROR',
  payload: { message }
}
```

## 🏗️ Project Structure

```
gauntlet-ai-backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.ts   # Supabase PostgreSQL
│   │   └── supabase.ts   # Supabase client & auth
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts       # Supabase JWT authentication
│   │   ├── errorHandler.ts
│   │   └── rateLimiter.ts
│   ├── routes/           # API routes
│   │   ├── auth.routes.ts
│   │   ├── canvas.routes.ts
│   │   └── index.ts
│   ├── services/         # Business logic
│   │   ├── UserService.ts
│   │   ├── CanvasService.ts
│   │   └── PresenceService.ts
│   ├── websocket/        # WebSocket server
│   │   └── WebSocketServer.ts
│   ├── types/            # TypeScript types
│   │   └── index.ts
│   └── server.ts         # Main entry point
├── .env                  # Environment variables (create this)
├── .env.example          # Example environment file
├── package.json
├── tsconfig.json
└── README.md
```

## 🔒 Security

- **Supabase Authentication** - All HTTP endpoints require valid Supabase JWT token
- **WebSocket Authentication** - Token-based connection authentication
- **Rate Limiting** - Prevent abuse with request rate limits
- **Helmet** - Security headers
- **CORS** - Configurable origin restrictions
- **Input Validation** - Joi schema validation
- **SQL Injection Protection** - Supabase client with parameterized queries

## 🎯 Performance Targets

- ✅ Shape operations: <100ms latency
- ✅ Cursor updates: <50ms latency (throttled)
- ✅ WebSocket heartbeat: 30s intervals
- ✅ Support 5+ concurrent users per canvas
- ✅ Handle 500+ shapes per canvas
- ✅ 60 FPS rendering on frontend

## 🧪 Testing

### Manual Testing

1. **Test HTTP endpoints**
   ```bash
   # Health check
   curl http://localhost:3001/api/health
   
   # Get current user (requires Firebase token)
   curl -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
        http://localhost:3001/api/auth/me
   ```

2. **Test WebSocket connection**
   ```javascript
   const ws = new WebSocket('ws://localhost:3002?token=YOUR_TOKEN&canvasId=TEST_ID');
   
   ws.onopen = () => {
     console.log('Connected');
     ws.send(JSON.stringify({ type: 'PING' }));
   };
   
   ws.onmessage = (event) => {
     console.log('Message:', JSON.parse(event.data));
   };
   ```

## 📊 Database Schema

The database schema is defined in:
`../gauntlet-ai-frontend/@docs/DATABASE_SCHEMA.sql`

Execute this in **Supabase SQL Editor** to create tables.

Key tables:
- `users` - User accounts
- `canvases` - Canvas metadata
- `canvas_objects` - Shapes and elements
- `presence` - Real-time user presence (ephemeral)
- `ai_commands` - AI command history (Phase 2)

**Note:** Supabase provides the PostgreSQL database, no separate installation needed!

## 🚨 Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
pg_isready

# Check database exists
psql -l | grep gauntletaidb

# Test connection
psql -U your_user -d gauntletaidb -c "SELECT 1"
```

### Firebase Authentication Issues
```bash
# Verify service account file exists
ls -la firebase-service-account.json

# Check Firebase credentials in .env
echo $FIREBASE_PROJECT_ID
```

### Port Already in Use
```bash
# Find and kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or change port in .env
PORT=3003
```

## 🔮 Phase 2 Features (Coming Soon)

- AI Integration (OpenAI/LangChain)
- Natural language canvas commands
- Undo/redo history
- Canvas versioning
- Comments and annotations
- Shape grouping
- Advanced permissions

## 📝 License

MIT

## 🤝 Contributing

This is an MVP. For Phase 2 features, please refer to the product requirements document.

---

**Built with ❤️ using Express, WebSockets, and Supabase**


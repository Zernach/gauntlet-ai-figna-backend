// Core type definitions for Figna Backend

export interface User {
    id: string;
    username: string;
    email: string;
    displayName?: string;
    avatarColor: string;
    avatarUrl?: string;
    isOnline: boolean;
    preferences?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    lastSeenAt?: Date;
}

export interface Canvas {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
    isPublic: boolean;
    isTemplate: boolean;
    thumbnailUrl?: string;
    viewportX: number;
    viewportY: number;
    viewportZoom: number;
    backgroundColor: string;
    gridEnabled: boolean;
    gridSize: number;
    snapToGrid: boolean;
    width?: number;
    height?: number;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    lastAccessedAt?: Date;
}

export type CanvasObjectType =
    | 'rectangle'
    | 'circle'
    | 'text'
    | 'line'
    | 'polygon'
    | 'image';

export interface CanvasObject {
    id: string;
    canvasId: string;
    type: CanvasObjectType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
    rotation: number;
    color: string;
    strokeColor?: string;
    strokeWidth: number;
    opacity: number;
    shadowColor?: string;
    shadowStrength?: number;
    borderRadius?: number;
    textContent?: string;
    fontSize?: number;
    fontFamily: string;
    fontWeight: string;
    textAlign: string;
    zIndex: number;
    lockedAt?: Date;
    lockedBy?: string;
    isVisible: boolean;
    groupId?: string;
    metadata: Record<string, any>;
    createdBy: string;
    lastModifiedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Presence {
    id: string;
    userId: string;
    canvasId: string;
    cursorX: number;
    cursorY: number;
    viewportX?: number;
    viewportY?: number;
    viewportZoom?: number;
    selectedObjectIds: string[];
    isActive: boolean;
    color: string;
    connectionId: string;
    lastHeartbeat: Date;
}

export type AICommandStatus =
    | 'pending'
    | 'executing'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface AICommand {
    id: string;
    canvasId: string;
    userId: string;
    commandText: string;
    parsedIntent?: string;
    status: AICommandStatus;
    resultObjectIds: string[];
    operationsExecuted: any[];
    errorMessage?: string;
    executionTimeMs?: number;
    tokensUsed?: number;
    model?: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    cancelledAt?: Date;
}

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface CanvasCollaborator {
    id: string;
    canvasId: string;
    userId: string;
    role: CollaboratorRole;
    invitedBy?: string;
    canEdit: boolean;
    canDelete: boolean;
    canShare: boolean;
    canExport: boolean;
    invitedAt?: Date;
    acceptedAt?: Date;
    lastAccessedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

// WebSocket Message Types
export type WSMessageType =
    | 'SHAPE_CREATE'
    | 'SHAPE_UPDATE'
    | 'SHAPE_DELETE'
    | 'SHAPES_BATCH_UPDATE'
    | 'CURSOR_MOVE'
    | 'USER_JOIN'
    | 'USER_LEAVE'
    | 'PRESENCE_UPDATE'
    | 'ACTIVE_USERS'
    | 'CANVAS_UPDATE'
    | 'CANVAS_SYNC'
    | 'CANVAS_SYNC_REQUEST'
    | 'RECONNECT_REQUEST'
    | 'PING'
    | 'PONG'
    | 'ERROR'
    | 'AI_COMMAND_START'
    | 'AI_COMMAND_PROGRESS'
    | 'AI_COMMAND_COMPLETE'
    | 'AI_COMMAND_ERROR'
    | 'AI_COMMAND_CANCEL';

export interface WSMessage {
    type: WSMessageType;
    payload?: any;
    userId?: string;
    canvasId?: string;
    timestamp?: number;
}

export interface WSClient {
    id: string;
    userId: string;
    canvasId: string;
    socket: any;
    isAlive: boolean;
    lastPing: number;
    user?: User;
}

// API Request/Response Types
export interface CreateCanvasRequest {
    name: string;
    description?: string;
    isPublic?: boolean;
}

export interface UpdateCanvasRequest {
    name?: string;
    description?: string;
    isPublic?: boolean;
    viewportX?: number;
    viewportY?: number;
    viewportZoom?: number;
    backgroundColor?: string;
    gridEnabled?: boolean;
    gridSize?: number;
    snapToGrid?: boolean;
}

export interface CreateShapeRequest {
    type: CanvasObjectType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
    rotation?: number;
    color: string;
    strokeColor?: string;
    strokeWidth?: number;
    opacity?: number;
    shadowColor?: string;
    shadowStrength?: number;
    borderRadius?: number;
    textContent?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    textAlign?: string;
    zIndex?: number;
}

export interface UpdateShapeRequest {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    radius?: number;
    rotation?: number;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    opacity?: number;
    shadowColor?: string;
    shadowStrength?: number;
    borderRadius?: number;
    textContent?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    textAlign?: string;
    zIndex?: number;
    lockedAt?: Date | null;
    lockedBy?: string | null;
    isVisible?: boolean;
}

// Database Query Result Types
export interface QueryResult<T> {
    rows: T[];
    rowCount: number;
}

// Authentication
export interface AuthenticatedRequest extends Express.Request {
    user?: {
        uid: string;
        email?: string;
        name?: string;
    };
}


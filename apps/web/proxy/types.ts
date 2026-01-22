// Offline Database Types and Interfaces

export interface WorkspaceData {
    id: number;
    name: string;
    content?: Record<string, unknown>;
    createdAT: string;
    updatedAT: string;
    createdById: string;
    _lastModified: number;
    _synced: boolean;
}

export interface TemplateData {
    id: number;
    name: string;
    content?: Record<string, unknown>;
    type: string;
    public: boolean;
    tags: string[];
    createdAT: string;
    updatedAT: string;
    createdById: string;
    yours: boolean;
    _lastModified: number;
    _synced: boolean;
}

export interface UserData {
    id: string;
    name?: string;
    email: string;
    image?: string;
    _lastModified: number;
    _synced: boolean;
}

export interface AuthData {
    sessionToken?: string;
    userId?: string;
    expires?: string;
    user?: Record<string, unknown>;
    session?: Record<string, unknown>;
    _lastModified: number;
}

export interface SyncOperation {
    id: string;
    method: string;
    url: string;
    body?: Record<string, unknown>;
    timestamp: number;
    retryCount: number;
}

export interface ApiResponse {
    status: number;
    data?: unknown;
    headers?: Record<string, string>;
}

// API endpoint patterns
export const API_ENDPOINTS = {
    WORKSPACES: "/api/workspaces",
    WORKSPACE_BY_ID: /^\/api\/workspaces\/(\d+)$/,
    TEMPLATES: "/api/templates",
    TEMPLATE_BY_ID: /^\/api\/templates\/(\d+)$/,
    USERS: /^\/api\/users\/(.+)$/,
    AUTH: /^\/api\/auth\/.+$/,
    AUTH_SESSION: "/api/auth/session",
    AUTH_SIGNIN: /^\/api\/auth\/signin/,
    AUTH_SIGNOUT: /^\/api\/auth\/signout/,
} as const;

// Sync statuses
export enum SyncStatus {
    PENDING = "pending",
    SYNCING = "syncing",
    SYNCED = "synced",
    FAILED = "failed",
}

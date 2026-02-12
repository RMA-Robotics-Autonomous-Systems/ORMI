/**
 * Workspace data for offline storage.
 */
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

/**
 * Template data for offline storage.
 */
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

/**
 * User data for offline storage.
 */
export interface UserData {
	id: string;
	name?: string;
	email: string;
	image?: string;
	_lastModified: number;
	_synced: boolean;
}

/**
 * Authentication data for offline storage.
 */
export interface AuthData {
	sessionToken?: string;
	userId?: string;
	expires?: string;
	user?: Record<string, unknown>;
	session?: Record<string, unknown>;
	_lastModified: number;
}

/**
 * Sync operation queue entry.
 */
export interface SyncOperation {
	id: string;
	method: string;
	url: string;
	body?: Record<string, unknown>;
	timestamp: number;
	retryCount: number;
}

/**
 * API response structure.
 */
export interface ApiResponse {
	status: number;
	data?: unknown;
	headers?: Record<string, string>;
}

/**
 * API endpoint patterns for routing.
 */
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

/**
 * Sync status enum.
 */
export enum SyncStatus {
	PENDING = "pending",
	SYNCING = "syncing",
	SYNCED = "synced",
	FAILED = "failed",
}

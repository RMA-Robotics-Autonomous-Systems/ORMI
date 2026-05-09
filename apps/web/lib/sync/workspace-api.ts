"use client";

import { env } from "@/config/env.js";
import { withOffline } from "@workspace/ormi-sync";
import { workspaceApi } from "../api/workspace-api";
import { workspaceSyncConfig } from "./workspace-sync-config";

/**
 * Offline-capable workspace API.
 *
 * Wraps workspaceApi with the ormi-sync Proxy:
 *  - Online: calls through normally; read results are cached in local DB.
 *  - Offline: read methods are served from local DB; mutations are queued
 *    and replayed when connectivity is restored.
 *
 * Usage: import `syncedWorkspaceApi` in components.
 * When offline mode is disabled, this transparently falls back to workspaceApi.
 */
export const syncedWorkspaceApi = env.NEXT_PUBLIC_ENABLE_OFFLINE_MODE
	? withOffline(workspaceApi, workspaceSyncConfig)
	: workspaceApi;

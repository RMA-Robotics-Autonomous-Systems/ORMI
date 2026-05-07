"use client";

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
 * Usage: import `syncedWorkspaceApi` instead of `workspaceApi` in components.
 */
export const syncedWorkspaceApi = withOffline(
	workspaceApi,
	workspaceSyncConfig,
);

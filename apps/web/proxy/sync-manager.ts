import { OfflineDatabase } from "./database";
import { ConflictResolver } from "./conflict-resolver";
import { SyncOperation, SyncStatus } from "./types";

/**
 * Sync Manager
 * Handles background synchronization when network is restored
 * Implements last-write-wins conflict resolution
 */
export class SyncManager {
	private db: OfflineDatabase;
	private conflictResolver: ConflictResolver;
	private isOnline: boolean = navigator.onLine;
	private syncInProgress: boolean = false;
	private syncInterval: number | null = null;

	constructor(database: OfflineDatabase, conflictResolver: ConflictResolver) {
		this.db = database;
		this.conflictResolver = conflictResolver;

		// Listen for online/offline events
		self.addEventListener("online", () => this.handleOnline());
		self.addEventListener("offline", () => this.handleOffline());

		// Register for background sync if supported
		if (
			"serviceWorker" in self &&
			"sync" in self.ServiceWorkerRegistration.prototype
		) {
			self.addEventListener("sync", (event) => {
				if ((event as any).tag === "background-sync") {
					(event as any).waitUntil(this.performSync());
				}
			});
		}

		// Start periodic sync check
		this.startPeriodicSync();
	}

	/**
	 * Queue an operation for later synchronization
	 */
	async queueOperation(operation: SyncOperation): Promise<void> {
		console.log(
			"📤 Queuing operation for sync:",
			operation.method,
			operation.url,
		);
		await this.db.addToSyncQueue(operation);

		// Try to sync immediately if online
		if (this.isOnline && !this.syncInProgress) {
			setTimeout(() => this.performSync(), 100);
		}
	}

	/**
	 * Handle when device comes back online
	 */
	private handleOnline(): void {
		console.log("🌐 Device is back online, starting sync...");
		this.isOnline = true;

		// Perform sync after a short delay to allow network to stabilize
		setTimeout(() => this.performSync(), 1000);
	}

	/**
	 * Handle when device goes offline
	 */
	private handleOffline(): void {
		console.log("📴 Device is offline");
		this.isOnline = false;
	}

	/**
	 * Perform synchronization of queued operations
	 */
	async performSync(): Promise<void> {
		if (this.syncInProgress || !this.isOnline) {
			return;
		}

		console.log("🔄 Starting sync process...");
		this.syncInProgress = true;

		try {
			// Get authentication
			const auth = await this.db.getAuth();
			if (!auth?.userId) {
				console.log("⚠️ No authentication found, skipping sync");
				return;
			}

			// Sync queued operations first
			await this.syncQueuedOperations();

			// Then sync any remaining unsynced items
			await this.syncUnsyncedItems(auth.userId);

			console.log("✅ Sync completed successfully");
		} catch (error) {
			console.error("❌ Sync failed:", error);
		} finally {
			this.syncInProgress = false;
		}
	}

	/**
	 * Sync all queued operations
	 */
	private async syncQueuedOperations(): Promise<void> {
		const operations = await this.db.getSyncQueue();

		console.log(`🔄 Syncing ${operations.length} queued operations`);

		for (const operation of operations) {
			try {
				await this.syncSingleOperation(operation);
				await this.db.removeFromSyncQueue(operation.id);
				console.log(
					`✅ Synced operation: ${operation.method} ${operation.url}`,
				);
			} catch (error) {
				console.error(
					`❌ Failed to sync operation ${operation.id}:`,
					error,
				);

				// Increment retry count and requeue if under limit
				operation.retryCount++;
				if (operation.retryCount < 3) {
					await this.db.addToSyncQueue(operation);
				} else {
					console.error(
						`❌ Max retries reached for operation ${operation.id}, removing from queue`,
					);
					await this.db.removeFromSyncQueue(operation.id);
				}
			}
		}
	}

	/**
	 * Sync a single queued operation
	 */
	private async syncSingleOperation(operation: SyncOperation): Promise<void> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		// Add auth headers if available
		const auth = await this.db.getAuth();
		if (auth?.sessionToken) {
			headers["Authorization"] = `Bearer ${auth.sessionToken}`;
		}

		const requestOptions: RequestInit = {
			method: operation.method,
			headers,
		};

		if (
			operation.body &&
			["POST", "PUT", "PATCH"].includes(operation.method)
		) {
			requestOptions.body = JSON.stringify(operation.body);
		}

		const response = await fetch(operation.url, requestOptions);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		// Update local data with server response if needed
		if (operation.method === "POST") {
			const responseData = await response.json();
			await this.handleCreateResponse(operation, responseData);
		}
	}

	/**
	 * Handle response from CREATE operations to update local IDs
	 */
	private async handleCreateResponse(
		operation: SyncOperation,
		responseData: unknown,
	): Promise<void> {
		if (
			operation.url === "/api/workspaces" &&
			typeof responseData === "object" &&
			responseData !== null
		) {
			const serverWorkspace = responseData as { id: number };
			const bodyData = operation.body as {
				title?: string;
				userId?: string;
			};

			if (serverWorkspace.id && bodyData?.title) {
				// Update local workspace with server ID
				const localWorkspaces = await this.db.getWorkspaces(
					bodyData.userId || "",
				);
				const localWorkspace = localWorkspaces.find(
					(ws) => ws.name === bodyData.title,
				);

				if (localWorkspace) {
					// Remove old entry and add with new ID
					await this.db.deleteWorkspace(localWorkspace.id);
					await this.db.saveWorkspace({
						...localWorkspace,
						id: serverWorkspace.id,
						_synced: true,
					});
				}
			}
		}

		if (
			operation.url === "/api/templates" &&
			typeof responseData === "string"
		) {
			const serverId = parseInt(responseData);
			const bodyData = operation.body as { content?: { name?: string } };

			if (serverId && bodyData?.content?.name) {
				// Update local template with server ID
				const auth = await this.db.getAuth();
				if (auth?.userId) {
					const localTemplates = await this.db.getTemplates(
						auth.userId,
					);
					const localTemplate = localTemplates.find(
						(t) => t.name === bodyData.content?.name,
					);

					if (localTemplate) {
						// Remove old entry and add with new ID
						await this.db.deleteTemplate(localTemplate.id);
						await this.db.saveTemplate({
							...localTemplate,
							id: serverId,
							_synced: true,
						});
					}
				}
			}
		}
	}

	/**
	 * Sync any unsynced items that weren't in the queue
	 */
	private async syncUnsyncedItems(userId: string): Promise<void> {
		console.log("🔄 Syncing unsynced items...");

		// Sync unsynced workspaces
		const unsyncedWorkspaces = await this.db.getUnsyncedWorkspaces(userId);
		for (const workspace of unsyncedWorkspaces) {
			try {
				await this.conflictResolver.resolveWorkspaceConflict(workspace);
				await this.db.markAsSynced("workspaces", workspace.id);
			} catch (error) {
				console.error(
					`Failed to sync workspace ${workspace.id}:`,
					error,
				);
			}
		}

		// Sync unsynced templates
		const unsyncedTemplates = await this.db.getUnsyncedTemplates(userId);
		for (const template of unsyncedTemplates) {
			try {
				await this.conflictResolver.resolveTemplateConflict(template);
				await this.db.markAsSynced("templates", template.id);
			} catch (error) {
				console.error(`Failed to sync template ${template.id}:`, error);
			}
		}
	}

	/**
	 * Start periodic sync checking
	 */
	private startPeriodicSync(): void {
		// Check for sync every 30 seconds if online
		this.syncInterval = setInterval(() => {
			if (this.isOnline && !this.syncInProgress) {
				this.performSync();
			}
		}, 30000) as unknown as number;
	}

	/**
	 * Stop periodic sync checking
	 */
	stopPeriodicSync(): void {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	/**
	 * Force sync now (for manual sync triggers)
	 */
	async forcSync(): Promise<void> {
		if (!this.isOnline) {
			throw new Error("Cannot sync while offline");
		}

		await this.performSync();
	}

	/**
	 * Get sync status
	 */
	async getSyncStatus(): Promise<{
		pendingOperations: number;
		lastSync: number;
	}> {
		const queue = await this.db.getSyncQueue();
		const auth = await this.db.getAuth();

		return {
			pendingOperations: queue.length,
			lastSync: auth?._lastModified || 0,
		};
	}

	/**
	 * Clear all sync data (for logout)
	 */
	async clearSyncData(): Promise<void> {
		await this.db.clearSyncQueue();
		this.stopPeriodicSync();
	}
}

// Main proxy exports
export { OfflineDatabase } from "./database";
export { ApiInterceptor } from "./api-interceptor";
export { SyncManager } from "./sync-manager";
export { ConflictResolver } from "./conflict-resolver";
export * from "./types";

// Proxy initialization and management
import { OfflineDatabase } from "./database";
import { ApiInterceptor } from "./api-interceptor";
import { SyncManager } from "./sync-manager";
import { ConflictResolver } from "./conflict-resolver";

/**
 * Main offline proxy system coordinating all offline functionality.
 */
export class OfflineProxy {
	private database: OfflineDatabase;
	private apiInterceptor: ApiInterceptor;
	private syncManager: SyncManager;
	private conflictResolver: ConflictResolver;
	private initialized: boolean = false;

	constructor() {
		this.database = new OfflineDatabase();
		this.conflictResolver = new ConflictResolver(this.database);
		this.syncManager = new SyncManager(
			this.database,
			this.conflictResolver,
		);
		this.apiInterceptor = new ApiInterceptor(
			this.database,
			this.syncManager,
		);
	}

	/**
	 * Initializes the offline proxy system.
	 * @returns Promise that resolves when initialized.
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		console.log("🔧 Initializing Offline Proxy System...");

		try {
			await this.database.init();
			console.log("✅ Offline database initialized");

			this.initialized = true;
			console.log("✅ Offline Proxy System ready");
		} catch (error) {
			console.error(
				"❌ Failed to initialize Offline Proxy System:",
				error,
			);
			throw error;
		}
	}

	/**
	 * Handles incoming requests.
	 * @param request - Request to handle.
	 * @returns Response or null if not handled.
	 */
	async handleRequest(request: Request): Promise<Response | null> {
		if (!this.initialized) {
			await this.initialize();
		}

		return this.apiInterceptor.handleRequest(request);
	}

	/**
	 * Sets authentication data.
	 * @param authData - Authentication data to store.
	 * @returns Promise that resolves when complete.
	 */
	async setAuth(authData: Record<string, unknown>): Promise<void> {
		await this.database.setAuth({
			sessionToken: authData.sessionToken as string,
			userId: authData.userId as string,
			expires: authData.expires as string,
			user: authData.user as Record<string, unknown>,
			_lastModified: Date.now(),
		});
	}

	/**
	 * Clear authentication and all data
	 */
	async clearAuth(): Promise<void> {
		await this.database.clearAuth();
		await this.syncManager.clearSyncData();
	}

	/**
	 * Force sync now
	 */
	async forceSync(): Promise<void> {
		await this.syncManager.forcSync();
	}

	/**
	 * Get sync status
	 */
	async getSyncStatus(): Promise<{
		pendingOperations: number;
		lastSync: number;
	}> {
		return this.syncManager.getSyncStatus();
	}

	/**
	 * Clear all offline data
	 */
	async clearAllData(): Promise<void> {
		await this.database.clearAllData();
		await this.syncManager.clearSyncData();
	}
}

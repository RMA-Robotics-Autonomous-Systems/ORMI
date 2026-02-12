import {
	WorkspaceData,
	TemplateData,
	UserData,
	AuthData,
	SyncOperation,
} from "./types";

/**
 * IndexedDB database wrapper for offline storage.
 */
export class OfflineDatabase {
	private dbName = "ormi-offline-db";
	private version = 1;
	private db: IDBDatabase | null = null;

	async init(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;

				// Workspaces store
				if (!db.objectStoreNames.contains("workspaces")) {
					const workspaceStore = db.createObjectStore("workspaces", {
						keyPath: "id",
					});
					workspaceStore.createIndex("createdById", "createdById", {
						unique: false,
					});
					workspaceStore.createIndex(
						"_lastModified",
						"_lastModified",
						{
							unique: false,
						},
					);
				}

				// Templates store
				if (!db.objectStoreNames.contains("templates")) {
					const templateStore = db.createObjectStore("templates", {
						keyPath: "id",
					});
					templateStore.createIndex("createdById", "createdById", {
						unique: false,
					});
					templateStore.createIndex("public", "public", {
						unique: false,
					});
					templateStore.createIndex(
						"_lastModified",
						"_lastModified",
						{
							unique: false,
						},
					);
				}

				// Users store
				if (!db.objectStoreNames.contains("users")) {
					db.createObjectStore("users", { keyPath: "id" });
				}

				// Auth store
				if (!db.objectStoreNames.contains("auth")) {
					db.createObjectStore("auth", { keyPath: "key" });
				}

				// Sync queue store
				if (!db.objectStoreNames.contains("syncQueue")) {
					const syncStore = db.createObjectStore("syncQueue", {
						keyPath: "id",
					});
					syncStore.createIndex("timestamp", "timestamp", {
						unique: false,
					});
				}
			};
		});
	}

	private async getStore(
		storeName: string,
		mode: IDBTransactionMode = "readonly",
	): Promise<IDBObjectStore> {
		if (!this.db) await this.init();
		const transaction = this.db!.transaction([storeName], mode);
		return transaction.objectStore(storeName);
	}

	// Auth operations
	async setAuth(authData: AuthData): Promise<void> {
		const store = await this.getStore("auth", "readwrite");
		await this.promisifyRequest(store.put({ key: "session", ...authData }));
	}

	async getAuth(): Promise<AuthData | null> {
		console.log("🔐 Getting auth data from offline DB");
		try {
			const store = await this.getStore("auth");
			const result = await this.promisifyRequest(store.get("session"));
			console.log("🔐 Found auth data:", result ? "✅ Yes" : "❌ None");
			return result || null;
		} catch (error) {
			console.error("❌ Error getting auth data from offline DB:", error);
			return null;
		}
	}

	async clearAuth(): Promise<void> {
		const store = await this.getStore("auth", "readwrite");
		await this.promisifyRequest(store.delete("session"));
	}

	// Workspace operations
	async getWorkspaces(userId: string): Promise<WorkspaceData[]> {
		console.log("💾 Getting workspaces for user:", userId);
		try {
			const store = await this.getStore("workspaces");
			const index = store.index("createdById");
			const request = index.getAll(userId);
			const workspaces = (await this.promisifyRequest(request)) || [];
			console.log(
				"💾 Found",
				workspaces.length,
				"workspaces in offline DB",
			);
			return workspaces;
		} catch (error) {
			console.error(
				"❌ Error getting workspaces from offline DB:",
				error,
			);
			return [];
		}
	}

	async getWorkspace(
		id: number,
		userId: string,
	): Promise<WorkspaceData | null> {
		const store = await this.getStore("workspaces");
		const workspace = await this.promisifyRequest(store.get(id));
		return workspace && workspace.createdById === userId ? workspace : null;
	}

	async saveWorkspace(workspace: WorkspaceData): Promise<void> {
		workspace._lastModified = Date.now();
		workspace._synced = false;
		const store = await this.getStore("workspaces", "readwrite");
		await this.promisifyRequest(store.put(workspace));
	}

	async deleteWorkspace(id: number): Promise<void> {
		const store = await this.getStore("workspaces", "readwrite");
		await this.promisifyRequest(store.delete(id));
	}

	// Template operations
	async getTemplates(userId: string): Promise<TemplateData[]> {
		const store = await this.getStore("templates");
		const allTemplates =
			(await this.promisifyRequest(store.getAll())) || [];

		// Filter templates (public or owned by user)
		return allTemplates.filter(
			(template: TemplateData) =>
				template.public || template.createdById === userId,
		);
	}

	async getTemplate(
		id: number,
		userId: string,
	): Promise<TemplateData | null> {
		const store = await this.getStore("templates");
		const template = await this.promisifyRequest(store.get(id));

		if (!template) return null;

		// Check access (public or owned by user)
		if (template.public || template.createdById === userId) {
			return template;
		}

		return null;
	}

	async saveTemplate(template: TemplateData): Promise<void> {
		template._lastModified = Date.now();
		template._synced = false;
		const store = await this.getStore("templates", "readwrite");
		await this.promisifyRequest(store.put(template));
	}

	async deleteTemplate(id: number): Promise<void> {
		const store = await this.getStore("templates", "readwrite");
		await this.promisifyRequest(store.delete(id));
	}

	// User operations
	async getUser(id: string): Promise<UserData | null> {
		const store = await this.getStore("users");
		return this.promisifyRequest(store.get(id));
	}

	async saveUser(user: UserData): Promise<void> {
		user._lastModified = Date.now();
		user._synced = false;
		const store = await this.getStore("users", "readwrite");
		await this.promisifyRequest(store.put(user));
	}

	// Sync queue operations
	async addToSyncQueue(operation: SyncOperation): Promise<void> {
		const store = await this.getStore("syncQueue", "readwrite");
		await this.promisifyRequest(store.put(operation));
	}

	async getSyncQueue(): Promise<SyncOperation[]> {
		const store = await this.getStore("syncQueue");
		const index = store.index("timestamp");
		return this.promisifyRequest(index.getAll()) || [];
	}

	async removeFromSyncQueue(id: string): Promise<void> {
		const store = await this.getStore("syncQueue", "readwrite");
		await this.promisifyRequest(store.delete(id));
	}

	async clearSyncQueue(): Promise<void> {
		const store = await this.getStore("syncQueue", "readwrite");
		await this.promisifyRequest(store.clear());
	}

	// Utility method to promisify IndexedDB requests
	private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	// Bulk sync operations
	async syncWorkspaces(workspaces: WorkspaceData[]): Promise<void> {
		const store = await this.getStore("workspaces", "readwrite");
		for (const workspace of workspaces) {
			const workspaceData: WorkspaceData = {
				...workspace,
				_lastModified: Date.now(),
				_synced: true,
			};
			await this.promisifyRequest(store.put(workspaceData));
		}
	}

	async syncTemplates(templates: TemplateData[]): Promise<void> {
		const store = await this.getStore("templates", "readwrite");
		for (const template of templates) {
			const templateData: TemplateData = {
				...template,
				_lastModified: Date.now(),
				_synced: true,
			};
			await this.promisifyRequest(store.put(templateData));
		}
	}

	async markAsSynced(storeName: string, id: number | string): Promise<void> {
		const store = await this.getStore(storeName, "readwrite");
		const item = await this.promisifyRequest(store.get(id));
		if (item) {
			item._synced = true;
			await this.promisifyRequest(store.put(item));
		}
	}

	// Get unsynced items for conflict resolution
	async getUnsyncedWorkspaces(userId: string): Promise<WorkspaceData[]> {
		const store = await this.getStore("workspaces");
		const allWorkspaces =
			(await this.promisifyRequest(store.getAll())) || [];
		return allWorkspaces.filter(
			(ws: WorkspaceData) => ws.createdById === userId && !ws._synced,
		);
	}

	async getUnsyncedTemplates(userId: string): Promise<TemplateData[]> {
		const store = await this.getStore("templates");
		const allTemplates =
			(await this.promisifyRequest(store.getAll())) || [];
		return allTemplates.filter(
			(template: TemplateData) =>
				template.createdById === userId && !template._synced,
		);
	}

	// Clear all data (for logout or reset)
	async clearAllData(): Promise<void> {
		if (!this.db) await this.init();

		const stores = [
			"workspaces",
			"templates",
			"users",
			"auth",
			"syncQueue",
		];
		const transaction = this.db!.transaction(stores, "readwrite");

		const promises = stores.map((storeName) => {
			const store = transaction.objectStore(storeName);
			return this.promisifyRequest(store.clear());
		});

		await Promise.all(promises);
	}
}

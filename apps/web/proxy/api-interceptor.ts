import { OfflineDatabase } from "./database";
import { SyncManager } from "./sync-manager";
import {
	API_ENDPOINTS,
	ApiResponse,
	WorkspaceData,
	TemplateData,
	UserData,
} from "./types";

/**
 * API request interceptor with online-first, offline-fallback logic.
 */
export class ApiInterceptor {
	private db: OfflineDatabase;
	private syncManager: SyncManager;

	constructor(database: OfflineDatabase, syncManager: SyncManager) {
		this.db = database;
		this.syncManager = syncManager;
	}

	/**
	 * Handles API request with offline fallback.
	 * @param request - Request to handle.
	 * @returns Response or null if passthrough.
	 */
	async handleRequest(request: Request): Promise<Response | null> {
		const url = new URL(request.url);
		if (url.origin !== self.location.origin) {
			return fetch(request);
		}

		const pathname = this.normalizePathname(url.pathname);

		console.log("🔄 Intercepting API request:", request.method, pathname);

		// Handle auth routes specially - always try online, cache session data
		if (API_ENDPOINTS.AUTH.test(pathname)) {
			return this.handleAuthRequest(request);
		}

		try {
			// Try online first for non-auth routes
			const onlineResponse = await this.tryOnlineRequest(request);

			if (onlineResponse.ok) {
				// Cache successful responses for offline use
				await this.cacheResponse(request, onlineResponse);
				return onlineResponse;
			} else {
				throw new Error(
					`Online request failed with status: ${onlineResponse.status}`,
				);
			}
		} catch (error) {
			console.log("⚠️ Online request failed, trying offline:", error);

			// Fallback to offline
			const offlineResponse = await this.handleOfflineRequest(request);
			if (offlineResponse) {
				return offlineResponse;
			}

			// If offline also fails, return error
			return new Response(
				JSON.stringify({ error: "Service unavailable offline" }),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * Attempts online request with timeout.
	 * @param request - Request to make.
	 * @returns Response from server.
	 */
	private async tryOnlineRequest(request: Request): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

		try {
			const response = await fetch(request.clone(), {
				signal: controller.signal,
			});
			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}

	/**
	 * Cache successful online responses
	 */
	private async cacheResponse(
		request: Request,
		response: Response,
	): Promise<void> {
		const auth = await this.db.getAuth();
		if (!auth?.userId) return;

		const pathname = this.normalizePathname(new URL(request.url).pathname);
		const responseData = await response.clone().json();

		try {
			if (
				pathname === API_ENDPOINTS.WORKSPACES &&
				request.method === "GET"
			) {
				// Cache all workspaces
				const workspaces = Array.isArray(responseData)
					? responseData
					: [];
				await this.db.syncWorkspaces(
					workspaces.map((ws) => ({
						...ws,
						_lastModified: Date.now(),
						_synced: true,
					})),
				);
			} else if (
				pathname === API_ENDPOINTS.TEMPLATES &&
				request.method === "GET"
			) {
				// Cache all templates
				const templates = Array.isArray(responseData)
					? responseData
					: [];
				await this.db.syncTemplates(
					templates.map((template) => ({
						id: parseInt(
							template.id || template.id?.toString() || "0",
						),
						name: template.name,
						content:
							template.widget ||
							template.datasource ||
							template.content,
						type: template.type,
						public: template.public || false,
						tags: template.tags || [],
						createdAT: new Date().toISOString(),
						updatedAT: new Date().toISOString(),
						createdById: template.yours ? auth.userId || "" : "",
						yours: template.yours || false,
						_lastModified: Date.now(),
						_synced: true,
					})),
				);
			} else if (
				API_ENDPOINTS.WORKSPACE_BY_ID.test(pathname) &&
				request.method === "GET"
			) {
				// Cache single workspace
				const workspace: WorkspaceData = {
					...responseData,
					_lastModified: Date.now(),
					_synced: true,
				};
				await this.db.saveWorkspace(workspace);
			}
		} catch (error) {
			console.error("Failed to cache response:", error);
		}
	}

	/**
	 * Handle request when offline
	 */
	private async handleOfflineRequest(
		request: Request,
	): Promise<Response | null> {
		const pathname = this.normalizePathname(new URL(request.url).pathname);
		const method = request.method.toUpperCase();
		console.log("📱 Handling offline request:", method, pathname);

		const auth = await this.db.getAuth();

		if (!auth?.userId) {
			console.log("❌ No auth data found for offline request");
			return new Response(
				JSON.stringify({ error: "Authentication required" }),
				{
					status: 401,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		console.log("✅ Auth data found, user ID:", auth.userId);

		try {
			// Handle different endpoints
			if (pathname === API_ENDPOINTS.WORKSPACES) {
				return this.handleWorkspacesRequest(
					method,
					request,
					auth.userId,
				);
			} else if (API_ENDPOINTS.WORKSPACE_BY_ID.test(pathname)) {
				const match = pathname.match(API_ENDPOINTS.WORKSPACE_BY_ID);
				const workspaceId = parseInt(match?.[1] || "0");
				return this.handleWorkspaceByIdRequest(
					method,
					request,
					workspaceId,
					auth.userId,
				);
			} else if (pathname === API_ENDPOINTS.TEMPLATES) {
				return this.handleTemplatesRequest(
					method,
					request,
					auth.userId,
				);
			} else if (API_ENDPOINTS.TEMPLATE_BY_ID.test(pathname)) {
				const match = pathname.match(API_ENDPOINTS.TEMPLATE_BY_ID);
				const templateId = parseInt(match?.[1] || "0");
				return this.handleTemplateByIdRequest(
					method,
					request,
					templateId,
					auth.userId,
				);
			} else if (API_ENDPOINTS.USERS.test(pathname)) {
				return this.handleUsersRequest(method, request, auth.userId);
			}
		} catch (error) {
			console.error("Offline request handling error:", error);
			return new Response(
				JSON.stringify({ error: "Offline operation failed" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return null;
	}

	/**
	 * Handle /api/workspaces requests
	 */
	private async handleWorkspacesRequest(
		method: string,
		request: Request,
		userId: string,
	): Promise<Response> {
		switch (method) {
			case "GET": {
				const workspaces = await this.db.getWorkspaces(userId);
				return new Response(JSON.stringify(workspaces), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			case "POST": {
				const createData = await request.json();
				const newWorkspace: WorkspaceData = {
					id: Date.now(), // Temporary ID, will be replaced on sync
					name: createData.title || createData.name,
					content: undefined,
					createdAT: new Date().toISOString(),
					updatedAT: new Date().toISOString(),
					createdById: userId,
					_lastModified: Date.now(),
					_synced: false,
				};

				await this.db.saveWorkspace(newWorkspace);

				// Queue for sync
				await this.syncManager.queueOperation({
					id: `workspace-create-${Date.now()}`,
					method: "POST",
					url: "/api/workspaces",
					body: createData,
					timestamp: Date.now(),
					retryCount: 0,
				});

				return new Response(JSON.stringify(newWorkspace), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			default:
				return new Response(null, { status: 405 });
		}
	}

	/**
	 * Handle /api/workspaces/[id] requests
	 */
	private async handleWorkspaceByIdRequest(
		method: string,
		request: Request,
		workspaceId: number,
		userId: string,
	): Promise<Response> {
		switch (method) {
			case "GET": {
				const workspace = await this.db.getWorkspace(
					workspaceId,
					userId,
				);
				if (!workspace) {
					return new Response(
						JSON.stringify({ error: "Workspace not found" }),
						{
							status: 404,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				return new Response(JSON.stringify(workspace), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			case "PATCH":
			case "PUT": {
				const updateData = await request.json();
				const existingWorkspace = await this.db.getWorkspace(
					workspaceId,
					userId,
				);

				if (!existingWorkspace) {
					return new Response(
						JSON.stringify({ error: "Workspace not found" }),
						{
							status: 404,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const updatedWorkspace: WorkspaceData = {
					...existingWorkspace,
					...(updateData.name && { name: updateData.name }),
					...(updateData.content && { content: updateData.content }),
					updatedAT: new Date().toISOString(),
					_lastModified: Date.now(),
					_synced: false,
				};

				await this.db.saveWorkspace(updatedWorkspace);

				// Queue for sync
				await this.syncManager.queueOperation({
					id: `workspace-${method.toLowerCase()}-${workspaceId}-${Date.now()}`,
					method,
					url: `/api/workspaces/${workspaceId}`,
					body: updateData,
					timestamp: Date.now(),
					retryCount: 0,
				});

				return new Response(JSON.stringify(updatedWorkspace), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			case "DELETE": {
				await this.db.deleteWorkspace(workspaceId);

				// Queue for sync
				await this.syncManager.queueOperation({
					id: `workspace-delete-${workspaceId}-${Date.now()}`,
					method: "DELETE",
					url: `/api/workspaces/${workspaceId}`,
					timestamp: Date.now(),
					retryCount: 0,
				});

				return new Response(null, { status: 204 });
			}

			default:
				return new Response(null, { status: 405 });
		}
	}

	/**
	 * Handle /api/templates requests
	 */
	private async handleTemplatesRequest(
		method: string,
		request: Request,
		userId: string,
	): Promise<Response> {
		switch (method) {
			case "GET": {
				const templates = await this.db.getTemplates(userId);

				// Convert to API format
				const apiTemplates = templates.map((template) => ({
					id: template.id.toString(),
					name: template.name,
					type: template.type,
					...(template.type === "widget"
						? { widget: template.content }
						: {}),
					...(template.type === "datasource"
						? { datasource: template.content }
						: {}),
					public: template.public,
					tags: template.tags,
					yours: template.yours,
				}));

				return new Response(JSON.stringify(apiTemplates), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			case "POST": {
				const createTemplateData = await request.json();
				const template = createTemplateData.content;

				const newTemplate: TemplateData = {
					id: Date.now(), // Temporary ID
					name: template.name,
					content: template.widget || template.datasource,
					type: template.type,
					public: template.public || false,
					tags: template.tags || [],
					createdAT: new Date().toISOString(),
					updatedAT: new Date().toISOString(),
					createdById: userId,
					yours: true,
					_lastModified: Date.now(),
					_synced: false,
				};

				await this.db.saveTemplate(newTemplate);

				// Queue for sync
				await this.syncManager.queueOperation({
					id: `template-create-${Date.now()}`,
					method: "POST",
					url: "/api/templates",
					body: createTemplateData,
					timestamp: Date.now(),
					retryCount: 0,
				});

				return new Response(JSON.stringify(newTemplate.id.toString()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			default:
				return new Response(null, { status: 405 });
		}
	}

	/**
	 * Handle /api/templates/[id] requests
	 */
	private async handleTemplateByIdRequest(
		method: string,
		request: Request,
		templateId: number,
		userId: string,
	): Promise<Response> {
		switch (method) {
			case "PUT": {
				const updateData = await request.json();
				const existingTemplate = await this.db.getTemplate(
					templateId,
					userId,
				);

				if (!existingTemplate) {
					return new Response(
						JSON.stringify({ error: "Template not found" }),
						{
							status: 404,
							headers: { "Content-Type": "application/json" },
						},
					);
				}

				const updatedTemplate: TemplateData = {
					...existingTemplate,
					name: updateData.name || existingTemplate.name,
					content:
						updateData.widget ||
						updateData.datasource ||
						existingTemplate.content,
					public:
						updateData.public !== undefined
							? updateData.public
							: existingTemplate.public,
					tags: updateData.tags || existingTemplate.tags,
					updatedAT: new Date().toISOString(),
					_lastModified: Date.now(),
					_synced: false,
				};

				await this.db.saveTemplate(updatedTemplate);

				// Queue for sync
				await this.syncManager.queueOperation({
					id: `template-update-${templateId}-${Date.now()}`,
					method: "PUT",
					url: `/api/templates/${templateId}`,
					body: updateData,
					timestamp: Date.now(),
					retryCount: 0,
				});

				return new Response(JSON.stringify(updatedTemplate), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			case "DELETE": {
				await this.db.deleteTemplate(templateId);

				// Queue for sync
				await this.syncManager.queueOperation({
					id: `template-delete-${templateId}-${Date.now()}`,
					method: "DELETE",
					url: `/api/templates/${templateId}`,
					timestamp: Date.now(),
					retryCount: 0,
				});

				return new Response(null, { status: 204 });
			}

			default:
				return new Response(null, { status: 405 });
		}
	}

	/**
	 * Handle /api/users/[id] requests
	 */
	private async handleUsersRequest(
		method: string,
		request: Request,
		userId: string,
	): Promise<Response> {
		switch (method) {
			case "PATCH": {
				const updateUserData = await request.json();
				const existingUser = await this.db.getUser(userId);

				const updatedUser: UserData = {
					id: userId,
					name: updateUserData.name,
					email: existingUser?.email || "",
					image: existingUser?.image,
					_lastModified: Date.now(),
					_synced: false,
				};

				await this.db.saveUser(updatedUser);

				// Queue for sync
				await this.syncManager.queueOperation({
					id: `user-update-${userId}-${Date.now()}`,
					method: "PATCH",
					url: `/api/users/${userId}`,
					body: updateUserData,
					timestamp: Date.now(),
					retryCount: 0,
				});

				return new Response(null, { status: 200 });
			}

			default:
				return new Response(null, { status: 405 });
		}
	}

	/**
	 * Handle authentication requests - always pass through but cache session data
	 */
	private async handleAuthRequest(request: Request): Promise<Response> {
		const pathname = this.normalizePathname(new URL(request.url).pathname);

		console.log("🔐 Handling auth request:", request.method, pathname);

		try {
			// Always pass auth requests through to the server
			const response = await this.tryOnlineRequest(request);

			// If this is a session request and successful, cache the session data
			if (
				pathname === API_ENDPOINTS.AUTH_SESSION &&
				response.ok &&
				request.method === "GET"
			) {
				await this.cacheSessionData(response.clone());
			}

			// If this is a signin request and successful, the session will be fetched next
			// We can also cache session data from successful signin responses if they contain session info
			if (API_ENDPOINTS.AUTH_SIGNIN.test(pathname) && response.ok) {
				console.log(
					"✅ Successful sign-in detected, will cache session on next session request",
				);
				// The session will be cached when /api/auth/session is called next
			}

			// If this is a signout request, clear cached session data
			if (API_ENDPOINTS.AUTH_SIGNOUT.test(pathname) && response.ok) {
				console.log(
					"🔓 Sign-out detected, clearing cached session data",
				);
				await this.db.clearAuth();
			}

			return response;
		} catch (error) {
			console.error("❌ Auth request failed:", error);

			// For session requests, try to return cached session data if available
			if (
				pathname === API_ENDPOINTS.AUTH_SESSION &&
				request.method === "GET"
			) {
				const cachedAuth = await this.db.getAuth();
				if (cachedAuth) {
					const sessionPayload =
						cachedAuth.session ||
						({
							user: cachedAuth.user,
							expires: cachedAuth.expires,
							sessionToken: cachedAuth.sessionToken,
						} as Record<string, unknown>);

					if (sessionPayload) {
						console.log("📱 Returning cached session data");
						return new Response(JSON.stringify(sessionPayload), {
							status: 200,
							headers: { "Content-Type": "application/json" },
						});
					}
				}
			}

			// For other auth requests, just fail
			return new Response(
				JSON.stringify({ error: "Authentication service unavailable" }),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * Cache session data from successful auth responses
	 */
	private async cacheSessionData(response: Response): Promise<void> {
		try {
			const sessionData = await response.json();

			if (sessionData && sessionData.user) {
				console.log(
					"💾 Caching session data for user:",
					sessionData.user.id,
				);

				await this.db.setAuth({
					sessionToken: sessionData.sessionToken,
					userId: sessionData.user.id,
					expires: sessionData.expires,
					user: sessionData.user,
					session: sessionData,
					_lastModified: Date.now(),
				});

				console.log("✅ Session data cached successfully");
			}
		} catch (error) {
			console.error("❌ Failed to cache session data:", error);
		}
	}

	private normalizePathname(pathname: string): string {
		if (pathname.length > 1 && pathname.endsWith("/")) {
			return pathname.replace(/\/+$/, "");
		}
		return pathname;
	}
}

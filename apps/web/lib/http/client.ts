/**
 * HTTP client result types
 */
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: string; details?: unknown };
export type ApiResult<T> = ApiSuccess<T> | ApiError;

/**
 * HTTP request options
 */
export interface RequestOptions extends Omit<RequestInit, "body"> {
	body?: unknown;
}

/**
 * Base HTTP client with error normalization and interceptors
 */
class HttpClient {
	private baseUrl: string;
	private defaultHeaders: HeadersInit;

	constructor(baseUrl = "", defaultHeaders: HeadersInit = {}) {
		this.baseUrl = baseUrl;
		this.defaultHeaders = {
			"Content-Type": "application/json",
			...defaultHeaders,
		};
	}

	/**
	 * Execute HTTP request with error handling
	 */
	private async request<T>(
		url: string,
		options: RequestOptions = {},
	): Promise<ApiResult<T>> {
		try {
			const { body, headers, ...restOptions } = options;

			const response = await fetch(`${this.baseUrl}${url}`, {
				...restOptions,
				headers: {
					...this.defaultHeaders,
					...headers,
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
			});

			if (!response.ok) {
				const errorText =
					response.statusText || `HTTP ${response.status}`;
				return {
					ok: false,
					error: errorText,
					details: { status: response.status },
				};
			}

			// Handle empty responses
			const contentType = response.headers.get("content-type");
			if (!contentType || response.status === 204) {
				return { ok: true, data: undefined as T };
			}

			// Parse JSON response
			const data = await response.json();
			return { ok: true, data };
		} catch (error) {
			return {
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Unknown error occurred",
				details: error,
			};
		}
	}

	/**
	 * GET request
	 */
	async get<T>(url: string, options?: RequestOptions): Promise<ApiResult<T>> {
		return this.request<T>(url, { ...options, method: "GET" });
	}

	/**
	 * POST request
	 */
	async post<T>(
		url: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<ApiResult<T>> {
		return this.request<T>(url, { ...options, method: "POST", body });
	}

	/**
	 * PUT request
	 */
	async put<T>(
		url: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<ApiResult<T>> {
		return this.request<T>(url, { ...options, method: "PUT", body });
	}

	/**
	 * PATCH request
	 */
	async patch<T>(
		url: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<ApiResult<T>> {
		return this.request<T>(url, { ...options, method: "PATCH", body });
	}

	/**
	 * DELETE request
	 */
	async delete<T>(
		url: string,
		options?: RequestOptions,
	): Promise<ApiResult<T>> {
		return this.request<T>(url, { ...options, method: "DELETE" });
	}
}

/**
 * Default HTTP client instance
 */
export const httpClient = new HttpClient();

/**
 * Create a new HTTP client with custom configuration
 */
export function createHttpClient(
	baseUrl?: string,
	defaultHeaders?: HeadersInit,
): HttpClient {
	return new HttpClient(baseUrl, defaultHeaders);
}

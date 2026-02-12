/** Error severity levels for datasource operations. */
export enum ErrorSeverity {
	/** Information only - no action required */
	SILENT = "silent",
	/** Warning - operation succeeded but with issues */
	WARNING = "warning",
	/** Error - operation failed but recoverable */
	ERROR = "error",
	/** Fatal - operation failed and not recoverable */
	FATAL = "fatal",
}

/** Error categories for datasource errors. */
export enum ErrorCategory {
	/** Network/connection related errors */
	CONNECTION = "connection",
	/** Data parsing/serialization errors */
	SERIALIZATION = "serialization",
	/** Type conversion errors */
	CONVERSION = "conversion",
	/** Subscription/topic management errors */
	SUBSCRIPTION = "subscription",
	/** Remote call execution errors */
	REMOTE_CALL = "remote_call",
	/** Worker lifecycle errors */
	WORKER = "worker",
	/** Configuration errors */
	CONFIG = "config",
	/** Generic/unknown errors */
	UNKNOWN = "unknown",
}

/** Standardized datasource error with context. */
export class DatasourceError extends Error {
	readonly severity: ErrorSeverity;
	readonly category: ErrorCategory;
	readonly context?: Record<string, unknown>;
	readonly timestamp: number;
	readonly datasourceId?: string;

	constructor(
		message: string,
		options: {
			severity?: ErrorSeverity;
			category?: ErrorCategory;
			context?: Record<string, unknown>;
			datasourceId?: string;
			cause?: Error;
		} = {},
	) {
		super(message);
		this.name = "DatasourceError";
		this.severity = options.severity ?? ErrorSeverity.ERROR;
		this.category = options.category ?? ErrorCategory.UNKNOWN;
		this.context = options.context;
		this.datasourceId = options.datasourceId;
		this.timestamp = Date.now();

		if (options.cause) {
			this.cause = options.cause;
		}

		// Ensure proper prototype chain for instanceof checks
		Object.setPrototypeOf(this, DatasourceError.prototype);
	}

	/**
	 * Format error for logging with full context.
	 * @returns Log string.
	 */
	toLogString(): string {
		const parts = [`[${this.severity.toUpperCase()}]`];

		if (this.datasourceId) {
			parts.push(`[${this.datasourceId}]`);
		}

		parts.push(`[${this.category}]`);
		parts.push(this.message);

		if (this.context) {
			parts.push(JSON.stringify(this.context));
		}

		if (this.cause) {
			parts.push(
				`Caused by: ${this.cause instanceof Error ? this.cause.message : String(this.cause)}`,
			);
		}

		return parts.join(" ");
	}

	/**
	 * Check if error should be logged based on severity.
	 * @returns True if loggable.
	 */
	shouldLog(): boolean {
		return this.severity !== ErrorSeverity.SILENT;
	}

	/**
	 * Check if error is recoverable.
	 * @returns True if recoverable.
	 */
	isRecoverable(): boolean {
		return (
			this.severity === ErrorSeverity.WARNING ||
			this.severity === ErrorSeverity.ERROR
		);
	}
}

/** Centralized error handler for datasources. */
export class DatasourceErrorHandler {
	private readonly datasourceId: string;
	private readonly errorHistory: DatasourceError[] = [];
	private readonly maxHistorySize: number;

	constructor(datasourceId: string, maxHistorySize = 100) {
		this.datasourceId = datasourceId;
		this.maxHistorySize = maxHistorySize;
	}

	/**
	 * Handle an error with logging and tracking.
	 * @param error - Datasource error.
	 */
	handle(error: DatasourceError): void {
		// Add to history
		this.errorHistory.push(error);
		if (this.errorHistory.length > this.maxHistorySize) {
			this.errorHistory.shift();
		}

		// Log based on severity
		if (!error.shouldLog()) {
			return;
		}

		const logMessage = error.toLogString();

		switch (error.severity) {
			case ErrorSeverity.WARNING:
				console.warn(logMessage);
				break;
			case ErrorSeverity.ERROR:
				console.error(logMessage);
				break;
			case ErrorSeverity.FATAL:
				console.error(logMessage);
				break;
			default:
				console.log(logMessage);
		}
	}

	/**
	 * Create and handle an error from a raw error object.
	 * @param error - Raw error.
	 * @param options - Error options.
	 * @returns Datasource error.
	 */
	handleRaw(
		error: unknown,
		options: {
			severity?: ErrorSeverity;
			category?: ErrorCategory;
			context?: Record<string, unknown>;
			message?: string;
		} = {},
	): DatasourceError {
		const cause = error instanceof Error ? error : undefined;
		const message =
			options.message ??
			(error instanceof Error ? error.message : String(error));

		const datasourceError = new DatasourceError(message, {
			...options,
			datasourceId: this.datasourceId,
			cause,
		});

		this.handle(datasourceError);
		return datasourceError;
	}

	/**
	 * Get recent errors.
	 * @param count - Number of errors.
	 * @returns Error list.
	 */
	getRecentErrors(count = 10): DatasourceError[] {
		return this.errorHistory.slice(-count);
	}

	/**
	 * Get errors by category.
	 * @param category - Error category.
	 * @returns Error list.
	 */
	getErrorsByCategory(category: ErrorCategory): DatasourceError[] {
		return this.errorHistory.filter((e) => e.category === category);
	}

	/**
	 * Get errors by severity.
	 * @param severity - Error severity.
	 * @returns Error list.
	 */
	getErrorsBySeverity(severity: ErrorSeverity): DatasourceError[] {
		return this.errorHistory.filter((e) => e.severity === severity);
	}

	/** Clear error history. */
	clearHistory(): void {
		this.errorHistory.length = 0;
	}

	/**
	 * Get error statistics.
	 * @returns Error stats.
	 */
	getStats(): {
		total: number;
		byCategory: Record<ErrorCategory, number>;
		bySeverity: Record<ErrorSeverity, number>;
	} {
		const stats = {
			total: this.errorHistory.length,
			byCategory: {} as Record<ErrorCategory, number>,
			bySeverity: {} as Record<ErrorSeverity, number>,
		};

		this.errorHistory.forEach((error) => {
			stats.byCategory[error.category] =
				(stats.byCategory[error.category] ?? 0) + 1;
			stats.bySeverity[error.severity] =
				(stats.bySeverity[error.severity] ?? 0) + 1;
		});

		return stats;
	}
}

/**
 * Create a connection error.
 * @param message - Error message.
 * @param datasourceId - Optional datasource id.
 * @param context - Optional context.
 * @returns Datasource error.
 */

export function createConnectionError(
	message: string,
	datasourceId?: string,
	context?: Record<string, unknown>,
): DatasourceError {
	return new DatasourceError(message, {
		severity: ErrorSeverity.ERROR,
		category: ErrorCategory.CONNECTION,
		datasourceId,
		context,
	});
}

/**
 * Create a conversion error.
 * @param message - Error message.
 * @param datasourceId - Optional datasource id.
 * @param context - Optional context.
 * @returns Datasource error.
 */
export function createConversionError(
	message: string,
	datasourceId?: string,
	context?: Record<string, unknown>,
): DatasourceError {
	return new DatasourceError(message, {
		severity: ErrorSeverity.WARNING,
		category: ErrorCategory.CONVERSION,
		datasourceId,
		context,
	});
}

/**
 * Create a serialization error.
 * @param message - Error message.
 * @param datasourceId - Optional datasource id.
 * @param context - Optional context.
 * @returns Datasource error.
 */
export function createSerializationError(
	message: string,
	datasourceId?: string,
	context?: Record<string, unknown>,
): DatasourceError {
	return new DatasourceError(message, {
		severity: ErrorSeverity.ERROR,
		category: ErrorCategory.SERIALIZATION,
		datasourceId,
		context,
	});
}

/**
 * Create a worker error.
 * @param message - Error message.
 * @param datasourceId - Optional datasource id.
 * @param context - Optional context.
 * @param severity - Error severity.
 * @returns Datasource error.
 */
export function createWorkerError(
	message: string,
	datasourceId?: string,
	context?: Record<string, unknown>,
	severity = ErrorSeverity.ERROR,
): DatasourceError {
	return new DatasourceError(message, {
		severity,
		category: ErrorCategory.WORKER,
		datasourceId,
		context,
	});
}

import { JsonSchema, UISchemaElement } from "@jsonforms/core";
import { DatasourceProviderSettings } from "./datasource-interface";

// ============================================================================
// Remote Call Status
// ============================================================================

/**
 * Status of a remote call execution
 */
type RemoteCallStatus =
	| "pending" // Call created, waiting to be sent
	| "executing" // Server is processing the request
	| "succeeded" // Completed successfully
	| "failed" // Completed with error
	| "canceled"; // Was canceled by client

// ============================================================================
// Remote Call Definition
// ============================================================================

/**
 * Unified abstraction for remote procedure calls.
 *
 * This interface abstracts:
 * - ROS2 Services (request/response)
 * - ROS2 Actions (goal/feedback/result)
 * - REST API calls
 * - gRPC calls
 * - WebSocket RPC
 * - Any other request/response pattern
 *
 * The key insight is that an "Action" is just a "Service" with optional
 * feedback streaming and cancel support.
 */
interface RemoteCallDefinition {
	/** Unique name of the remote call (e.g., "/navigate_to_pose", "/add_two_ints") */
	name: string;

	/** ID of the datasource that provides this call */
	datasource_id: string;

	/** Reference to the datasource settings */
	source: DatasourceProviderSettings;

	// === Request Type ===
	/** Webapp internal type for the request */
	requestType: string;
	/** Native type in the datasource (e.g., "std_srvs/srv/SetBool_Request") */
	rawRequestType: string;
	/** JSON Schema for the request - used to generate input forms */
	requestSchema?: JsonSchema;
	/** UI Schema for customizing the request form layout */
	requestUiSchema?: UISchemaElement;

	// === Response Type ===
	/** Webapp internal type for the response */
	responseType: string;
	/** Native type in the datasource (e.g., "std_srvs/srv/SetBool_Response") */
	rawResponseType: string;
	/** JSON Schema for the response - used for display/validation */
	responseSchema?: JsonSchema;

	// === Feedback Type (Optional - makes it "action-like") ===
	/** Webapp internal type for feedback (if present, feedback is available) */
	feedbackType?: string;
	/** Native type for feedback (e.g., "nav2_msgs/action/NavigateToPose_Feedback") */
	rawFeedbackType?: string;
	/** JSON Schema for feedback - used for progress display */
	feedbackSchema?: JsonSchema;

	// === Behavior ===
	/** Whether this call can be canceled mid-execution */
	cancelable?: boolean;

	/** Optional description for UI */
	description?: string;
}

// ============================================================================
// Remote Call Result
// ============================================================================

/**
 * Result of a remote call execution
 */
interface RemoteCallResult<T = unknown> {
	/** Whether the call succeeded */
	success: boolean;
	/** Response data (if successful) */
	data?: T;
	/** Error message (if failed) */
	error?: string;
	/** Execution duration in milliseconds */
	duration: number;
	/** Final status */
	status: RemoteCallStatus;
}

// ============================================================================
// Remote Call Handle
// ============================================================================

/**
 * Handle returned when executing a remote call.
 * Provides methods to track progress, receive feedback, and cancel.
 */
interface RemoteCallHandle<TFeedback = unknown, TResult = unknown> {
	/** Unique identifier for this call instance */
	id: string;

	/** Current status of the call */
	status: RemoteCallStatus;

	/** Promise that resolves when the call completes */
	result: Promise<RemoteCallResult<TResult>>;

	/**
	 * Subscribe to feedback updates (only available if feedbackType is defined)
	 * @returns Unsubscribe function
	 */
	onFeedback?: (callback: (feedback: TFeedback) => void) => () => void;

	/**
	 * Subscribe to status changes
	 * @returns Unsubscribe function
	 */
	onStatusChange: (
		callback: (status: RemoteCallStatus) => void,
	) => () => void;

	/**
	 * Cancel the call (only available if cancelable is true)
	 * @returns Promise that resolves to true if cancellation was successful
	 */
	cancel?: () => Promise<boolean>;
}

// ============================================================================
// Remote Call Options
// ============================================================================

/**
 * Options for executing a remote call
 */
interface RemoteCallOptions {
	/** Timeout in milliseconds (0 = no timeout) */
	timeout?: number;
	/** Whether to throw on error instead of returning error result */
	throwOnError?: boolean;
}

// ============================================================================
// Remote Call Filter
// ============================================================================

interface RemoteCallFilterProps {
	/** Filter by call name (regex) */
	name?: RegExp;
	/** Filter by request type (regex) */
	requestType?: RegExp;
	/** Filter by raw request type (regex) */
	rawRequestType?: RegExp;
	/** Filter by response type (regex) */
	responseType?: RegExp;
	/** Filter by datasource ID (regex) */
	datasource_id?: RegExp;
	/** Only include calls with feedback support */
	hasFeedback?: boolean;
	/** Only include cancelable calls */
	cancelable?: boolean;
	/** If true, ALL conditions must match; if false, ANY match passes */
	strict?: boolean;
}

/**
 * Filter for remote calls - similar to DatasourceTopicFilter
 */
class RemoteCallFilter {
	name?: RegExp;
	requestType?: RegExp;
	rawRequestType?: RegExp;
	responseType?: RegExp;
	datasource_id?: RegExp;
	hasFeedback?: boolean;
	cancelable?: boolean;
	strict: boolean;

	constructor(props: RemoteCallFilterProps) {
		this.name = props.name;
		this.requestType = props.requestType;
		this.rawRequestType = props.rawRequestType;
		this.responseType = props.responseType;
		this.datasource_id = props.datasource_id;
		this.hasFeedback = props.hasFeedback;
		this.cancelable = props.cancelable;
		this.strict = props.strict ?? false;
	}

	/**
	 * Check if a remote call definition matches this filter
	 */
	filter(call: RemoteCallDefinition): boolean {
		const failures: boolean[] = [];

		if (this.name && !this.name.test(call.name)) {
			failures.push(true);
		}

		if (this.requestType && !this.requestType.test(call.requestType)) {
			failures.push(true);
		}

		if (
			this.rawRequestType &&
			!this.rawRequestType.test(call.rawRequestType)
		) {
			failures.push(true);
		}

		if (this.responseType && !this.responseType.test(call.responseType)) {
			failures.push(true);
		}

		if (
			this.datasource_id &&
			!this.datasource_id.test(call.datasource_id)
		) {
			failures.push(true);
		}

		if (this.hasFeedback !== undefined) {
			const hasFeedback = call.feedbackType !== undefined;
			if (this.hasFeedback !== hasFeedback) {
				failures.push(true);
			}
		}

		if (this.cancelable !== undefined) {
			if (this.cancelable !== call.cancelable) {
				failures.push(true);
			}
		}

		// In strict mode, any failure means no match
		if (this.strict && failures.length > 0) {
			return false;
		}

		// In non-strict mode, pass if no filters were set OR all filters passed
		return true;
	}
}

// ============================================================================
// Selected Remote Call (for widget configuration)
// ============================================================================

/**
 * A remote call that has been selected/configured for use in a widget
 */
interface SelectedRemoteCall extends RemoteCallDefinition {
	/** Custom label for this call in the widget */
	label?: string;
}

// ============================================================================
// Exports
// ============================================================================

export { RemoteCallFilter };
export type {
	RemoteCallStatus,
	RemoteCallDefinition,
	RemoteCallResult,
	RemoteCallHandle,
	RemoteCallOptions,
	RemoteCallFilterProps,
	SelectedRemoteCall,
};

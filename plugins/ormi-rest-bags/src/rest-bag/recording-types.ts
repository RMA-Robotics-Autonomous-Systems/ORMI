/**
 * Topic information for recording.
 */
export interface Topic {
	name: string;
	type: string;
}

/**
 * Request to start recording.
 */
export interface RecordingRequest {
	topics: Topic[];
	name: string;
}

/**
 * Request to stop recording.
 */
export interface StopRecordingRequest {
	recording_id: string;
}

/**
 * Recording status information.
 */
export interface RecordingStatus {
	recording_id: string;
	name: string;
	topics: Topic[];
	status: string;
	recording_time: number;
	message_counts: Record<string, number>;
}

/**
 * Response from recording start request.
 */
export interface RecordingResponse {
	recording_id: string;
}

/**
 * Response from recording stop request.
 */
export interface StopRecordingResponse {
	message: string;
}

/**
 * Recording error response.
 */
export interface RecordingError {
	error: string;
}

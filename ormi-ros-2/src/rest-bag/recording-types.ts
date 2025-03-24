export interface Topic {
  name: string;
  type: string;
  // Add additional properties if available in the Python implementation
}

export interface RecordingRequest {
  topics: Topic[];
  name: string;
}

export interface StopRecordingRequest {
  recording_id: string;
}

export interface RecordingStatus {
  recording_id: string;
  name: string;
  topics: Topic[];
  status: string;
  recording_time: number;  // recording time in seconds
  message_counts: Record<string, number>;  // number of messages saved by topic
}

export interface RecordingResponse {
  recording_id: string;
}

export interface StopRecordingResponse {
  message: string;
}

export interface RecordingError {
    error: string;
}

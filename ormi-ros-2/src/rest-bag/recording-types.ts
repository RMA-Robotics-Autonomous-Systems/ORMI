export interface Topic {
  name: string;
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
}

export interface RecordingResponse {
  recording_id: string;
}

export interface StopRecordingResponse {
  message: string;
}

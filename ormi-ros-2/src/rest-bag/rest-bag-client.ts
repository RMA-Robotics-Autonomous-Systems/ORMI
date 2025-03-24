import { BagsResponse, BagInfo } from './bags';
import { 
    RecordingError,
    RecordingRequest, 
    RecordingResponse, 
    RecordingStatus, 
    StopRecordingRequest, 
    StopRecordingResponse 
} from './recording-types';
import {
    PlayerPlayRequest,
    PlayerPlayResponse,
    PlayerStatusResponse,
    PlayerActionResponse,
    PlayerListResponse
} from './player-types';

export class RestBagClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }

    /**
     * Get all bags from all storage paths
     */
    async getBags(): Promise<BagsResponse> {
        const response = await fetch(`${this.baseUrl}/bags`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch bags: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Get information about a specific bag by name
     */
    async getBag(name: string): Promise<BagInfo[]> {
        const response = await fetch(`${this.baseUrl}/bags/${encodeURIComponent(name)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch bag "${name}": ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Delete a bag by name
     */
    async deleteBag(name: string, multiple: boolean = false): Promise<{ message: string }> {
        const response = await fetch(`${this.baseUrl}/bags/${encodeURIComponent(name)}?multiple=${multiple}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete bag "${name}": ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Get the download URL for a bag
     */
    getBagDownloadUrl(name: string, multiple: boolean = false): string {
        return `${this.baseUrl}/bags/${encodeURIComponent(name)}/download?multiple=${multiple}`;
    }
    
    /**
     * Download a bag as a blob
     */
    async downloadBag(name: string, multiple: boolean = false): Promise<Blob> {
        const url = this.getBagDownloadUrl(name, multiple);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to download bag "${name}": ${response.statusText}`);
        }
        
        return await response.blob();
    }

    /**
     * Start a new recording
     */
    async startRecording(request: RecordingRequest): Promise<RecordingResponse | RecordingError> {
        const response = await fetch(`${this.baseUrl}/recordings/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });
        
        if (!response.ok) {
            throw new Error(`Failed to start recording: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Stop an active recording
     */
    async stopRecording(recordingId: string): Promise<StopRecordingResponse> {
        const request: StopRecordingRequest = { recording_id: recordingId };
        
        const response = await fetch(`${this.baseUrl}/recordings/stop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });
        
        if (!response.ok) {
            throw new Error(`Failed to stop recording: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Get all active recordings
     */
    async getRecordings(): Promise<RecordingStatus[]> {
        const response = await fetch(`${this.baseUrl}/recordings`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch recordings: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Get a specific recording by ID
     */
    async getRecording(recordingId: string): Promise<RecordingStatus | RecordingError> {
        const response = await fetch(`${this.baseUrl}/recordings/${encodeURIComponent(recordingId)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch recording: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Start playback of a bag file
     */
    async startPlayback(request: PlayerPlayRequest): Promise<PlayerPlayResponse> {
        const response = await fetch(`${this.baseUrl}/player/play`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });
        
        if (!response.ok) {
            throw new Error(`Failed to start playback: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Pause playback
     */
    async pausePlayback(playId: string): Promise<PlayerActionResponse> {
        const response = await fetch(`${this.baseUrl}/player/${encodeURIComponent(playId)}/pause`, {
            method: 'POST',
        });
        
        if (!response.ok) {
            throw new Error(`Failed to pause playback: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Resume playback
     */
    async resumePlayback(playId: string): Promise<PlayerActionResponse> {
        const response = await fetch(`${this.baseUrl}/player/${encodeURIComponent(playId)}/resume`, {
            method: 'POST',
        });
        
        if (!response.ok) {
            throw new Error(`Failed to resume playback: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Stop playback
     */
    async stopPlayback(playId: string): Promise<PlayerActionResponse> {
        const response = await fetch(`${this.baseUrl}/player/${encodeURIComponent(playId)}/stop`, {
            method: 'POST',
        });
        
        if (!response.ok) {
            throw new Error(`Failed to stop playback: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * Get player status
     */
    async getPlayerStatus(playId: string): Promise<PlayerStatusResponse> {
        const response = await fetch(`${this.baseUrl}/player/${encodeURIComponent(playId)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to get player status: ${response.statusText}`);
        }
        
        return await response.json();
    }

    /**
     * List all players
     */
    async listPlayers(): Promise<PlayerListResponse> {
        const response = await fetch(`${this.baseUrl}/player`);
        
        if (!response.ok) {
            throw new Error(`Failed to list players: ${response.statusText}`);
        }
        
        return await response.json();
    }
}

import { BagsResponse, BagInfo, CompressionTask, CompressionProgress, CompressionStatus, DownloadInfo, CompressionTasksList } from './bags';
import { 
    RecordingError,
    RecordingRequest, 
    RecordingResponse, 
    RecordingStatus, 
    StopRecordingRequest, 
    StopRecordingResponse, 
    Topic
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
        
        return await response.json() as any;
    }
    
    /**
     * Get information about a specific bag by name
     */
    async getBag(name: string): Promise<BagInfo[]> {
        const response = await fetch(`${this.baseUrl}/bags/${encodeURIComponent(name)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch bag "${name}": ${response.statusText}`);
        }
        
        return await response.json() as any;
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
        
        return await response.json() as any;
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
     * Start compression of a bag
     */
    async startCompression(name: string, multiple: boolean = false): Promise<CompressionTask> {
        const response = await fetch(`${this.baseUrl}/bags/${encodeURIComponent(name)}/compress?multiple=${multiple}`, {
            method: 'POST',
        });
        
        if (!response.ok) {
            throw new Error(`Failed to start compression for bag "${name}": ${response.statusText}`);
        }
        
        return await response.json() as CompressionTask;
    }

    /**
     * Get compression progress as Server-Sent Events stream
     */
    createCompressionProgressStream(taskId: string): EventSource {
        const url = `${this.baseUrl}/bags/compress/${encodeURIComponent(taskId)}/progress`;
        return new EventSource(url);
    }

    /**
     * Get compression status (simple JSON response, no streaming)
     */
    async getCompressionStatus(taskId: string): Promise<CompressionStatus> {
        const response = await fetch(`${this.baseUrl}/bags/compress/${encodeURIComponent(taskId)}/status`);
        
        if (!response.ok) {
            throw new Error(`Failed to get compression status for task "${taskId}": ${response.statusText}`);
        }
        
        return await response.json() as CompressionStatus;
    }

    /**
     * List all active compression tasks
     */
    async listCompressionTasks(): Promise<CompressionTasksList> {
        const response = await fetch(`${this.baseUrl}/bags/compress/tasks`);
        
        if (!response.ok) {
            throw new Error(`Failed to list compression tasks: ${response.statusText}`);
        }
        
        return await response.json() as CompressionTasksList;
    }

    /**
     * Get download info for a download ID
     */
    async getDownloadInfo(downloadId: string): Promise<DownloadInfo> {
        const response = await fetch(`${this.baseUrl}/bags/download/${encodeURIComponent(downloadId)}/info`);
        
        if (!response.ok) {
            throw new Error(`Failed to get download info for "${downloadId}": ${response.statusText}`);
        }
        
        return await response.json() as DownloadInfo;
    }

    /**
     * Get the download URL for a compressed bag using download ID
     */
    getCompressedBagDownloadUrl(downloadId: string): string {
        return `${this.baseUrl}/bags/download/${encodeURIComponent(downloadId)}`;
    }

    /**
     * Download a compressed bag using download ID with browser-native download
     */
    async downloadCompressedBag(downloadId: string): Promise<void> {
        const url = this.getCompressedBagDownloadUrl(downloadId);
        
        // Get download info to get the filename
        const downloadInfo = await this.getDownloadInfo(downloadId);
        
        // Simple direct download - let browser handle it natively
        this.triggerDirectDownload(url, downloadInfo.filename);
    }

    /**
     * Trigger a direct download using browser's native download mechanism
     */
    private triggerDirectDownload(url: string, filename: string): void {
        // Create a temporary link element
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        // Add to DOM, click, and remove
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Legacy method for backward compatibility - downloads as blob
     */
    async downloadCompressedBagAsBlob(downloadId: string, onProgress?: (loaded: number, total: number) => void): Promise<Blob> {
        const url = this.getCompressedBagDownloadUrl(downloadId);
        
        if (!onProgress) {
            // Simple download without progress tracking
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to download compressed bag "${downloadId}": ${response.statusText}`);
            }
            
            return await response.blob();
        }

        // Download with progress tracking
        const response = await fetch(url, {
            headers: {
                'Cache-Control': 'no-cache',
                'Accept': 'application/zip, application/octet-stream, */*'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to download compressed bag "${downloadId}": ${response.statusText}`);
        }

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        
        if (!response.body) {
            throw new Error('Response body is not available');
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                chunks.push(value);
                loaded += value.length;
                
                if (onProgress) {
                    // Call progress callback more frequently for better UX
                    onProgress(loaded, total || loaded);
                }
                
                // Add a small delay to prevent blocking the UI thread
                if (loaded % (1024 * 1024) === 0) { // Every MB
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        } finally {
            reader.releaseLock();
        }

        const contentType = response.headers.get('content-type') || 'application/zip';
        const blob = new Blob(chunks, { type: contentType });
        return blob;
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
        
        return await response.json() as any;
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
        
        return await response.json() as any;
    }

    /**
     * Get all active recordings
     */
    async getRecordings(): Promise<RecordingStatus[]> {
        const response = await fetch(`${this.baseUrl}/recordings`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch recordings: ${response.statusText}`);
        }
        
        return await response.json() as any;
    }

    /**
     * Get a specific recording by ID
     */
    async getRecording(recordingId: string): Promise<RecordingStatus | RecordingError> {
        const response = await fetch(`${this.baseUrl}/recordings/${encodeURIComponent(recordingId)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch recording: ${response.statusText}`);
        }
        
        return await response.json() as any;
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
        
        return await response.json() as any;
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
        
        return await response.json() as any;
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
        
        return await response.json() as any;
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
        
        return await response.json() as any;
    }

    /**
     * Get player status
     */
    async getPlayerStatus(playId: string): Promise<PlayerStatusResponse> {
        const response = await fetch(`${this.baseUrl}/player/${encodeURIComponent(playId)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to get player status: ${response.statusText}`);
        }
        
        return await response.json() as any;
    }

    /**
     * List all players
     */
    async listPlayers(): Promise<PlayerListResponse> {
        const response = await fetch(`${this.baseUrl}/player`);
        
        if (!response.ok) {
            throw new Error(`Failed to list players: ${response.statusText}`);
        }
        
        return await response.json() as any;
    }

    /**
     * Get the list of topics available for recording
     *  dictionary with topic names as keys and types as values in an array
     */
    async getAvailableTopics(): Promise<Topic[]> {
        const response = await fetch(`${this.baseUrl}/topics`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch available topics: ${response.statusText}`);
        }

        // convert it to an array of Topic
        // Assuming the response is an object with topic names as keys and arrays of types as values
        // e.g. { "topic1": ["type1", "type2"], "topic2": ["type3"] }
        // we take the first type for each topic
        const topics = await response.json() as { [topicName: string]: string[] };
        const availableTopics: Topic[] = [];
        for (const [topicName, types] of Object.entries(topics)) {
            if (types.length > 0) {
                availableTopics.push({
                    name: topicName,
                    type: types[0]!
                }); // take the first type for each
            }
        }

        return availableTopics;
    }

}

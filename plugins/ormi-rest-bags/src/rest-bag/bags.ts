export interface Timestamp {
    nanoseconds_since_epoch: number
}

export interface Duration {
    nanoseconds: number
}

export interface TopicMetadata {
    name: string
    type: string
    serialization_format: string
    offered_qos_profiles: any[]
    type_description_hash: string
}

export interface TopicWithMessageCount {
    topic_metadata: TopicMetadata
    message_count: number
}

export interface FileInfo {
    path: string
    starting_time: Timestamp
    duration: Duration
    message_count: number
}

export interface BagMeta {
    version: number
    storage_identifier: string
    duration: Duration
    starting_time: Timestamp
    message_count: number
    topics_with_message_count: TopicWithMessageCount[]
    compression_format: string
    compression_mode: string
    relative_file_paths: string[]
    files: FileInfo[]
    custom_data?: any
    ros_distro: string
}

export interface BagInfo {
    name: string
    meta: BagMeta
    path: string
}

export interface BagsResponse {
    [path: string]: {
        [bagName: string]: BagInfo
    }
}

// Compression and download types
export interface CompressionTask {
    task_id: string
    message: string
}

export interface CompressionProgress {
    status: 'starting' | 'compressing' | 'completed' | 'failed' | 'connected' | 'error'
    progress: number
    total_files: number
    processed_files: number
    total_size: number
    processed_size: number
    total_size_mb: number
    processed_size_mb: number
    timestamp: string
    download_id?: string
    error?: string
    message?: string
}

export interface CompressionStatus {
    task_id: string
    status: 'starting' | 'compressing' | 'completed' | 'failed'
    progress: number
    total_files: number
    processed_files: number
    total_size: number
    processed_size: number
    total_size_mb: number
    processed_size_mb: number
    created_at: string
    bag_name: string
    download_id?: string
    error?: string
    timestamp: string
}

export interface DownloadInfo {
    download_id: string
    filename: string
    file_size: number
    file_size_mb: number
    created_at: string
    bag_name: string
    supports_range: boolean
    original_size: number
    original_size_mb: number
    compression_ratio: number
}

export interface CompressionTasksList {
    tasks: { [task_id: string]: {
        status: string
        progress: number
        bag_name: string
        created_at: string
        download_id?: string
        total_size_mb: number
        processed_size_mb: number
    }}
    count: number
}
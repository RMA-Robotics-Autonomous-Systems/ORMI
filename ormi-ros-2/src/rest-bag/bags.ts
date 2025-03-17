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
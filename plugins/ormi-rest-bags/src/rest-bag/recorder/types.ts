import ROSLIB from "roslib";
import { RestBagClient } from "../rest-bag-client";
import { Topic } from "../recording-types";

export interface RecorderCreatorProps {
    client: RestBagClient;
    refresher: () => void;
}

// Define field types for better type safety
export type FieldType = 'topic' | 'type';
export type FieldKeyMapping = {
    topic: 'name';
    type: 'type';
};

export interface TopicSelectorProps {
    topic: Topic;
    index: number;
    availableTopics: Topic[];
    availableTypes: string[];
    topicMap: Record<string, string>;
    onTopicChange: (index: number, field: keyof Topic, value: string) => void;
    onRemoveTopic: (index: number) => void;
}

export interface TopicsListProps {
    topics: Topic[];
    availableTopics: Topic[];
    availableTypes: string[];
    topicMap: Record<string, string>;
    onTopicChange: (index: number, field: keyof Topic, value: string) => void;
    onRemoveTopic: (index: number) => void;
    onAddTopic: () => void;
}

export interface MetadataUploaderProps {
    onMetadataUploaded: (topics: Topic[], suggestedName?: string) => void;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
}

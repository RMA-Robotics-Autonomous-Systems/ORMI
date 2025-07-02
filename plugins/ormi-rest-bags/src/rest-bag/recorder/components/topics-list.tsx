import { PlusIcon } from "lucide-react";
import { TopicSelector } from "./topic-selector";
import { TopicsListProps } from "../types";
import { MetadataUploader } from "./metadata-uploader";
import { Topic } from "../../recording-types";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";

export const TopicsList = ({
    topics,
    availableTopics,
    availableTypes,
    topicMap,
    onTopicChange,
    onRemoveTopic,
    onAddTopic,
    onMetadataUploaded, // Add this prop
    onError, // Add this prop
    onSuccess // Add this prop
}: TopicsListProps & {
    onMetadataUploaded: (topics: Topic[], suggestedName?: string) => void;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
}) => {
    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center p-3">
                <Label className="text-sm font-medium">Topics</Label>
                <div className="flex gap-2">
                    {/* Metadata Uploader */}
                    <MetadataUploader
                        onMetadataUploaded={onMetadataUploaded}
                        onError={onError}
                        onSuccess={onSuccess}
                    />

                    {/* Add Topic Button */}
                    <Button
                        size="sm"
                        onClick={onAddTopic}
                        type="button"
                        variant="outline"
                        className="h-8 px-2"
                    >
                        <PlusIcon className="h-4 w-4 mr-1" /> Add Topic
                    </Button>
                </div>
            </div>

            <div className="space-y-3 flex gap-3 flex-col">
                {topics.length === 0 ? (
                    <div className="text-center py-3 border border-dashed rounded-md">
                        <p className="text-sm text-gray-500">No topics added.</p>
                    </div>
                ) : (
                    topics.map((topic, index) => (
                        <TopicSelector
                            key={index}
                            topic={topic}
                            index={index}
                            availableTopics={availableTopics}
                            availableTypes={availableTypes}
                            topicMap={topicMap}
                            onTopicChange={onTopicChange}
                            onRemoveTopic={onRemoveTopic}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

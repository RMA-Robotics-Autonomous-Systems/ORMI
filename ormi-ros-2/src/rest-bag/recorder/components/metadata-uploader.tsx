import { useRef } from "react";
import { Button } from "ormi-components";
import { UploadIcon } from "lucide-react";
import yaml from "js-yaml";
import { MetadataUploaderProps } from "../types";
import { Topic } from "../../recording-types";

export const MetadataUploader = ({
    onMetadataUploaded,
    onError,
    onSuccess
}: MetadataUploaderProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleMetadataUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const yamlData = yaml.load(content) as any;

                let metadataTopics: Topic[] = [];
                let suggestedName: string | undefined;

                // Check for ROS2 bag format (rosbag2_bagfile_information)
                if (yamlData.rosbag2_bagfile_information &&
                    yamlData.rosbag2_bagfile_information.topics_with_message_count) {
                    // Extract topics from ROS2 bag metadata format
                    const topicsWithMessageCount = yamlData.rosbag2_bagfile_information.topics_with_message_count;

                    metadataTopics = topicsWithMessageCount.map((topicInfo: any) => ({
                        name: topicInfo.topic_metadata.name,
                        type: topicInfo.topic_metadata.type
                    }));

                    if (metadataTopics.length === 0) {
                        onError("No topics found in the metadata file.");
                        return;
                    }

                    // Auto fill the recording name based on the bag file
                    if (yamlData.rosbag2_bagfile_information.relative_file_paths?.length > 0) {
                        const bagPath = yamlData.rosbag2_bagfile_information.relative_file_paths[0];
                        // Extract filename without extension
                        suggestedName = bagPath.split('/').pop()?.split('.')[0] || '';
                    }
                } else if (yamlData.topics) {
                    // Fallback to original BagMeta format
                    metadataTopics = yamlData.topics.map((topic: any) => ({
                        name: topic.name,
                        type: topic.type
                    }));

                    if (metadataTopics.length === 0) {
                        onError("No topics found in the metadata file.");
                        return;
                    }
                } else {
                    onError("Unsupported metadata format. Could not find topics information.");
                    return;
                }

                onMetadataUploaded(metadataTopics, suggestedName);
                onSuccess(`Successfully loaded ${metadataTopics.length} topics from metadata.yaml`);

                // Clear the file input
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            } catch (error) {
                console.error("Failed to parse metadata.yaml:", error);
                onError("Failed to parse metadata.yaml file. Please check the format.");
            }
        };

        reader.onerror = () => {
            onError("Failed to read the file.");
        };

        reader.readAsText(file);
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleMetadataUpload}
                accept=".yaml,.yml"
                className="hidden"
            />
            <Button
                size="sm"
                onClick={triggerFileInput}
                type="button"
                variant="outline"
                className="h-8 px-2"
            >
                <UploadIcon className="h-4 w-4 mr-1" /> Load Metadata
            </Button>
        </>
    );
};

import { SelectedTopic } from "@workspace/ormi-core/datasources";

export interface PointsCloudProps {
    title: string;
    topic: SelectedTopic;
    maxPoints?: number;
}
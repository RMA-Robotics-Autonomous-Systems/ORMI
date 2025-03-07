import { SelectedTopic } from "ormi-core/datasources";
export default function TopicMarker(props: {
    topic: SelectedTopic;
    name: string;
    scale?: number;
}): false | import("react/jsx-runtime").JSX.Element;

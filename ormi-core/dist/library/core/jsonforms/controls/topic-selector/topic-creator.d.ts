import { Datasource } from "../../../../../library/core/datasources/datasource-interface";
export default function TopicCreator(props: {
    value: string;
    handleTopic: (source: Datasource, topic: string, type: string) => void;
}): import("react/jsx-runtime").JSX.Element;

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { useLocalDataSource, SelectedTopic, DatasourceTopic, LocalDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { FileIcon } from "lucide-react";

function JsonViewer() {
    const { sources } = useLocalDataSource();

    return (
        <div style={{ height: "100%", overflow: "auto", display: "grid" }}>
            <pre className="shadow-inner-md rounded-md m-3 p-1" style={{ boxShadow: "5px 5px 16px 0px rgba(0,0,0,0.1) inset", backgroundColor: "darkslategrey", color: "white" }} >
                {JSON.stringify(Array.from(sources.values()), null, 2)}
            </pre>
        </div>
    );
}

export function JsonViewerDefinition(): WidgetDefinition {

    const pluginsManager = usePluginsManager();

    interface JsonViewerProps {
        title: string;
        topic: SelectedTopic;
    }

    return {
        id: 'json-viewer-widget',
        name: 'Json viewer',
        description: 'Display a json viewer',
        titleProp: 'title',
        icon: <FileIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                }
            },
            required: ['title', 'topic']
        },

        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title"
                } as ControlElement,
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                } as TopicSelectElement

            ],
        } as VerticalLayout,

        data: {
            title: 'Json viewer'
        },
        Component: (data: JsonViewerProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1} >
                <JsonViewer />
            </LocalDataSourcesProvider >
        )

    } as WidgetDefinition;
}
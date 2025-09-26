import { ConciergeBellIcon } from "lucide-react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { DatasourceTopic, DatasourceTopicFilter, PublisherDataSourcesProvider, SelectedTopic, usePublisherDataSource } from "@workspace/ormi-core/datasources";
import { DigitalComponent, DigitalInput } from "@workspace/ui/combined/triggers";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { toast } from "sonner";
import { KeyControlType } from "@workspace/ormi-jsonforms";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";

interface BtnControlData {
    title: string;
    keyInput: DigitalInput;
    topic: SelectedTopic;
    value: number;
}

export function BtnControl(props: BtnControlData) {

    const { publishers } = usePublisherDataSource();


    const handletoggle = () => {
        const publisher = publishers.get(props.topic.topic);
        if (!publisher) {
            toast("Error: Publisher not found for topic " + props.topic.topic);
            return;
        }

        if (props.topic.type === "boolean") {
            publisher.publish(Boolean(props.value), "boolean");
        } else {
            publisher.publish(props.value, props.topic.type || "number");
        }
    }

    return (
        <div className="flex flex-col justify-center items-center p-4 h-full gap-3">
            <DigitalComponent digitalInput={props.keyInput} onActive={handletoggle} onInactive={() => { }} />
        </div>
    );
}

export function BtnControlDefinition() {
    const pluginsManager = usePluginsManager();

    return {
        id: 'btn-cmd-vel-widget',
        name: 'Btn control',
        description: 'Allow user to toggle a topic',
        titleProp: 'title',
        icon: <ConciergeBellIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                keyInput: {
                    type: 'object',
                    title: 'Btn Key',
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                value: {
                    type: 'number',
                    title: 'Value On',
                    default: '1'
                },
            },
            required: ['title', 'topic', 'keyInput', 'value']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                {
                    type: "Control",
                    scope: "#/properties/title",
                } as ControlElement,
                {
                    type: "Key",
                    scope: "#/properties/keyInput",
                } as KeyControlType,
                {
                    type: "TopicSelect",
                    scope: "#/properties/topic",
                    options: {
                        dataRequirements: {
                            accepts: ['number', 'boolean'] // Accept primitive types for button control
                        }
                    }
                } as TopicSelectElement,
                {
                    type: "Control",
                    scope: "#/properties/value",
                } as ControlElement,
            ],
        } as VerticalLayout,
        data: {
            title: 'Btn Control',

        },
        Component: (data: BtnControlData) => (
            data.topic ? (
                <PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
                    <BtnControl {...data} />
                </PublisherDataSourcesProvider>
            ) : (
                <div className="flex justify-center items-center h-full text-muted-foreground">
                    Please select a topic in the widget configuration.
                </div>
            )
        )
    }
}
import { ControlElement, VerticalLayout } from "@jsonforms/core"
import { VideotapeIcon, PlusIcon, TrashIcon } from "lucide-react"
import { Datasource } from "ormi-core/datasources"
import { PluginsHooks, usePluginsManager } from "ormi-core/plugins"
import { WidgetDefinition } from "ormi-core/widgets"
import { useEffect, useState } from "react"
// Add shadcn component imports
import { Badge, Alert, AlertDescription, Button, Card, CardContent, Input, useButtonHolder, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Label } from "ormi-core/components"
import { RestBagClient } from "../rest-bag-client"
import ROSLIB from "roslib"
import dynamic from "next/dynamic"

// Interfaces for bag data
interface BagListProps {
    api_datasource_id: string;
    ros_datasource_id: string;
    title: string;
}

interface Topic {
    name: string;
    type: string;
}

interface RecordFormData {
    bag_name: string;
    topics: Topic[];
}

const Bagsrecorders = (props: BagListProps) => {
    const pluginsManager = usePluginsManager();
    const [formData, setFormData] = useState<RecordFormData>({
        bag_name: "",
        topics: [{ name: "", type: "" }]
    });

    const [recording, setRecording] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [roslib, setRoslib] = useState<ROSLIB.Ros | null>(null);
    const [client, setClient] = useState<RestBagClient | null>(null);
    const [availableTopics, setAvailableTopics] = useState<{ topic: string, type: string }[]>([]);

    useEffect(() => {
        const new_client = pluginsManager.applyFilter<RestBagClient>(`${props.api_datasource_id}-client`, null);
        setClient(new_client);

        const new_ros = pluginsManager.applyFilter<ROSLIB.Ros>(`${props.ros_datasource_id}-ros-2-connection`, null)
        setRoslib(new_ros);

        return () => {
            // Cleanup if needed
        }
    }, [props, pluginsManager]);

    useEffect(() => {
        if (!roslib) {
            return;
        }

        roslib.getTopics((result: { topics: string[]; types: string[]; }) => {
            const newTopics = result.topics.map((topic, i) => ({ topic, type: result.types[i] }));
            setAvailableTopics(newTopics);
        });
    }, [roslib]);

    const handleBagNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            bag_name: e.target.value
        });
    };

    const handleTopicChange = (index: number, field: keyof Topic, value: string) => {
        const updatedTopics = [...formData.topics];
        updatedTopics[index] = {
            ...updatedTopics[index],
            [field]: value
        };

        // If the name field was changed, try to auto-fill the type
        if (field === 'name') {
            const matchingTopic = availableTopics.find(t => t.topic === value);
            if (matchingTopic) {
                updatedTopics[index].type = matchingTopic.type;
            }
        }

        setFormData({
            ...formData,
            topics: updatedTopics
        });
    };

    const addTopic = () => {
        setFormData({
            ...formData,
            topics: [...formData.topics, { name: "", type: "" }]
        });
    };

    const removeTopic = (index: number) => {
        const updatedTopics = [...formData.topics];
        updatedTopics.splice(index, 1);
        setFormData({
            ...formData,
            topics: updatedTopics.length > 0 ? updatedTopics : [{ name: "", type: "" }]
        });
    };

    const startRecording = async () => {
        if (!client) {
            setError("Client not initialized");
            return;
        }

        if (!formData.bag_name) {
            setError("Bag name is required");
            return;
        }

        if (!formData.topics.length || formData.topics.some(t => !t.name || !t.type)) {
            setError("At least one valid topic must be specified");
            return;
        }

        setError(null);
        setSuccess(null);
        setRecording(true);

        try {
            // Implement the actual recording start logic here
            // Example: await client.startRecording(formData.bag_name, formData.topics);
            setSuccess(`Recording started for bag: ${formData.bag_name}`);
        } catch (err) {
            setError(`Failed to start recording: ${err instanceof Error ? err.message : String(err)}`);
            setRecording(false);
        }
    };

    const stopRecording = async () => {
        if (!client) {
            setError("Client not initialized");
            return;
        }

        try {
            // Implement the actual recording stop logic here
            // Example: await client.stopRecording();
            setSuccess(`Recording stopped for bag: ${formData.bag_name}`);
            setRecording(false);
        } catch (err) {
            setError(`Failed to stop recording: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const isFormValid = () => {
        return formData.bag_name &&
            formData.topics.length > 0 &&
            formData.topics.every(t => t.name && t.type);
    };

    // Function to filter available topics based on input
    const filterTopics = (input: string) => {
        if (!input) return availableTopics;
        return availableTopics.filter(t =>
            t.topic.toLowerCase().includes(input.toLowerCase())
        );
    };

    return (
        <div className="flex flex-col gap-3 p-2" style={{ height: '100%', overflow: 'auto' }}>
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {success && (
                <Alert>
                    <AlertDescription>{success}</AlertDescription>
                </Alert>
            )}

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="bag-name">Bag Name</Label>
                    <Input
                        id="bag-name"
                        value={formData.bag_name}
                        onChange={handleBagNameChange}
                        placeholder="Enter bag name"
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <Label>Topics to Record</Label>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addTopic}
                            className="flex items-center"
                        >
                            <PlusIcon className="h-4 w-4 mr-1" /> Add Topic
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {formData.topics.map((topic, index) => (
                            <Card key={index}>
                                <CardContent className="pt-4 pb-2">
                                    <div className="flex justify-between mb-2">
                                        <Label>Topic {index + 1}</Label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeTopic(index)}
                                            disabled={formData.topics.length === 1}
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="grid gap-3">
                                        <div className="space-y-1">
                                            <Label htmlFor={`topic-name-${index}`}>Topic Name</Label>
                                            <div className="relative">
                                                <Input
                                                    id={`topic-name-${index}`}
                                                    value={topic.name}
                                                    onChange={(e) => handleTopicChange(index, 'name', e.target.value)}
                                                    placeholder="Type or select topic name"
                                                    list={`topic-list-${index}`}
                                                />
                                                <datalist id={`topic-list-${index}`}>
                                                    {availableTopics.map((t, i) => (
                                                        <option key={i} value={t.topic} />
                                                    ))}
                                                </datalist>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label htmlFor={`topic-type-${index}`}>Topic Type</Label>
                                            <div className="relative">
                                                <Input
                                                    id={`topic-type-${index}`}
                                                    value={topic.type}
                                                    onChange={(e) => handleTopicChange(index, 'type', e.target.value)}
                                                    placeholder="Type or select topic type"
                                                    list={`type-list-${index}`}
                                                />
                                                <datalist id={`type-list-${index}`}>
                                                    {Array.from(new Set(availableTopics.map(t => t.type))).map((type, i) => (
                                                        <option key={i} value={type} />
                                                    ))}
                                                </datalist>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
                {!recording ? (
                    <Button
                        onClick={startRecording}
                        disabled={!isFormValid()}
                    >
                        Start Recording
                    </Button>
                ) : (
                    <Button
                        variant="destructive"
                        onClick={stopRecording}
                    >
                        Stop Recording
                    </Button>
                )}
            </div>

            {recording && (
                <Card className="mt-4">
                    <CardContent className="pt-4">
                        <Badge variant="outline" className="bg-red-100">Recording</Badge>
                        <p className="mt-2">Currently recording bag: {formData.bag_name}</p>
                        <p className="text-sm text-muted-foreground">
                            Topics: {formData.topics.map(t => t.name).join(", ")}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

export function BagRecorderDefinition(): WidgetDefinition {

    const pluginsManager = usePluginsManager();

    // dynamicaly load components using "next dynamic" or "loadable" package

    const BagRecorderComponent = dynamic(() => Promise.resolve(Bagsrecorders), {
        ssr: false
    });

    return {
        id: 'ros2-bag-recorder',
        name: 'ROS2 Bags recorders',
        description: 'Allows to record ROS2 bags',
        titleProp: 'title',
        icon: (
            <VideotapeIcon />
        ),
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                api_datasource_id: { type: 'string', title: 'API Datasource ID' },
                ros_datasource_id: { type: 'string', title: 'ROS Datasource ID' }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                { type: "Control", scope: "#/properties/title" } as ControlElement,
                {
                    type: "Control", scope: "#/properties/api_datasource_id", options: {
                        async: true,
                        asyncFunction: async () => {

                            const datasources = Array.from(pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, [])).filter(ds => ds.datasource_id === 'rest-bag-source');

                            const values = Array.from(datasources).map(ds => ({ value: ds.settings.id, label: ds.settings.title }));

                            return values;
                        }
                    }
                } as ControlElement,
                {
                    type: "Control", scope: "#/properties/ros_datasource_id", options: {
                        async: true,
                        asyncFunction: async () => {

                            const datasources = Array.from(pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, [])).filter(ds => ds.datasource_id === 'rosbridge-suite-source');

                            const values = Array.from(datasources).map(ds => ({ value: ds.settings.id, label: ds.settings.title }));

                            return values;
                        }
                    }
                } as ControlElement
            ]
        } as VerticalLayout,
        data: { title: 'ROS2 Bags recorders' },

        Component: (data: BagListProps) => <BagRecorderComponent {...data} />
    }
}
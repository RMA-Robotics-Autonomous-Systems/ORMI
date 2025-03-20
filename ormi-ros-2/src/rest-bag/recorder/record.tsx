import { ControlElement, VerticalLayout } from "@jsonforms/core"
import { VideotapeIcon, PlusIcon, TrashIcon } from "lucide-react"
import { Datasource } from "ormi-core/datasources"
import { PluginsHooks, usePluginsManager } from "ormi-core/plugins"
import { WidgetDefinition } from "ormi-core/widgets"
import { useEffect, useState, useCallback, useMemo, memo } from "react"
import { Badge, Alert, AlertDescription, Button, Card, CardContent, Input, Label } from "ormi-core/components"
import { RestBagClient } from "../rest-bag-client"
import { RecordingRequest, RecordingStatus } from "../recording-types"
import ROSLIB from "roslib"
import dynamic from "next/dynamic"

// Types and interfaces
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
    recording_id?: string;
}

interface NotificationState {
    error: string | null;
    success: string | null;
}

// Topic component for better organization
interface TopicInputProps {
    topic: Topic;
    index: number;
    availableTopics: { topic: string, type: string }[];
    onChange: (index: number, field: keyof Topic, value: string) => void;
    onRemove: (index: number) => void;
    disabled: boolean;
    isRemoveDisabled: boolean;
}

// ActiveRecording component props
interface ActiveRecordingProps {
    recording: RecordingStatus;
    isCurrentRecording: boolean;
    onStop: (recordingId: string, bagName: string) => void;
    formatDuration: (seconds: number) => string;
}

// Memoize components for better performance
const TopicInput = memo(({
    topic,
    index,
    availableTopics,
    onChange,
    onRemove,
    disabled,
    isRemoveDisabled
}: TopicInputProps) => (
    <Card key={index}>
        <CardContent className="pt-4 pb-2">
            <div className="flex justify-between mb-2">
                <Label>Topic {index + 1}</Label>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(index)}
                    disabled={isRemoveDisabled}
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
                            onChange={(e) => onChange(index, 'name', e.target.value)}
                            placeholder="Type or select topic name"
                            list={`topic-list-${index}`}
                            disabled={disabled}
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
                            onChange={(e) => onChange(index, 'type', e.target.value)}
                            placeholder="Type or select topic type"
                            list={`type-list-${index}`}
                            disabled={disabled}
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
));

// Memoize ActiveRecording component
const ActiveRecording = memo(({
    recording,
    isCurrentRecording,
    onStop,
    formatDuration
}: ActiveRecordingProps) => (
    <Card key={recording.recording_id}>
        <CardContent className="pt-4">
            <div className="flex justify-between items-start">
                <div>
                    <Badge variant="outline" className="bg-red-100 mb-2">Recording</Badge>
                    <h4 className="font-medium">{recording.name}</h4>
                    <p className="text-sm text-muted-foreground">
                        ID: {recording.recording_id}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Topics: {recording.topics.map((t) => t.name).join(", ")}
                    </p>
                </div>
                {!isCurrentRecording && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onStop(recording.recording_id, recording.name)}
                    >
                        Stop
                    </Button>
                )}
            </div>
        </CardContent>
    </Card>
));

// Main component
const BagsRecorder: React.FC<BagListProps> = (props) => {
    const pluginsManager = usePluginsManager();

    // Grouped state by purpose
    // Form state
    const [formData, setFormData] = useState<RecordFormData>({
        bag_name: "",
        topics: [{ name: "", type: "" }]
    });
    const [recording, setRecording] = useState(false);

    // Service state
    const [client, setClient] = useState<RestBagClient | null>(null);
    const [roslib, setRoslib] = useState<ROSLIB.Ros | null>(null);

    // Data state
    const [availableTopics, setAvailableTopics] = useState<{ topic: string, type: string }[]>([]);
    const [activeRecordings, setActiveRecordings] = useState<RecordingStatus[]>([]);

    // UI state
    const [notification, setNotification] = useState<NotificationState>({
        error: null,
        success: null
    });

    // Initialize clients and connections
    useEffect(() => {
        const new_client = pluginsManager.applyFilter<RestBagClient>(`${props.api_datasource_id}-client`, null);
        setClient(new_client);

        const new_ros = pluginsManager.applyFilter<ROSLIB.Ros>(`${props.ros_datasource_id}-ros-2-connection`, null)
        setRoslib(new_ros);
    }, [props, pluginsManager]);

    // Optimize fetching with a reference to avoid unnecessary state updates
    useEffect(() => {
        if (!client) return;

        const fetchRecordings = async () => {
            try {
                const recordings = await client.getRecordings();

                // Only update state if recordings have changed
                setActiveRecordings(prev => {
                    // Simple comparison to avoid unnecessary updates
                    if (JSON.stringify(prev) === JSON.stringify(recordings)) {
                        return prev;
                    }
                    return recordings;
                });

                // Update recording state if our recording ID is no longer found
                if (formData.recording_id) {
                    const ourRecording = recordings.find(r => r.recording_id === formData.recording_id);
                    if (!ourRecording) {
                        setRecording(false);
                        setFormData(prev => {
                            if (!prev.recording_id) return prev;
                            return { ...prev, recording_id: undefined };
                        });
                    }
                }
            } catch (err) {
                console.error("Failed to fetch recordings:", err);
            }
        };

        fetchRecordings(); // Fetch immediately

        // Reduce polling frequency to improve performance
        const intervalId = setInterval(fetchRecordings, 3000); // Changed from 1000 to 3000ms
        return () => clearInterval(intervalId);
    }, [client, formData.recording_id]);

    // Fetch available topics - optimize to prevent unnecessary fetches
    useEffect(() => {
        if (!roslib) return;

        let isMounted = true;

        roslib.getTopics((result: { topics: string[]; types: string[]; }) => {
            if (isMounted) {
                const newTopics = result.topics.map((topic, i) => ({ topic, type: result.types[i] }));
                setAvailableTopics(prev => {
                    if (prev.length === newTopics.length &&
                        JSON.stringify(prev) === JSON.stringify(newTopics)) {
                        return prev;
                    }
                    return newTopics;
                });
            }
        });

        return () => { isMounted = false; };
    }, [roslib]);

    // Form handling functions
    const handleBagNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            bag_name: e.target.value
        });
    };

    const handleTopicChange = useCallback((index: number, field: keyof Topic, value: string) => {
        setFormData(prevData => {
            const updatedTopics = [...prevData.topics];
            updatedTopics[index] = {
                ...updatedTopics[index],
                [field]: value
            };

            // Auto-fill the type when name is selected
            if (field === 'name') {
                const matchingTopic = availableTopics.find(t => t.topic === value);
                if (matchingTopic) {
                    updatedTopics[index].type = matchingTopic.type;
                }
            }

            return {
                ...prevData,
                topics: updatedTopics
            };
        });
    }, [availableTopics]);

    const addTopic = useCallback(() => {
        setFormData(prevData => ({
            ...prevData,
            topics: [...prevData.topics, { name: "", type: "" }]
        }));
    }, []);

    const removeTopic = useCallback((index: number) => {
        setFormData(prevData => {
            const updatedTopics = [...prevData.topics];
            updatedTopics.splice(index, 1);
            return {
                ...prevData,
                topics: updatedTopics.length > 0 ? updatedTopics : [{ name: "", type: "" }]
            };
        });
    }, []);

    // Notification helpers
    const showError = (message: string) => {
        setNotification({ error: message, success: null });
    };

    const showSuccess = (message: string) => {
        setNotification({ error: null, success: message });
    };

    const clearNotifications = () => {
        setNotification({ error: null, success: null });
    };

    // Recording functions
    const startRecording = async () => {
        if (!client) {
            showError("Client not initialized");
            return;
        }

        if (!formData.bag_name) {
            showError("Bag name is required");
            return;
        }

        if (!formData.topics.length || formData.topics.some(t => !t.name || !t.type)) {
            showError("At least one valid topic must be specified");
            return;
        }

        clearNotifications();

        try {
            const request: RecordingRequest = {
                name: formData.bag_name,
                topics: formData.topics.map(t => ({
                    name: t.name,
                    type: t.type
                }))
            };

            const response = await client.startRecording(request);
            setFormData(prev => ({ ...prev, recording_id: response.recording_id }));
            setRecording(true);
            showSuccess(`Recording started for bag: ${formData.bag_name} (ID: ${response.recording_id})`);
        } catch (err) {
            showError(`Failed to start recording: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const stopRecording = async () => {
        if (!client || !formData.recording_id) {
            showError("Client not initialized or no active recording");
            return;
        }

        try {
            await client.stopRecording(formData.recording_id);
            showSuccess(`Recording stopped for bag: ${formData.bag_name}`);
            setRecording(false);
            setFormData(prev => ({ ...prev, recording_id: undefined }));
        } catch (err) {
            showError(`Failed to stop recording: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const stopExternalRecording = async (recordingId: string, bagName: string) => {
        if (!client) {
            showError("Client not initialized");
            return;
        }

        try {
            await client.stopRecording(recordingId);
            showSuccess(`Stopped recording: ${bagName}`);
        } catch (err) {
            showError(`Failed to stop recording: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    // Memoize utility functions
    const isFormValid = useMemo(() => {
        return Boolean(
            formData.bag_name &&
            formData.topics.length > 0 &&
            formData.topics.every(t => t.name && t.type)
        );
    }, [formData.bag_name, formData.topics]);

    const formatDuration = useCallback((seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return [
            hours > 0 ? `${hours}h` : '',
            minutes > 0 ? `${minutes}m` : '',
            `${secs}s`
        ].filter(Boolean).join(' ');
    }, []);

    // Memoize the rendered list of active recordings to prevent unnecessary re-renders
    const renderedActiveRecordings = useMemo(() => {
        return activeRecordings.map((rec) => (
            <ActiveRecording
                key={rec.recording_id}
                recording={rec}
                isCurrentRecording={rec.recording_id === formData.recording_id}
                onStop={stopExternalRecording}
                formatDuration={formatDuration}
            />
        ));
    }, [activeRecordings, formData.recording_id, stopExternalRecording, formatDuration]);

    // Memoize the rendered list of topics to prevent unnecessary re-renders
    const renderedTopicInputs = useMemo(() => {
        return formData.topics.map((topic, index) => (
            <TopicInput
                key={`topic-${index}`}
                topic={topic}
                index={index}
                availableTopics={availableTopics}
                onChange={handleTopicChange}
                onRemove={removeTopic}
                disabled={recording}
                isRemoveDisabled={formData.topics.length === 1 || recording}
            />
        ));
    }, [formData.topics, availableTopics, handleTopicChange, removeTopic, recording]);

    return (
        <div className="flex flex-col gap-3 p-2" style={{ height: '100%', overflow: 'auto' }}>
            {notification.error && (
                <Alert variant="destructive">
                    <AlertDescription>{notification.error}</AlertDescription>
                </Alert>
            )}

            {notification.success && (
                <Alert>
                    <AlertDescription>{notification.success}</AlertDescription>
                </Alert>
            )}

            {/* Recording Form */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="bag-name">Bag Name</Label>
                    <Input
                        id="bag-name"
                        value={formData.bag_name}
                        onChange={handleBagNameChange}
                        placeholder="Enter bag name"
                        disabled={recording}
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
                            disabled={recording}
                        >
                            <PlusIcon className="h-4 w-4 mr-1" /> Add Topic
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {renderedTopicInputs}
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 mt-4">
                {!recording ? (
                    <Button
                        onClick={startRecording}
                        disabled={!isFormValid}
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

            {/* Current Recording Status */}
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

            {/* Active Recordings List */}
            {activeRecordings.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-lg font-medium mb-3">Active Recordings</h3>
                    <div className="space-y-3">
                        {renderedActiveRecordings}
                    </div>
                </div>
            )}
        </div>
    );
};

// Memoize the entire component
const MemoizedBagsRecorder = memo(BagsRecorder);

export function BagRecorderDefinition(): WidgetDefinition {
    const pluginsManager = usePluginsManager();

    const BagRecorderComponent = dynamic(() => Promise.resolve(MemoizedBagsRecorder), {
        ssr: false
    });

    return {
        id: 'ros2-bag-recorder',
        name: 'ROS2 Bags recorders',
        description: 'Allows to record ROS2 bags',
        titleProp: 'title',
        icon: <VideotapeIcon />,
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
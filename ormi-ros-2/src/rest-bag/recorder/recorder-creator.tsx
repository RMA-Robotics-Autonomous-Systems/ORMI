import { useEffect, useState, useCallback } from "react";
import { RestBagClient } from "../rest-bag-client";
import ROSLIB from "roslib"
import { GetAllTopicTypes, GetTopicsList, ROSTopic } from "@/rosbridge-suite-source";
import { RecordingRequest, Topic } from "../recording-types";
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
    Input,
    Label,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Alert,
    AlertTitle,
    AlertDescription,
} from 'ormi-core/components';
import { PlusIcon, TrashIcon, CheckIcon, ChevronsUpDown, AlertCircle, CheckCircle } from "lucide-react";

interface RecorderCreatorProps {
    client: RestBagClient;
    rosclient: ROSLIB.Ros;
    refresher: () => void;
}

// Define field types for better type safety
type FieldType = 'topic' | 'type';
type FieldKeyMapping = {
    topic: 'name';
    type: 'type';
};

export const RecorderCreator = (props: RecorderCreatorProps) => {
    const { client, rosclient } = props;

    // State declarations
    const [topics, setTopics] = useState<ROSTopic[]>([]);
    const [types, setTypes] = useState<string[]>([]);
    const [topicMap, setTopicMap] = useState<Record<string, string>>({});

    // Consolidated state variables
    const [popoverStates, setPopoverStates] = useState<Record<number, Record<FieldType, boolean>>>({});
    const [customInputs, setCustomInputs] = useState<Record<number, Record<FieldType, string>>>({});
    const [searchTerms, setSearchTerms] = useState<Record<number, Record<FieldType, string>>>({});

    const [recordingRequest, setRecordingRequest] = useState<RecordingRequest>({
        name: "",
        topics: []
    });

    // Add state for error and success messages
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    // Field key mapping for consistency
    const fieldKeyMap: FieldKeyMapping = {
        topic: 'name',
        type: 'type'
    };

    // Load topics and types on component mount
    useEffect(() => {
        const fetchTopics = async () => {
            try {
                const topicList = await GetTopicsList(rosclient);
                setTopics(topicList);

                // Create a mapping of topic names to their types
                const mapping: Record<string, string> = {};
                topicList.forEach(t => {
                    mapping[t.topic] = t.type;
                });
                setTopicMap(mapping);
            } catch (error) {
                console.error("Failed to fetch topics:", error);
            }
        };

        const fetchTypes = async () => {
            try {
                const typeList = await GetAllTopicTypes(rosclient);
                setTypes(typeList);
            } catch (error) {
                console.error("Failed to fetch topic types:", error);
            }
        };

        fetchTopics();
        fetchTypes();
    }, [rosclient, dialogOpen]);

    // Memoize filtered topics and types for better performance
    const getFilteredTopics = useCallback((index: number) => {
        const searchTerm = searchTerms[index]?.topic?.toLowerCase() || '';
        if (!searchTerm) return topics;

        return topics.filter(topic =>
            topic.topic.toLowerCase().includes(searchTerm)
        );
    }, [topics, searchTerms]);

    const getFilteredTypes = useCallback((index: number) => {
        const searchTerm = searchTerms[index]?.type?.toLowerCase() || '';
        if (!searchTerm) return types;

        return types.filter(type =>
            type.toLowerCase().includes(searchTerm)
        );
    }, [types, searchTerms]);

    // Handle search input changes
    const handleSearch = (index: number, fieldType: FieldType, value: string) => {
        setSearchTerms(prev => ({
            ...prev,
            [index]: {
                ...prev[index] || {},
                [fieldType]: value
            }
        }));
        setCustomInputs(prev => ({
            ...prev,
            [index]: {
                ...prev[index] || {},
                [fieldType]: value
            }
        }));
    };

    // Form handlers
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setRecordingRequest({
            ...recordingRequest,
            name: e.target.value
        });
    };

    const handleAddTopic = () => {
        const newIndex = recordingRequest.topics.length;
        setRecordingRequest({
            ...recordingRequest,
            topics: [...recordingRequest.topics, { name: "", type: "" }]
        });

        // Initialize state for the new topic with empty values
        setPopoverStates(prev => ({
            ...prev,
            [newIndex]: { topic: false, type: false }
        }));

        setCustomInputs(prev => ({
            ...prev,
            [newIndex]: { topic: "", type: "" }
        }));

        setSearchTerms(prev => ({
            ...prev,
            [newIndex]: { topic: "", type: "" }
        }));
    };

    const handleRemoveTopic = (index: number) => {
        const updatedTopics = [...recordingRequest.topics];
        updatedTopics.splice(index, 1);

        setRecordingRequest({
            ...recordingRequest,
            topics: updatedTopics
        });

        // Clean up state objects and shift indices
        // Handle each state object separately with proper typing
        const updatePopoverStates = () => {
            const newState = { ...popoverStates };
            delete newState[index];

            // Shift indices for higher index values
            Object.keys(newState).forEach(key => {
                const numKey = parseInt(key);
                if (numKey > index) {
                    newState[numKey - 1] = newState[numKey];
                    delete newState[numKey];
                }
            });

            setPopoverStates(newState);
        };

        const updateCustomInputs = () => {
            const newState = { ...customInputs };
            delete newState[index];

            // Shift indices for higher index values
            Object.keys(newState).forEach(key => {
                const numKey = parseInt(key);
                if (numKey > index) {
                    newState[numKey - 1] = newState[numKey];
                    delete newState[numKey];
                }
            });

            setCustomInputs(newState);
        };

        const updateSearchTerms = () => {
            const newState = { ...searchTerms };
            delete newState[index];

            // Shift indices for higher index values
            Object.keys(newState).forEach(key => {
                const numKey = parseInt(key);
                if (numKey > index) {
                    newState[numKey - 1] = newState[numKey];
                    delete newState[numKey];
                }
            });

            setSearchTerms(newState);
        };

        updatePopoverStates();
        updateCustomInputs();
        updateSearchTerms();
    };

    const handleTopicChange = (index: number, field: keyof Topic, value: string) => {
        const updatedTopics = [...recordingRequest.topics];
        updatedTopics[index] = {
            ...updatedTopics[index],
            [field]: value
        };

        // Auto-select type when a known topic is selected
        if (field === 'name' && topicMap[value]) {
            updatedTopics[index].type = topicMap[value];
            setCustomInputs(prev => ({
                ...prev,
                [index]: {
                    ...prev[index],
                    type: topicMap[value]
                }
            }));
        }

        // Clear search term when a selection is made
        const fieldType = field === 'name' ? 'topic' : 'type';
        setSearchTerms(prev => ({
            ...prev,
            [index]: {
                ...prev[index],
                [fieldType]: ""
            }
        }));

        setRecordingRequest({
            ...recordingRequest,
            topics: updatedTopics
        });
    };

    const togglePopover = (index: number, fieldType: FieldType) => {
        setPopoverStates(prev => ({
            ...prev,
            [index]: {
                ...prev[index] || {},
                [fieldType]: !(prev[index]?.[fieldType] ?? false)
            }
        }));
    };

    const applyCustomInput = (index: number, fieldType: FieldType) => {
        const value = customInputs[index]?.[fieldType]?.trim();
        if (value) {
            handleTopicChange(index, fieldKeyMap[fieldType], value);
            togglePopover(index, fieldType);

            // Reset search term after applying
            setSearchTerms(prev => ({
                ...prev,
                [index]: {
                    ...prev[index] || {},
                    [fieldType]: ""
                }
            }));
        }
    };

    const resetForm = () => {
        setRecordingRequest({
            name: "",
            topics: []
        });
        setError(null);
        setSuccess(null);
        setIsSubmitting(false);
    };

    // Handle dialog open/close
    const handleDialogOpenChange = (open: boolean) => {
        setDialogOpen(open);
        if (!open) {
            resetForm();
        }
    };

    const handleSubmit = () => {
        setError(null);
        setSuccess(null);
        setIsSubmitting(true);

        client.startRecording(recordingRequest)
            .then((response) => {

                if ('error' in response) {
                    setError(response.error);
                    return;
                }

                setSuccess(`Recording "${recordingRequest.name}" started successfully`);

                props.refresher();

                // Optionally auto-close dialog after success
                setTimeout(() => setDialogOpen(false), 800);
            })
            .catch(error => {
                console.error("Failed to start recording:", error);

                // Handle specific error messages from API
                if (error.response) {
                    const errorData = error.response.data;
                    if (errorData.error) {
                        setError(errorData.error);
                    } else if (errorData.detail) {
                        setError(errorData.detail);
                    } else {
                        setError(`Server error: ${error.response.status}`);
                    }
                } else if (error.message) {
                    setError(error.message);
                } else {
                    setError("Failed to start recording. Please try again.");
                }
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    };

    // Form validation
    const isFormValid = recordingRequest.name.trim() !== "" &&
        recordingRequest.topics.length > 0 &&
        recordingRequest.topics.every(topic =>
            topic.name !== "" && topic.type !== "");

    // Utility function for class names
    const cn = (...classes: (string | boolean | undefined)[]) =>
        classes.filter(Boolean).join(' ');

    // Loading state check
    const isLoading = topics.length === 0 || types.length === 0;

    return (
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
                <Button variant="ghost" title="Record a new bag" className="p-2" onClick={() => setDialogOpen(true)}>
                    <PlusIcon className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                    <DialogTitle>Bag Recorder</DialogTitle>
                    <DialogDescription>
                        Create a new recording by selecting topics to record
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center p-6">
                        <div className="text-center">
                            <p>Loading topics and types...</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 p-4">
                        {/* Error message */}
                        {error && (
                            <Alert variant="destructive" className="mb-4">
                                <div className="flex items-start">
                                    <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                                    <div>
                                        <AlertTitle className="font-semibold mb-1">Error</AlertTitle>
                                        <AlertDescription className="text-sm">{error}</AlertDescription>
                                    </div>
                                </div>
                            </Alert>
                        )}

                        {/* Success message */}
                        {success && (
                            <Alert className="mb-4 border-green-500 bg-green-50 text-green-800">
                                <div className="flex items-start">
                                    <CheckCircle className="h-5 w-5 mr-2 text-green-600 flex-shrink-0" />
                                    <div>
                                        <AlertTitle className="font-semibold mb-1">Success</AlertTitle>
                                        <AlertDescription className="text-sm">{success}</AlertDescription>
                                    </div>
                                </div>
                            </Alert>
                        )}

                        {/* Recording Name Field */}
                        <div className="space-y-2">
                            <Label htmlFor="recording-name" className="text-sm font-medium">
                                Recording Name
                            </Label>
                            <Input
                                id="recording-name"
                                value={recordingRequest.name}
                                onChange={handleNameChange}
                                placeholder="Enter recording name"
                                className="w-full"
                            />
                        </div>

                        {/* Topics Section */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center p-3">
                                <Label className="text-sm font-medium">Topics</Label>
                                <Button
                                    size="sm"
                                    onClick={handleAddTopic}
                                    type="button"
                                    variant="outline"
                                    className="h-8 px-2"
                                >
                                    <PlusIcon className="h-4 w-4 mr-1" /> Add Topic
                                </Button>
                            </div>

                            <div className="space-y-3 flex gap-3 flex-col">
                                {recordingRequest.topics.length === 0 ? (
                                    <div className="text-center py-3 border border-dashed rounded-md">
                                        <p className="text-sm text-gray-500">No topics added.</p>
                                    </div>
                                ) : (
                                    recordingRequest.topics.map((topic, index) => (
                                        <div key={index} className="grid grid-cols-12 gap-2 p-3 border rounded-md bg-gray-50">
                                            {/* Topic Name Field with Autocomplete & Custom Input */}
                                            <div className="col-span-5">
                                                <Label htmlFor={`topic-name-${index}`} className="text-xs">
                                                    Topic Name
                                                </Label>
                                                <Popover
                                                    open={popoverStates[index]?.topic}
                                                    onOpenChange={() => togglePopover(index, 'topic')}
                                                >
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            role="combobox"
                                                            aria-expanded={popoverStates[index]?.topic}
                                                            className="w-full justify-between h-9 mt-1 text-xs"
                                                        >
                                                            <span className="truncate">
                                                                {topic.name || "Select or type a topic..."}
                                                            </span>
                                                            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent
                                                        className="w-[220px] p-0"
                                                        align="start"
                                                        side="bottom"
                                                        sideOffset={5}
                                                    >
                                                        <div className="flex flex-col max-h-[300px]">
                                                            <div className="flex items-center border-b p-2">
                                                                <Input
                                                                    value={customInputs[index]?.topic || ""}
                                                                    onChange={(e) => handleSearch(index, 'topic', e.target.value)}
                                                                    placeholder="Search or type custom..."
                                                                    className="flex-grow"
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => applyCustomInput(index, 'topic')}
                                                                    className="ml-2"
                                                                >
                                                                    <CheckIcon className="h-4 w-4" />
                                                                </Button>
                                                            </div>

                                                            {/* Custom scrollable area with proper mouse wheel support */}
                                                            <div
                                                                className="overflow-y-auto max-h-[200px] py-1"
                                                                tabIndex={0} // Make focusable
                                                            >
                                                                {getFilteredTopics(index).length === 0 ? (
                                                                    <div className="py-6 text-center">
                                                                        <p className="text-sm text-gray-500">No topics found</p>
                                                                    </div>
                                                                ) : (
                                                                    getFilteredTopics(index).map((t) => (
                                                                        <div
                                                                            key={t.topic}
                                                                            className={cn(
                                                                                "flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-100",
                                                                                topic.name === t.topic ? "bg-gray-100" : ""
                                                                            )}
                                                                            onClick={() => {
                                                                                handleTopicChange(index, 'name', t.topic);
                                                                                togglePopover(index, 'topic');
                                                                            }}
                                                                        >
                                                                            <CheckIcon
                                                                                className={cn(
                                                                                    "mr-2 h-4 w-4",
                                                                                    topic.name === t.topic ? "opacity-100" : "opacity-0"
                                                                                )}
                                                                            />
                                                                            <span className="truncate text-xs">{t.topic}</span>
                                                                        </div>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>

                                            {/* Topic Type Field with Autocomplete & Custom Input */}
                                            <div className="col-span-6">
                                                <Label htmlFor={`topic-type-${index}`} className="text-xs">
                                                    Topic Type
                                                </Label>
                                                <Popover
                                                    open={popoverStates[index]?.type}
                                                    onOpenChange={() => togglePopover(index, 'type')}
                                                >
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            role="combobox"
                                                            aria-expanded={popoverStates[index]?.type}
                                                            className="w-full justify-between h-9 mt-1 text-xs"
                                                        >
                                                            <span className="truncate">
                                                                {topic.type || "Select or type a type..."}
                                                            </span>
                                                            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent
                                                        className="w-[280px] p-0"
                                                        align="start"
                                                        side="bottom"
                                                        sideOffset={5}
                                                        avoidCollisions
                                                    >
                                                        <div className="flex flex-col max-h-[300px]">
                                                            <div className="flex items-center border-b p-2">
                                                                <Input
                                                                    value={customInputs[index]?.type || ""}
                                                                    onChange={(e) => handleSearch(index, 'type', e.target.value)}
                                                                    placeholder="Search or type custom..."
                                                                    className="flex-grow text-xs"
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => applyCustomInput(index, 'type')}
                                                                    className="ml-2"
                                                                >
                                                                    <CheckIcon className="h-4 w-4" />
                                                                </Button>
                                                            </div>

                                                            {/* Custom scrollable area with proper mouse wheel support */}
                                                            <div
                                                                className="overflow-y-auto max-h-[200px] py-1"
                                                                tabIndex={0} // Make focusable
                                                            >
                                                                {getFilteredTypes(index).length === 0 ? (
                                                                    <div className="py-6 text-center">
                                                                        <p className="text-sm text-gray-500">No types found</p>
                                                                    </div>
                                                                ) : (
                                                                    getFilteredTypes(index).map((type) => (
                                                                        <div
                                                                            key={type}
                                                                            className={cn(
                                                                                "flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-100",
                                                                                topic.type === type ? "bg-gray-100" : ""
                                                                            )}
                                                                            onClick={() => {
                                                                                handleTopicChange(index, 'type', type);
                                                                                togglePopover(index, 'type');
                                                                            }}
                                                                        >
                                                                            <CheckIcon
                                                                                className={cn(
                                                                                    "mr-2 h-4 w-4",
                                                                                    topic.type === type ? "opacity-100" : "opacity-0"
                                                                                )}
                                                                            />
                                                                            <span className="truncate text-xs">{type}</span>
                                                                        </div>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>

                                            {/* Remove Button */}
                                            <div className="col-span-1 flex items-end justify-center pb-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveTopic(index)}
                                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Form Actions */}
                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={handleSubmit}
                                disabled={!isFormValid || isSubmitting}
                                className="px-4"
                            >
                                {isSubmitting ? "Creating..." : "Create Recording"}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
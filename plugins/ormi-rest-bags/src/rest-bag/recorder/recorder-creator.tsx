import { useEffect, useState, useCallback } from "react";
import { RecordingRequest, Topic } from "../recording-types";

import { PlusIcon, AlertCircle, CheckCircle } from "lucide-react";
import { RecorderCreatorProps } from "./types";
import { TopicsList } from "./components";
import {
	Alert,
	AlertTitle,
	AlertDescription,
} from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

export const RecorderCreator = (props: RecorderCreatorProps) => {
	const { client, refresher } = props;

	// State declarations
	const [topics, setTopics] = useState<Topic[]>([]);
	const [types, setTypes] = useState<string[]>([]);
	const [topicMap, setTopicMap] = useState<Record<string, string>>({});
	const [recordingRequest, setRecordingRequest] = useState<RecordingRequest>({
		name: "",
		topics: [],
	});

	// Status state
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);

	// Load topics and types on component mount
	useEffect(() => {
		const fetchTopics = async () => {
			try {
				const topicList = await client.getAvailableTopics();
				setTopics(topicList);

				// Create a mapping of topic names to their types
				const mapping: Record<string, string> = {};
				topicList.forEach((t) => {
					mapping[t.name] = t.type;
				});
				setTopicMap(mapping);
			} catch (error) {
				console.error("Failed to fetch topics:", error);
			}
		};

		const fetchTypes = async () => {
			try {
				const topicList = await client.getAvailableTopics();

				const uniqueTypes = Array.from(
					new Set(topicList.map((t) => t.type)),
				);
				setTypes(uniqueTypes);
			} catch (error) {
				console.error("Failed to fetch topic types:", error);
			}
		};
		fetchTopics();
		fetchTypes();
	}, [dialogOpen]);

	// Form handlers
	const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setRecordingRequest({
			...recordingRequest,
			name: e.target.value,
		});
	};

	const handleAddTopic = () => {
		setRecordingRequest({
			...recordingRequest,
			topics: [...recordingRequest.topics, { name: "", type: "" }],
		});
	};

	const handleRemoveTopic = (index: number) => {
		const updatedTopics = [...recordingRequest.topics];
		updatedTopics.splice(index, 1);

		setRecordingRequest({
			...recordingRequest,
			topics: updatedTopics,
		});
	};

	const handleTopicChange = (
		index: number,
		field: keyof Topic,
		value: string,
	) => {
		const updatedTopics = [...recordingRequest.topics];
		updatedTopics[index]! = {
			...updatedTopics[index]!,
			[field]: value!,
		};

		// Auto-select type when a known topic is selected
		if (field === "name" && topicMap[value]) {
			updatedTopics[index]!.type = topicMap[value]!;
		}

		setRecordingRequest({
			...recordingRequest,
			topics: updatedTopics,
		});
	};

	const handleMetadataUploaded = (
		newTopics: Topic[],
		suggestedName?: string,
	) => {
		setRecordingRequest((prev) => ({
			name: suggestedName || prev.name,
			topics: newTopics,
		}));
	};

	const resetForm = () => {
		setRecordingRequest({
			name: "",
			topics: [],
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

		client
			.startRecording(recordingRequest)
			.then((response) => {
				if ("error" in response) {
					setError(response.error);
					return;
				}

				setSuccess(
					`Recording "${recordingRequest.name}" started successfully`,
				);
				refresher();

				// Optionally auto-close dialog after success
				setTimeout(() => setDialogOpen(false), 800);
			})
			.catch((error) => {
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
	const isFormValid =
		recordingRequest.name.trim() !== "" &&
		recordingRequest.topics.length > 0 &&
		recordingRequest.topics.every(
			(topic) => topic.name !== "" && topic.type !== "",
		);

	// Loading state check
	const isLoading = topics.length === 0 || types.length === 0;

	return (
		<Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					title="Record a new bag"
					className="p-2"
					onClick={() => setDialogOpen(true)}
				>
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
										<AlertTitle className="font-semibold mb-1">
											Error
										</AlertTitle>
										<AlertDescription className="text-sm">
											{error}
										</AlertDescription>
									</div>
								</div>
							</Alert>
						)}

						{/* Success message */}
						{success && (
							<Alert className="mb-4 border-green-500 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/40 dark:text-green-400">
								<div className="flex items-start">
									<CheckCircle className="h-5 w-5 mr-2 text-green-600 dark:text-green-400 flex-shrink-0" />
									<div>
										<AlertTitle className="font-semibold mb-1">
											Success
										</AlertTitle>
										<AlertDescription className="text-sm">
											{success}
										</AlertDescription>
									</div>
								</div>
							</Alert>
						)}

						{/* Recording Name Field */}
						<div className="space-y-2">
							<Label
								htmlFor="recording-name"
								className="text-sm font-medium"
							>
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

						{/* Topics List Component */}
						<TopicsList
							topics={recordingRequest.topics}
							availableTopics={topics}
							availableTypes={types}
							topicMap={topicMap}
							onTopicChange={handleTopicChange}
							onRemoveTopic={handleRemoveTopic}
							onAddTopic={handleAddTopic}
							onMetadataUploaded={handleMetadataUploaded}
							onError={setError}
							onSuccess={setSuccess}
						/>

						{/* Form Actions */}
						<div className="flex justify-end pt-2">
							<Button
								onClick={handleSubmit}
								disabled={!isFormValid || isSubmitting}
								className="px-4"
							>
								{isSubmitting
									? "Creating..."
									: "Create Recording"}
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

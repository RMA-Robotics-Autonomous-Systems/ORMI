import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	Download,
	Trash2,
	Check,
	X,
	RefreshCwIcon,
	InfoIcon,
	LuggageIcon,
	Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
// Add shadcn component imports
import {
	BagInfo,
	Duration,
	Timestamp,
	CompressionTasksList,
	CompressionTask,
} from "../bags";
import { BagViewer } from "./bag-viewer";

// Interfaces for bag data
import { RestBagClient } from "../rest-bag-client";
import { BagPlayer } from "../player/bag-player";
import { Datasource } from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";

interface BagListProps extends Record<string, unknown> {
	datasource_id: string;
	title: string;
}

const BagList = (props: BagListProps) => {
	const pluginsManager = usePluginsManager();
	// Define per-bag download state
	type DownloadState = {
		status:
			| "idle"
			| "checking"
			| "compressing"
			| "downloading"
			| "completed"
			| "error";
		progress?: number;
		error?: string;
		taskId?: string;
	};

	const [bags, setBags] = useState<BagInfo[]>([]);
	const [client, setClient] = useState<RestBagClient | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [refreshCounter, setRefreshCounter] = useState<number>(0);
	const [downloadStates, setDownloadStates] = useState<
		Map<string, DownloadState>
	>(new Map());
	const [compressionTasks, setCompressionTasks] =
		useState<CompressionTasksList>({ tasks: {}, count: 0 });

	const { setButtonItem, removeButtonItem } = useButtonHolder();

	useEffect(() => {
		const new_client = pluginsManager.applyFilter<RestBagClient>(
			`${props.datasource_id}-client`,
			null,
		);
		setClient(new_client);

		setButtonItem(
			"bag-list-refresh",
			<Button
				variant="ghost"
				onClick={() => setRefreshCounter((prev) => (prev + 1) % 10)}
				title="Refresh bag list"
			>
				<RefreshCwIcon />
			</Button>,
		);

		return () => {
			removeButtonItem("bag-list-refresh");
		};
	}, [props.datasource_id, pluginsManager]);

	useEffect(() => {
		if (!client) {
			console.warn("Client is not available, cannot fetch bags");
			return;
		}

		const fetchBags = async () => {
			setLoading(true);
			setError(null);
			try {
				const bagsList = await client.getBags();
				const bags: BagInfo[] = [];

				for (const path in bagsList) {
					for (const bagName in bagsList[path]) {
						bags.push(bagsList[path]![bagName]!);
					}
				}

				setBags(bags);
			} catch (err: unknown) {
				console.error("Failed to fetch bags:", err);
				setError(
					`Failed to fetch bags: ${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				setLoading(false);
			}
		};

		fetchBags();
	}, [client, refreshCounter]);

	// Fetch compression tasks periodically and update download states
	useEffect(() => {
		if (!client) return;

		const fetchCompressionTasks = async () => {
			try {
				const tasks = await client.listCompressionTasks();
				setCompressionTasks(tasks);

				// Update download states based on tasks
				setDownloadStates((prev) => {
					const newStates = new Map(prev);

					Object.entries(tasks.tasks).forEach(([taskId, task]) => {
						const currentState = newStates.get(task.bag_name);
						if (
							task.status === "compressing" ||
							task.status === "starting"
						) {
							newStates.set(task.bag_name, {
								status: "compressing",
								progress: task.progress,
								taskId: taskId,
							});
						} else if (
							task.status === "completed" &&
							currentState?.status === "compressing"
						) {
							newStates.set(task.bag_name, {
								status: "completed",
								progress: 100,
								taskId: taskId,
							});
						}
					});

					return newStates;
				});
			} catch (error) {
				console.error("Failed to fetch compression tasks:", error);
			}
		};

		fetchCompressionTasks();

		// Refresh tasks every 2 seconds
		const interval = setInterval(fetchCompressionTasks, 2000);

		return () => clearInterval(interval);
	}, [client]);

	const updateDownloadState = (
		bagName: string,
		state: Partial<DownloadState>,
	) => {
		setDownloadStates((prev) => {
			const newStates = new Map(prev);
			const currentState = newStates.get(bagName) || {
				status: "idle" as const,
			};
			newStates.set(bagName, { ...currentState, ...state });
			return newStates;
		});
	};

	const handleDownload = async (bagName: string) => {
		if (!client) return;

		updateDownloadState(bagName, { status: "checking", error: undefined });

		try {
			// Check if there's already a completed compression for this bag
			const tasks = await client.listCompressionTasks();
			const existingTask = Object.entries(tasks.tasks).find(
				([_, task]) =>
					task.bag_name === bagName &&
					task.status === "completed" &&
					task.download_id,
			);

			if (existingTask) {
				// Download directly if already compressed
				const [_, taskInfo] = existingTask;
				await handleDirectDownload(taskInfo.download_id!, bagName);
				return;
			}

			// Start compression if no existing task
			updateDownloadState(bagName, { status: "compressing" });
			await client.startCompression(bagName);
		} catch (error) {
			console.error("Failed to start download/compression:", error);
			updateDownloadState(bagName, {
				status: "error",
				error: `Failed to start download: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};

	const handleDirectDownload = async (
		downloadId: string,
		bagName: string,
	) => {
		if (!client) return;

		try {
			updateDownloadState(bagName, { status: "downloading" });

			// Use the simplified download method - browser handles progress natively
			await client.downloadCompressedBag(downloadId);

			// Clear state after successful download initiation
			setTimeout(() => {
				updateDownloadState(bagName, { status: "idle" });
			}, 2000); // Clear state after 2 seconds
		} catch (error) {
			console.error("Failed to download file:", error);
			updateDownloadState(bagName, {
				status: "error",
				error: `Failed to download: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};

	// Auto-download when compression completes
	useEffect(() => {
		downloadStates.forEach(async (state, bagName) => {
			if (state.status === "completed" && state.taskId) {
				// Find the corresponding task to get download_id
				const task = compressionTasks.tasks[state.taskId];
				if (task?.download_id) {
					await handleDirectDownload(task.download_id, bagName);
				}
			}
		});
	}, [downloadStates, compressionTasks]);

	const handleDelete = async (bagName: string) => {
		if (!client) {
			setError("Client is not available. Cannot delete bag.");
			return;
		}

		try {
			await client.deleteBag(bagName);
			// Refresh the bag list after deletion
			setBags(bags.filter((bag) => bag.name !== bagName));
		} catch (err) {
			console.error("Failed to delete bag:", err);
			setError("Failed to delete bag. Please try again later.");
		} finally {
			setDeleteConfirm(null);
		}
	};

	const formatDateTime = (timestamp: Timestamp) => {
		const date = new Date(timestamp.nanoseconds_since_epoch / 1000000);
		return date.toLocaleString();
	};

	const formatDuration = (duration: Duration) => {
		const totalSeconds = duration.nanoseconds / 1000000000;
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = Math.floor(totalSeconds % 60);

		return `${hours}h ${minutes}m ${seconds}s`;
	};

	// Filter bags based on search query
	const filteredBags = bags.filter((bag) =>
		bag.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	return (
		<div
			className="flex flex-col gap-2 sm:gap-3 p-1 sm:p-2"
			style={{ height: "100%", overflow: "auto" }}
		>
			<div className="relative">
				<Input
					placeholder="Search bags..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 text-sm"
				/>
			</div>

			{loading && (
				<p className="text-muted-foreground">Loading bags...</p>
			)}

			{error && (
				<Alert
					variant={
						error.includes("Downloading")
							? "default"
							: "destructive"
					}
				>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{!loading && filteredBags.length === 0 && !error && (
				<p className="text-muted-foreground">
					{bags.length === 0
						? "No bags found."
						: "No bags match your search."}
				</p>
			)}

			{filteredBags.map((bag) => {
				const downloadState = downloadStates.get(bag.name) || {
					status: "idle" as const,
				};

				return (
					<Card key={bag.name} className="shadow-sm">
						<CardHeader className="pb-2">
							<div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
								<CardTitle className="text-sm sm:text-base break-all">
									{bag.name}
								</CardTitle>
								<div className="flex flex-wrap gap-1 sm:gap-2">
									{deleteConfirm === bag.name ? (
										<div className="flex items-center space-x-1 sm:space-x-2">
											<span className="text-xs sm:text-sm text-destructive">
												Confirm?
											</span>
											<Button
												onClick={() =>
													handleDelete(bag.name)
												}
												variant="destructive"
												size="sm"
												className="h-7 w-7 sm:h-8 sm:w-8 p-0"
											>
												<Check size={14} />
											</Button>
											<Button
												onClick={() =>
													setDeleteConfirm(null)
												}
												variant="outline"
												size="sm"
												className="h-7 w-7 sm:h-8 sm:w-8 p-0"
											>
												<X size={14} />
											</Button>
										</div>
									) : (
										<div className="flex flex-wrap gap-1 sm:gap-2">
											<BagPlayer
												bag={bag}
												datasource_id={
													props.datasource_id
												}
												title={props.title}
											/>
											<BagViewer
												bag={bag}
												trigger={
													<Button
														variant="outline"
														title="View bag details"
														size="sm"
														className="h-7 w-7 sm:h-8 sm:w-8 p-0"
													>
														<InfoIcon size={14} />
													</Button>
												}
											/>

											{/* Single download button with embedded logic */}
											<Button
												onClick={() =>
													handleDownload(bag.name)
												}
												variant="outline"
												size="sm"
												className="h-7 w-7 sm:h-8 sm:w-8 p-0"
												title={
													downloadState.status ===
													"idle"
														? "Download bag with compression"
														: downloadState.status ===
															  "checking"
															? "Checking compression status..."
															: downloadState.status ===
																  "compressing"
																? `Compressing... ${downloadState.progress || 0}%`
																: downloadState.status ===
																	  "downloading"
																	? "Starting download..."
																	: downloadState.status ===
																		  "completed"
																		? "Download completed"
																		: downloadState.status ===
																			  "error"
																			? `Error: ${downloadState.error}`
																			: "Download"
												}
												disabled={
													downloadState.status !==
														"idle" &&
													downloadState.status !==
														"error"
												}
											>
												{downloadState.status ===
													"checking" ||
												downloadState.status ===
													"compressing" ||
												downloadState.status ===
													"downloading" ? (
													<Loader2
														className="animate-spin"
														size={14}
													/>
												) : (
													<Download size={14} />
												)}
											</Button>

											<Button
												onClick={() =>
													setDeleteConfirm(bag.name)
												}
												variant="outline"
												size="sm"
												className="text-destructive hover:bg-destructive/10 h-7 w-7 sm:h-8 sm:w-8 p-0"
												title="Delete bag"
											>
												<Trash2 size={14} />
											</Button>
										</div>
									)}
								</div>
							</div>
						</CardHeader>
						<CardContent>
							{downloadState.status === "error" &&
								downloadState.error && (
									<Alert
										variant="destructive"
										className="mb-3"
									>
										<AlertDescription className="text-xs sm:text-sm">
											{downloadState.error}
										</AlertDescription>
									</Alert>
								)}
							{downloadState.status === "compressing" && (
								<Alert className="mb-3">
									<AlertDescription className="text-xs sm:text-sm">
										Compressing bag...{" "}
										{downloadState.progress || 0}%
									</AlertDescription>
								</Alert>
							)}
							{downloadState.status === "downloading" && (
								<Alert className="mb-3">
									<AlertDescription className="text-xs sm:text-sm">
										Starting download... Check your
										browser's download manager for progress.
									</AlertDescription>
								</Alert>
							)}

							<div className="flex flex-col sm:flex-row sm:justify-between gap-2 sm:gap-2">
								<div className="text-xs sm:text-sm min-w-0 flex-1">
									<div className="flex flex-col gap-1">
										<div className="truncate">
											<span className="font-medium text-muted-foreground">
												Path:
											</span>{" "}
											<span className="break-all">
												{bag.path}
											</span>
										</div>
										<div>
											<span className="font-medium text-muted-foreground">
												Start:
											</span>{" "}
											<span className="break-all">
												{formatDateTime(
													bag.meta.starting_time,
												)}
											</span>
										</div>
									</div>
								</div>
								<div className="flex flex-wrap gap-1 sm:gap-2 justify-start sm:justify-end">
									<Badge
										variant="outline"
										className="text-xs"
									>
										{formatDuration(bag.meta.duration)}
									</Badge>
									<Badge
										variant="outline"
										className="text-xs"
									>
										{bag.meta.message_count} messages
									</Badge>
									<Badge
										variant="outline"
										className="text-xs"
									>
										{
											bag.meta.topics_with_message_count
												.length
										}{" "}
										topics
									</Badge>
								</div>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
};

export function BagListDefinition(): WidgetDefinition<BagListProps> {
	const pluginsManager = usePluginsManager();

	return {
		id: "ros2-bag-list",
		name: "ROS2 Bag List",
		description: "List of ROS2 Bags",
		titleProp: "title",
		icon: <LuggageIcon />,
		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				datasource_id: { type: "string", title: "Datasources" },
			},
			required: ["title"],
		},
		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/datasource_id",
					options: {
						async: true,
						asyncFunction: async () => {
							const datasources = Array.from(
								pluginsManager.applyFilter<Datasource[]>(
									PluginsHooks.AVAILABLE_DATASOURCES,
									[],
								),
							).filter(
								(ds) => ds.datasource_id === "rest-bag-source",
							);

							const values = Array.from(datasources).map(
								(ds) => ({
									value: ds.settings.id,
									label: ds.settings.title,
								}),
							);

							return values;
						},
					},
				} as ControlElement,
			],
		} as VerticalLayout,
		data: { title: "ROS2 Bag List" },
		Component: (data: BagListProps) => <BagList {...data} />,
	};
}

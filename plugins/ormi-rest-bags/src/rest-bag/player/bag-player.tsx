import { BagInfo } from "../bags";

import { PlayIcon, PauseIcon, SquareIcon } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { RestBagClient } from "../rest-bag-client";
import { PlayerPlayRequest } from "../player-types";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";

interface BagPlayerProps {
	bag: BagInfo;
	datasource_id: string;
	title: string;
}

export function BagPlayer({ bag, datasource_id }: BagPlayerProps) {
	const [playId, setPlayId] = useState<string | null>(null);
	const [status, setStatus] = useState<string>("READY");
	const [error, setError] = useState<string | null>(null);
	const [useSystemTime, setUseSystemTime] = useState<boolean>(false);
	const statusPollInterval = useRef<number | null>(null);
	const [client, setClient] = useState<RestBagClient | null>(null);

	const pluginsManager = usePluginsManager();

	// Initialize RestBagClient when datasource changes
	useEffect(() => {
		const new_client = pluginsManager.applyFilter<RestBagClient>(
			`${datasource_id}-client`,
			null,
		);
		setClient(new_client);

		// Check for existing playback session when client is initialized
		if (new_client && bag) {
			checkExistingPlayback(new_client);
		}
	}, [datasource_id, bag]);

	// Function to check for existing playback
	const checkExistingPlayback = async (client: RestBagClient) => {
		try {
			// Fetch active players from the API
			const response = await client.listPlayers();

			// Extract the players array from the response
			const activePlayers = response.active_players || [];

			const activePlayer = activePlayers.find(
				(player) => player.bag_name === bag.name,
			);

			if (activePlayer) {
				// Sync UI with existing playback
				setPlayId(activePlayer.play_id);
				setStatus(activePlayer.status?.toUpperCase() || "UNKNOWN");

				// Start polling for status updates
				if (!statusPollInterval.current) {
					const fetchStatus = async () => {
						try {
							const statusResponse = await client.getPlayerStatus(
								activePlayer.play_id,
							);
							setStatus(
								statusResponse.status?.toUpperCase() ||
									"UNKNOWN",
							);

							if (
								statusResponse.status === "stopped" ||
								statusResponse.status === "completed"
							) {
								clearInterval(statusPollInterval.current!);
								statusPollInterval.current = null;

								if (statusResponse.status === "completed") {
									setPlayId(null);
									setStatus("READY");
									setError(null);
								}
							}
						} catch (error) {
							setError(`Error: ${error}`);
						}
					};

					fetchStatus(); // Fetch once immediately
					statusPollInterval.current = window.setInterval(
						fetchStatus,
						1000,
					);
				}
			}
		} catch (error) {
			console.error("Failed to check for existing playback:", error);
			// Don't set UI error here as it's not a critical failure
		}
	};

	// Clean up interval on component unmount
	useEffect(() => {
		return () => {
			if (statusPollInterval.current !== null) {
				clearInterval(statusPollInterval.current);
			}
		};
	}, []);

	// Poll player status when playId exists
	useEffect(() => {
		if (!client || !playId) return;

		const fetchStatus = async () => {
			try {
				const statusResponse = await client.getPlayerStatus(playId);
				setStatus(statusResponse.status?.toUpperCase() || "UNKNOWN");

				// Auto-stop polling when playback ends
				if (
					statusResponse.status === "stopped" ||
					statusResponse.status === "completed"
				) {
					clearInterval(statusPollInterval.current!);
					statusPollInterval.current = null;

					// Reset the player when status is completed
					if (statusResponse.status === "completed") {
						setPlayId(null);
						setStatus("READY");
						setError(null);
					}
				}
			} catch (error) {
				setError(`Error: ${error}`);
			}
		};

		// Start polling
		fetchStatus();
		if (statusPollInterval.current === null) {
			statusPollInterval.current = window.setInterval(fetchStatus, 1000);
		}

		return () => {
			if (statusPollInterval.current !== null) {
				clearInterval(statusPollInterval.current);
				statusPollInterval.current = null;
			}
		};
	}, [client, playId]);

	const playBag = async () => {
		if (!client || !bag) return;

		try {
			const request: PlayerPlayRequest = {
				bag_name: bag.name,
				rate: 1.0,
				use_system_time: useSystemTime,
			};

			const response = await client.startPlayback(request);
			setPlayId(response.play_id);
			setStatus("PLAYING");
			setError(null);
		} catch (error) {
			setError(`Error: ${error}`);
		}
	};

	const pausePlayback = async () => {
		if (!client || !playId) return;

		try {
			await client.pausePlayback(playId);
			setStatus("PAUSED");
		} catch (error) {
			setError(`Error: ${error}`);
		}
	};

	const resumePlayback = async () => {
		if (!client || !playId) return;

		try {
			await client.resumePlayback(playId);
			setStatus("PLAYING");
		} catch (error) {
			setError(`Error: ${error}`);
		}
	};

	const stopPlayback = async () => {
		if (!client || !playId) return;

		try {
			await client.stopPlayback(playId);
			setPlayId(null);
			setStatus("READY");
			setError(null);

			if (statusPollInterval.current !== null) {
				clearInterval(statusPollInterval.current);
				statusPollInterval.current = null;
			}
		} catch (error) {
			setError(`Error: ${error}`);
		}
	};

	if (!bag) {
		return <div>No bag selected</div>;
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Badge
					variant={
						status === "PLAYING"
							? "default"
							: status === "PAUSED"
								? "outline"
								: "secondary"
					}
				>
					{status}
				</Badge>

				{error && <span className="text-red-500 text-xs">{error}</span>}

				<div className="flex gap-1 ml-auto">
					{!playId ? (
						<Button size="sm" onClick={playBag}>
							<PlayIcon className="h-4 w-4" />
						</Button>
					) : (
						<>
							{status === "PAUSED" ? (
								<Button size="sm" onClick={resumePlayback}>
									<PlayIcon className="h-4 w-4" />
								</Button>
							) : (
								<Button size="sm" onClick={pausePlayback}>
									<PauseIcon className="h-4 w-4" />
								</Button>
							)}
							<Button
								size="sm"
								variant="destructive"
								onClick={stopPlayback}
							>
								<SquareIcon className="h-4 w-4" />
							</Button>
						</>
					)}
				</div>
			</div>

			{!playId && (
				<div className="flex items-center gap-2 text-sm">
					<Checkbox
						id="use-system-time"
						checked={useSystemTime}
						onCheckedChange={(checked) =>
							setUseSystemTime(checked as boolean)
						}
					/>
					<label htmlFor="use-system-time" className="cursor-pointer">
						Use System Time
					</label>
				</div>
			)}
		</div>
	);
}

import { RosBridgeSuiteDataSourceSettings } from "../../rosbridge-suite-source";
import { ControlElement, VerticalLayout } from "@jsonforms/core";

import { SelectedTopic } from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@workspace/ui/components/alert";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { CctvIcon, RefreshCw, RotateCcw, RotateCw } from "lucide-react";
import { toast } from "sonner";
import React, { useCallback, useEffect, useRef, useState } from "react";

/** Watchdog interval (ms) used to detect a stalled stream via `currentTime`. */
const STALL_CHECK_INTERVAL = 1000;
/** How long `currentTime` may stay frozen before the stream is considered stalled. */
const STALL_TIMEOUT = 2000;

/** Auto-retry backoff bounds. */
const RETRY_BASE_DELAY = 1000;
const RETRY_MAX_DELAY = 15000;
const RETRY_MAX_ATTEMPTS = 5;

interface WebrtcRos2VideoStreamProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	iceServersUrls?: string[];
}

/**
 * Coarse, human-facing connection status derived from the raw WebRTC state.
 * - `connecting`: negotiating / waiting for the first frame.
 * - `live`: connected and frames are flowing.
 * - `stalled`: connected but the stream stopped progressing.
 * - `failed`: negotiation threw or the peer connection failed.
 */
type UiStatus = "connecting" | "live" | "stalled" | "failed";

/**
 * Derive the host portion of a websocket URL (e.g. `ws://host:9090` → `host`).
 * Returns `null` for a missing/malformed URL so callers can render an empty state.
 */
const getHostFromWSUrl = (url: string | undefined): string | null => {
	if (!url) return null;
	const urlParts = url.split("/");
	const authority = urlParts[2];
	if (!authority) return null;
	const host = authority.split(":")[0];
	return host || null;
};

const WebrtcRos2VideoStream = (props: WebrtcRos2VideoStreamProps) => {
	const videoRef = useRef<HTMLVideoElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const cleanupRef = useRef<boolean>(false);

	const { setButtonItem, removeButtonItem } = useButtonHolder();

	// Resolve connection parameters defensively so a missing/malformed topic
	// renders the empty state instead of throwing.
	const ros2Definition = props.topic?.source as
		| RosBridgeSuiteDataSourceSettings
		| undefined;
	const host = getHostFromWSUrl(ros2Definition?.url);
	const topicName = props.topic?.topic;
	const iceServersUrls = props.iceServersUrls;
	const iceServersKey = (iceServersUrls ?? []).join("|");

	const hasTopic = Boolean(topicName && host);

	const [rotation, setRotation] = useState(0);

	// Raw WebRTC state string (exposed via tooltip for power users).
	const [rawState, setRawState] = useState("new");
	// Coarse UI status driving the presentation.
	const [uiStatus, setUiStatus] = useState<UiStatus>("connecting");
	// True once the video element has started receiving/playing frames.
	const [hasFrame, setHasFrame] = useState(false);
	// Manual/auto retry nonce — bumping it re-runs the connection effect.
	const [retryNonce, setRetryNonce] = useState(0);
	// Current auto-retry attempt index (0 = none in progress).
	const [retryAttempt, setRetryAttempt] = useState(0);

	// Tile dimensions tracked via ResizeObserver for rotation letterboxing.
	const [tileSize, setTileSize] = useState({ width: 0, height: 0 });

	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const retryAttemptRef = useRef(0);
	const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const lastTimeRef = useRef<number>(0);
	const lastProgressAtRef = useRef<number>(0);

	const clearRetryTimer = useCallback(() => {
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
	}, []);

	/** Manual reconnect — resets backoff and forces a fresh negotiation. */
	const reconnect = useCallback(() => {
		clearRetryTimer();
		retryAttemptRef.current = 0;
		setRetryAttempt(0);
		setRetryNonce((n) => n + 1);
	}, [clearRetryTimer]);

	// --- Tile measurement (ResizeObserver) -------------------------------
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const update = () =>
			setTileSize({ width: el.clientWidth, height: el.clientHeight });
		update();

		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasTopic]);

	// --- WebRTC connection ------------------------------------------------
	useEffect(() => {
		if (!hasTopic || !host || !topicName) return;

		cleanupRef.current = false;
		setHasFrame(false);
		setUiStatus("connecting");

		if (pcRef.current) {
			pcRef.current.close();
			pcRef.current = null;
		}

		const pc = new RTCPeerConnection({
			iceServers: iceServersUrls?.map((url) => ({ urls: url })) || [
				{ urls: "stun:stun.l.google.com:19302" },
			],
		});
		pcRef.current = pc;
		pc.addTransceiver("video", { direction: "recvonly" });

		/** Schedule an automatic retry with bounded exponential backoff. */
		const scheduleRetry = () => {
			if (cleanupRef.current) return;
			if (retryAttemptRef.current >= RETRY_MAX_ATTEMPTS) return;

			const attempt = retryAttemptRef.current + 1;
			retryAttemptRef.current = attempt;
			setRetryAttempt(attempt);

			const delay = Math.min(
				RETRY_BASE_DELAY * 2 ** (attempt - 1),
				RETRY_MAX_DELAY,
			);
			clearRetryTimer();
			retryTimerRef.current = setTimeout(() => {
				if (!cleanupRef.current) setRetryNonce((n) => n + 1);
			}, delay);
		};

		const handleFailure = () => {
			if (cleanupRef.current) return;
			setUiStatus("failed");
			scheduleRetry();
		};

		const syncRawConnectionState = (state: string) => {
			setRawState(state);
			if (cleanupRef.current) return;

			if (state === "connected" || state === "completed") {
				// Successful connection: stop any pending auto-retry / backoff.
				clearRetryTimer();
				retryAttemptRef.current = 0;
				setRetryAttempt(0);
				// Promote to live only once frames are actually flowing.
				setUiStatus((prev) =>
					prev === "failed" ? "connecting" : prev,
				);
			} else if (state === "failed") {
				handleFailure();
			} else if (state === "disconnected" || state === "closed") {
				if (!cleanupRef.current) {
					setHasFrame(false);
					setUiStatus("stalled");
				}
			}
		};

		pc.oniceconnectionstatechange = () => {
			syncRawConnectionState(pc.iceConnectionState);
		};
		pc.onconnectionstatechange = () => {
			syncRawConnectionState(pc.connectionState);
		};

		pc.ontrack = (event: RTCTrackEvent) => {
			if (videoRef.current && event.streams[0]) {
				const video = videoRef.current;
				video.srcObject = event.streams[0];

				video.onplaying = () => {
					if (cleanupRef.current) return;
					setHasFrame(true);
					setUiStatus("live");
				};
				video.onwaiting = () => {
					if (!cleanupRef.current) setUiStatus("stalled");
				};
				video.onstalled = () => {
					if (!cleanupRef.current) setUiStatus("stalled");
				};
				video.onended = () => {
					if (!cleanupRef.current) {
						setHasFrame(false);
						setUiStatus("stalled");
					}
				};

				video.play().catch(() => {});
			}
		};

		const negotiate = async () => {
			try {
				if (cleanupRef.current) return;

				const offer = await pc.createOffer();
				if (cleanupRef.current) return;

				await pc.setLocalDescription(offer);

				await new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						resolve();
					}, 5000);

					if (pc.iceGatheringState === "complete") {
						clearTimeout(timeout);
						resolve();
					} else {
						const checkState = () => {
							if (
								pc.iceGatheringState === "complete" ||
								cleanupRef.current
							) {
								pc.removeEventListener(
									"icegatheringstatechange",
									checkState,
								);
								clearTimeout(timeout);
								resolve();
							}
						};
						pc.addEventListener(
							"icegatheringstatechange",
							checkState,
						);
					}
				});

				if (cleanupRef.current) return;

				const response = await fetch(`http://${host}:8080/offer`, {
					method: "POST",
					body: JSON.stringify({
						sdp: pc.localDescription?.sdp,
						type: pc.localDescription?.type,
						topic: topicName,
					}),
					headers: { "Content-Type": "application/json" },
				});

				if (cleanupRef.current) return;

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(
						`Server responded with ${response.status}: ${errorText}`,
					);
				}

				const answer =
					(await response.json()) as RTCSessionDescriptionInit;
				if (cleanupRef.current) return;

				await pc.setRemoteDescription(answer);
			} catch (error) {
				if (!cleanupRef.current) {
					console.error("WebRTC negotiation failed:", error);
					handleFailure();
				}
			}
		};

		negotiate();

		return () => {
			cleanupRef.current = true;
			if (pcRef.current) {
				pcRef.current.close();
				pcRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [host, topicName, iceServersKey, hasTopic, retryNonce, clearRetryTimer]);

	// --- Frame-progress watchdog -----------------------------------------
	useEffect(() => {
		if (!hasFrame) return;
		const video = videoRef.current;
		if (!video) return;

		lastTimeRef.current = video.currentTime;
		lastProgressAtRef.current = Date.now();

		stallTimerRef.current = setInterval(() => {
			const v = videoRef.current;
			if (!v) return;

			if (v.currentTime > lastTimeRef.current) {
				lastTimeRef.current = v.currentTime;
				lastProgressAtRef.current = Date.now();
				setUiStatus((prev) => (prev === "stalled" ? "live" : prev));
			} else if (Date.now() - lastProgressAtRef.current > STALL_TIMEOUT) {
				setUiStatus((prev) => (prev === "live" ? "stalled" : prev));
			}
		}, STALL_CHECK_INTERVAL);

		return () => {
			if (stallTimerRef.current) {
				clearInterval(stallTimerRef.current);
				stallTimerRef.current = null;
			}
		};
	}, [hasFrame]);

	// --- Failure toast ----------------------------------------------------
	useEffect(() => {
		if (uiStatus === "failed") {
			toast.error("WebRTC stream failed", {
				description: `Could not reach the video server for "${topicName}".`,
			});
		}
	}, [uiStatus, topicName]);

	// --- Retry-timer cleanup on unmount ----------------------------------
	useEffect(() => clearRetryTimer, [clearRetryTimer]);

	// --- Toolbar buttons --------------------------------------------------
	useEffect(() => {
		setButtonItem(
			"webrtc-viewer-widget-rotate-ccw",
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						aria-label="Rotate counter-clockwise"
						onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
					>
						<RotateCcw />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Rotate counter-clockwise</TooltipContent>
			</Tooltip>,
			10,
		);

		setButtonItem(
			"webrtc-viewer-widget-rotate-cw",
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						aria-label="Rotate clockwise"
						onClick={() => setRotation((r) => (r + 90) % 360)}
					>
						<RotateCw />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Rotate clockwise</TooltipContent>
			</Tooltip>,
			11,
		);

		setButtonItem(
			"webrtc-viewer-widget-reconnect",
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						aria-label="Reconnect stream"
						onClick={reconnect}
					>
						<RefreshCw />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Reconnect stream</TooltipContent>
			</Tooltip>,
			12,
		);

		return () => {
			removeButtonItem("webrtc-viewer-widget-rotate-cw");
			removeButtonItem("webrtc-viewer-widget-rotate-ccw");
			removeButtonItem("webrtc-viewer-widget-reconnect");
		};
	}, [setButtonItem, removeButtonItem, reconnect]);

	// --- Empty state ------------------------------------------------------
	if (!hasTopic) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
				<CctvIcon size={48} className="mb-2" />
				<div>No topic selected</div>
			</div>
		);
	}

	// Rotation letterboxing: for 90°/270° the video container uses swapped
	// dimensions so the rotated bounding box matches the tile exactly.
	const isQuarterTurn = rotation === 90 || rotation === 270;
	const videoBoxStyle: React.CSSProperties = isQuarterTurn
		? { width: tileSize.height, height: tileSize.width }
		: { width: tileSize.width, height: tileSize.height };

	const isFailed = uiStatus === "failed";
	const isConnecting = uiStatus === "connecting" || (!hasFrame && !isFailed);
	const isStalled = uiStatus === "stalled";
	const isLive = uiStatus === "live" && hasFrame;
	const isReconnecting = retryAttempt > 0 && !isLive;

	return (
		<div
			ref={containerRef}
			className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
		>
			<video
				id="video"
				autoPlay
				muted
				playsInline
				ref={videoRef}
				className={cn(
					"object-contain transition-opacity",
					(isStalled || isFailed) && "opacity-40",
				)}
				style={{
					...videoBoxStyle,
					transform: `rotate(${rotation}deg)`,
				}}
				onError={(e) => console.error("Video element error:", e)}
			/>

			{/* Connecting overlay */}
			{isConnecting && !isFailed && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
					<Spinner size={32} className="h-auto w-auto" />
					<Badge variant="secondary">
						{isReconnecting
							? `Reconnecting… (attempt ${retryAttempt})`
							: "Connecting…"}
					</Badge>
				</div>
			)}

			{/* Status badge (top-left), hidden while the failed alert is shown */}
			{!isFailed && (isLive || isStalled) && (
				<div className="absolute left-2 top-2">
					<Tooltip>
						<TooltipTrigger asChild>
							{isLive ? (
								<Badge className="gap-1.5 bg-green-600 text-white hover:bg-green-600">
									<span className="size-2 rounded-full bg-white" />
									Live · {topicName}
								</Badge>
							) : (
								<Badge variant="destructive">No signal</Badge>
							)}
						</TooltipTrigger>
						<TooltipContent>
							WebRTC state: {rawState}
						</TooltipContent>
					</Tooltip>
				</div>
			)}

			{/* Failed overlay with inline reconnect */}
			{isFailed && (
				<div className="absolute inset-0 flex items-center justify-center p-4">
					<Alert variant="destructive" className="max-w-sm bg-card">
						<AlertTitle>Stream failed</AlertTitle>
						<AlertDescription>
							<p>
								Couldn&apos;t reach the video server for &quot;
								{topicName}&quot;. Check that the camera and the
								WebRTC server are running.
								{isReconnecting &&
									` Retrying automatically (attempt ${retryAttempt})…`}
							</p>
							<Button
								size="sm"
								variant="outline"
								className="mt-2"
								onClick={reconnect}
							>
								<RefreshCw className="mr-1" />
								Reconnect
							</Button>
						</AlertDescription>
					</Alert>
				</div>
			)}
		</div>
	);
};

export default WebrtcRos2VideoStream;

/** Settings for WebRtcRos2 widget. */

export function WebRtcRos2Definition(): WidgetDefinition<WebrtcRos2VideoStreamProps> {
	const title: ControlElement = {
		type: "Control",
		scope: "#/properties/title",
	};

	const topic: TopicSelectElement = {
		type: "TopicSelect",
		scope: "#/properties/topic",
		options: {
			dataRequirements: {
				accepts: [
					"sensor_msgs/Image",
					"sensor_msgs/CompressedImage",
					"Image",
				], // Accept various image types
			},
		},
	};

	const iceServersUrls: ControlElement = {
		type: "Control",
		scope: "#/properties/iceServersUrls",
	};

	const layout: VerticalLayout = {
		type: "VerticalLayout",
		elements: [title, topic, iceServersUrls],
	};

	return {
		id: "webrtc-viewer-widget",
		name: "WebRTC viewer",
		description: "Display a video stream from a ROS2 topic",
		titleProp: "title",
		icon: <CctvIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				topic: {
					type: "object",
					title: "Topic",
				},
				iceServersUrls: {
					type: "array",
					title: "ICE Servers URLs",
					items: {
						type: "string",
					},
					default: ["stun:stun.l.google.com:19302"],
				},
			},
			required: ["title", "topic"],
		},
		uischema: layout,
		data: {
			title: "WebRTC viewer",
			iceServersUrls: ["stun:stun.l.google.com:19302"],
		},
		Component: (data: WebrtcRos2VideoStreamProps) => (
			<WebrtcRos2VideoStream
				title={data.title}
				topic={data.topic}
				iceServersUrls={data.iceServersUrls}
			/>
		),
	};
}

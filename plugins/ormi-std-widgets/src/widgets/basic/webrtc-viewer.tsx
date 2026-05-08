import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { SelectedTopic } from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { CctvIcon, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_ICE_SERVERS = ["stun:stun.l.google.com:19302"];

interface TopicSourceWithUrl {
	url: string;
}

interface WebrtcVideoStreamProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
	iceServersUrls?: string[];
}

const hasUrlSource = (source: unknown): source is TopicSourceWithUrl => {
	return (
		typeof source === "object" &&
		source !== null &&
		"url" in source &&
		typeof (source as { url?: unknown }).url === "string"
	);
};

const getHostFromWSUrl = (url: string) => {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
};

const WebrtcVideoStream = (props: WebrtcVideoStreamProps) => {
	const videoRef = useRef<HTMLVideoElement>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const cleanupRef = useRef(false);
	const { setButtonItem, removeButtonItem } = useButtonHolder();
	const [rotation, setRotation] = useState(0);
	const [connectionStatus, setConnectionStatus] = useState("connecting");

	const source = props.topic.source;
	const isCompatibleWithTopicSource = hasUrlSource(source);
	const host = isCompatibleWithTopicSource
		? getHostFromWSUrl(source.url)
		: null;
	const topicName = props.topic.topic;
	const iceServersUrls = props.iceServersUrls?.length
		? props.iceServersUrls
		: DEFAULT_ICE_SERVERS;
	const iceServersKey = iceServersUrls.join("\0");
	const rotateCcwButtonId = useMemo(
		() => `webrtc-viewer-widget-rotate-ccw-${props.topic.topic}`,
		[props.topic.topic],
	);
	const rotateCwButtonId = useMemo(
		() => `webrtc-viewer-widget-rotate-cw-${props.topic.topic}`,
		[props.topic.topic],
	);

	useEffect(() => {
		cleanupRef.current = false;
		setConnectionStatus("connecting");

		if (pcRef.current) {
			pcRef.current.close();
			pcRef.current = null;
		}

		if (!host || !isCompatibleWithTopicSource) {
			setConnectionStatus("unsupported");
			return;
		}

		const pc = new RTCPeerConnection({
			iceServers: iceServersUrls.map((url) => ({ urls: url })),
		});

		pcRef.current = pc;
		pc.addTransceiver("video", { direction: "recvonly" });

		pc.oniceconnectionstatechange = () => {
			setConnectionStatus(pc.iceConnectionState);
		};

		pc.onconnectionstatechange = () => {
			setConnectionStatus(pc.connectionState);
		};

		pc.ontrack = (event: RTCTrackEvent) => {
			if (videoRef.current && event.streams[0]) {
				videoRef.current.srcObject = event.streams[0];
				void videoRef.current.play().catch(() => undefined);
			}
		};

		const negotiate = async () => {
			try {
				if (cleanupRef.current) {
					return;
				}

				const offer = await pc.createOffer();
				if (cleanupRef.current) {
					return;
				}

				await pc.setLocalDescription(offer);

				await new Promise<void>((resolve) => {
					const timeout = setTimeout(resolve, 5000);
					if (pc.iceGatheringState === "complete") {
						clearTimeout(timeout);
						resolve();
						return;
					}

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

					pc.addEventListener("icegatheringstatechange", checkState);
				});

				if (cleanupRef.current) {
					return;
				}

				const response = await fetch(`http://${host}:8080/offer`, {
					method: "POST",
					body: JSON.stringify({
						sdp: pc.localDescription?.sdp,
						type: pc.localDescription?.type,
						topic: topicName,
					}),
					headers: {
						"Content-Type": "application/json",
					},
				});

				if (cleanupRef.current) {
					return;
				}

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(
						`Server responded with ${response.status}: ${errorText}`,
					);
				}

				const answer =
					(await response.json()) as RTCSessionDescriptionInit;
				if (cleanupRef.current) {
					return;
				}

				await pc.setRemoteDescription(answer);
			} catch (error) {
				if (!cleanupRef.current) {
					console.error("Negotiation failed:", error);
					setConnectionStatus("failed");
				}
			}
		};

		void negotiate();

		return () => {
			cleanupRef.current = true;
			if (pcRef.current) {
				pcRef.current.close();
				pcRef.current = null;
			}
			if (videoRef.current) {
				videoRef.current.srcObject = null;
			}
		};
	}, [host, topicName, iceServersKey, isCompatibleWithTopicSource]);

	useEffect(() => {
		setButtonItem(
			rotateCcwButtonId,
			<Button
				variant={"ghost"}
				onClick={() => {
					setRotation((currentRotation) => currentRotation - 90);
				}}
			>
				<RotateCcw />
			</Button>,
		);

		setButtonItem(
			rotateCwButtonId,
			<Button
				variant={"ghost"}
				onClick={() => {
					setRotation((currentRotation) => currentRotation + 90);
				}}
			>
				<RotateCw />
			</Button>,
		);

		return () => {
			removeButtonItem(rotateCwButtonId);
			removeButtonItem(rotateCcwButtonId);
		};
	}, [removeButtonItem, rotateCcwButtonId, rotateCwButtonId, setButtonItem]);

	return (
		<div>
			{isCompatibleWithTopicSource ? (
				<div>
					<div
						style={{
							marginBottom: "10px",
							fontSize: "12px",
							color: "#666",
						}}
					>
						Connection Status: {connectionStatus}
						{connectionStatus === "failed" && (
							<span style={{ color: "red", marginLeft: "10px" }}>
								Check browser console for details
							</span>
						)}
					</div>
					<video
						autoPlay
						muted
						playsInline
						ref={videoRef}
						style={{
							width: "100%",
							height: "auto",
							transform: `rotate(${rotation}deg)`,
							backgroundColor: "#000",
						}}
					/>
				</div>
			) : (
				<div>
					<h3>Topic source is not compatible with this widget</h3>
					<p>
						Topic source must expose a WebSocket URL and have a
						WebRTC server running.
					</p>
				</div>
			)}
		</div>
	);
};

/** Widget definition for the WebRTC video viewer. */
export function WebRtcViewerDefinition(): WidgetDefinition<WebrtcVideoStreamProps> {
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
				],
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
		description: "Display a video stream from a topic-backed WebRTC server",
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
					default: DEFAULT_ICE_SERVERS,
				},
			},
			required: ["title", "topic"],
		},
		uischema: layout,
		data: {
			title: "WebRTC viewer",
			iceServersUrls: DEFAULT_ICE_SERVERS,
		},
		Component: (data: WebrtcVideoStreamProps) => (
			<WebrtcVideoStream
				title={data.title}
				topic={data.topic}
				iceServersUrls={data.iceServersUrls}
			/>
		),
	};
}

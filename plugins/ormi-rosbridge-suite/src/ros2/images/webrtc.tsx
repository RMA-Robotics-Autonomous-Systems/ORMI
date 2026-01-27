import { RosBridgeSuiteDataSourceSettings } from "../../rosbridge-suite-source";
import { ControlElement, VerticalLayout } from "@jsonforms/core";

import {
  SelectedTopic,
  DatasourceTopic,
  DatasourceTopicFilter,
} from "@workspace/ormi-core/datasources";
import { TopicSelectElement } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { CctvIcon, RotateCcw, RotateCw } from "lucide-react";
import React, { useEffect, useRef } from "react";

interface WebrtcRos2VideoStreamProps {
  title: string;
  topic: SelectedTopic;
  iceServersUrls?: string[];
}

const getHostFromWSUrl = (url: string) => {
  const urlParts = url.split("/");
  return urlParts[2]!.split(":")[0]!;
};

const WebrtcRos2VideoStream = (props: WebrtcRos2VideoStreamProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cleanupRef = useRef<boolean>(false);

  // check if the topic source is compatible with this widget, it must be coming from ROS2 datasource
  // for that the topic source must be of type RosBridgeSuiteDataSourceSettings
  const isCompatibleWithTopicSource = true;

  const ros2Definition = props.topic
    .source as unknown as RosBridgeSuiteDataSourceSettings;

  const { setButtonItem, removeButtonItem } = useButtonHolder();

  // Extract stable values for effect dependencies
  const host = getHostFromWSUrl(ros2Definition.url);
  const topicName = props.topic.topic;
  const iceServersUrls = props.iceServersUrls;

  const [rotation, setRotation] = React.useState(0);
  const [connectionStatus, setConnectionStatus] = React.useState("connecting");

  // WebRTC connection effect - only reconnect when connection parameters change
  useEffect(() => {
    // Reset cleanup flag
    cleanupRef.current = false;

    // Prevent multiple connections during development hot reload
    if (pcRef.current) {
      console.log("Cleaning up existing connection before creating new one");
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

    // Enhanced event handlers for debugging
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${pc.iceConnectionState}`);
      setConnectionStatus(pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state: ${pc.connectionState}`);
      setConnectionStatus(pc.connectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering state: ${pc.iceGatheringState}`);
    };

    pc.ontrack = (event: RTCTrackEvent) => {
      console.log("Received track:", event.track.kind);
      console.log("Track enabled:", event.track.enabled);
      console.log("Track readyState:", event.track.readyState);
      console.log("Number of streams:", event.streams.length);

      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        console.log("Video stream attached to video element");

        // Check stream properties
        const stream = event.streams[0];
        console.log("Stream active:", stream.active);
        console.log("Stream tracks:", stream.getTracks().length);

        // Add detailed video element event listeners
        const video = videoRef.current;

        video.onloadstart = () => console.log("Video: loadstart");
        video.onloadeddata = () => console.log("Video: loadeddata");
        video.oncanplay = () => console.log("Video: canplay");
        video.onplay = () => console.log("Video: play");
        video.onplaying = () => console.log("Video: playing");
        video.onwaiting = () => console.log("Video: waiting");
        video.onstalled = () => console.log("Video: stalled");
        video.onemptied = () => console.log("Video: emptied");
        video.onended = () => console.log("Video: ended");

        video.onloadedmetadata = () => {
          console.log("Video metadata loaded");
          console.log(
            "Video dimensions:",
            video.videoWidth,
            "x",
            video.videoHeight,
          );
          console.log("Video duration:", video.duration);
          console.log("Video ready state:", video.readyState);
        };

        // Force play (sometimes needed)
        video.play().catch((e) => console.log("Auto-play prevented:", e));
      }
    };

    const negotiate = async () => {
      try {
        // Check if component is being cleaned up
        if (cleanupRef.current) {
          console.log("Component cleanup in progress, aborting negotiation");
          return;
        }

        console.log("Starting WebRTC negotiation...");

        const offer = await pc.createOffer();

        if (cleanupRef.current) {
          console.log("Cleanup during offer creation, aborting");
          return;
        }

        await pc.setLocalDescription(offer);

        console.log("Local description set, waiting for ICE gathering...");

        // Wait for ICE gathering to complete with a timeout
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn("ICE gathering timed out, proceeding anyway");
            resolve();
          }, 5000);

          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            console.log("ICE gathering completed");
            resolve();
          } else {
            const checkState = () => {
              if (pc.iceGatheringState === "complete" || cleanupRef.current) {
                pc.removeEventListener("icegatheringstatechange", checkState);
                clearTimeout(timeout);
                if (!cleanupRef.current) {
                  console.log("ICE gathering completed");
                }
                resolve();
              }
            };
            pc.addEventListener("icegatheringstatechange", checkState);
          }
        });

        if (cleanupRef.current) {
          console.log("Cleanup during ICE gathering, aborting");
          return;
        }

        console.log(
          `Sending offer to http://${host}:8080/offer for topic: ${topicName}`,
        );

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
          console.log("Cleanup during server request, aborting");
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Server responded with ${response.status}: ${errorText}`,
          );
        }

        const answer = (await response.json()) as any;
        console.log("Received answer from server");

        if (cleanupRef.current) {
          console.log("Cleanup before setting remote description, aborting");
          return;
        }

        await pc.setRemoteDescription(answer);
        console.log("Remote description set, WebRTC negotiation complete");
      } catch (error) {
        if (!cleanupRef.current) {
          console.error("Negotiation failed:", error);
          setConnectionStatus("failed");
        }
      }
    };

    negotiate();

    return () => {
      console.log("Cleaning up WebRTC connection");
      cleanupRef.current = true;

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [host, topicName, iceServersUrls]); // Only reconnect when these specific values change

  // Button registration effect - separate from WebRTC connection
  useEffect(() => {
    setButtonItem(
      "webrtc-viewer-widget-rotate-ccw",
      <Button
        variant={"ghost"}
        onClick={() => {
          setRotation((r) => (r - 90) % 360);
        }}
      >
        <RotateCcw />
      </Button>,
    );

    setButtonItem(
      "webrtc-viewer-widget-rotate-cw",
      <Button
        variant={"ghost"}
        onClick={() => {
          setRotation((r) => (r + 90) % 360);
        }}
      >
        <RotateCw />
      </Button>,
    );

    return () => {
      removeButtonItem("webrtc-viewer-widget-rotate-cw");
      removeButtonItem("webrtc-viewer-widget-rotate-ccw");
    };
  }, []); // Buttons only need to be registered once

  return (
    <div>
      {isCompatibleWithTopicSource && (
        <div>
          <div
            style={{ marginBottom: "10px", fontSize: "12px", color: "#666" }}
          >
            Connection Status: {connectionStatus}
            {connectionStatus === "failed" && (
              <span style={{ color: "red", marginLeft: "10px" }}>
                Check browser console for details
              </span>
            )}
          </div>
          <video
            id="video"
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
            onLoadedMetadata={() => {
              console.log("Video metadata loaded");
            }}
            onError={(e) => {
              console.error("Video element error:", e);
            }}
          />
        </div>
      )}
      {!isCompatibleWithTopicSource && (
        <div>
          <h3>Topic source is not compatible with this widget</h3>
          <p>
            Topic must be from ROS2 datasource and have a Webrtc server running
          </p>
        </div>
      )}
    </div>
  );
};

export default WebrtcRos2VideoStream;

export function WebRtcRos2Definition() {
  const pluginsManager = usePluginsManager();

  const title: ControlElement = {
    type: "Control",
    scope: "#/properties/title",
  };

  const topic: TopicSelectElement = {
    type: "TopicSelect",
    scope: "#/properties/topic",
    options: {
      dataRequirements: {
        accepts: ["sensor_msgs/Image", "sensor_msgs/CompressedImage", "Image"], // Accept various image types
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

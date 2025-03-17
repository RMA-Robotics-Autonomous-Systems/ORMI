import { useButtonHolder, Button } from 'ormi-core/components';
import { DatasourceTopic, DatasourceTopicFilter, SelectedTopic } from 'ormi-core/datasources';
import { AsyncTopicControlType } from 'ormi-core/jsonforms';
import { usePluginsManager, PluginsHooks } from 'ormi-core/plugins';
import { RosBridgeSuiteDataSourceSettings } from '../../rosbridge-suite-source';
import { ControlElement, VerticalLayout } from '@jsonforms/core';
import { CctvIcon, RotateCcw, RotateCw } from 'lucide-react';
import React, { useEffect, useRef } from 'react';

interface WebrtcRos2VideoStreamProps {
    title: string;
    topic: SelectedTopic;
    iceServersUrls?: string[];
}

const getHostFromWSUrl = (url: string) => {

    const urlParts = url.split('/');
    return urlParts[2].split(':')[0];
};


const WebrtcRos2VideoStream = (props: WebrtcRos2VideoStreamProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    // check if the topic source is compatible with this widget, it must be coming from ROS2 datasource
    // for that the topic source must be of type RosBridgeSuiteDataSourceSettings
    const isCompatibleWithTopicSource = true;

    const ros2Definition = props.topic.source as unknown as RosBridgeSuiteDataSourceSettings;

    const { setButtonItem, removeButtonItem } = useButtonHolder();

    const host = getHostFromWSUrl(ros2Definition.url);
    const topic = props.topic.topic;

    const [rotation, setRotation] = React.useState(0);

    useEffect(() => {

        const pc = new RTCPeerConnection({
            iceServers: props.iceServersUrls?.map((url) => ({ urls: url }))
        });

        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (event: RTCTrackEvent) => {
            if (videoRef.current) {
                videoRef.current.srcObject = event.streams[0];
            }
        };

        const negotiate = async () => {
            try {

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                // Wait for ICE gathering to complete with a timeout
                await new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => {
                        console.warn('ICE gathering timed out');
                        resolve();
                    }, 1000); // Adjust timeout as needed

                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        const checkState = () => {
                            if (pc.iceGatheringState === 'complete') {
                                pc.removeEventListener('icegatheringstatechange', checkState);
                                clearTimeout(timeout);
                                resolve();
                            }
                        }
                        pc.addEventListener('icegatheringstatechange', checkState);
                    }
                });


                const response = await fetch(`http://${host}:8080/offer`, {
                    method: 'POST',
                    body: JSON.stringify({
                        sdp: pc.localDescription?.sdp,
                        type: pc.localDescription?.type,
                        topic: topic,
                    }),
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`Server responded with ${response.status}`);
                }

                const answer = await response.json();

                await pc.setRemoteDescription(answer);
            } catch (error) {
                // console.error("Negotiation failed:", error);
            }
        };

        negotiate();

        setButtonItem("webrtc-viewer-widget-rotate-ccw",
            <Button variant={"ghost"} onClick={() => { setRotation((r) => (r - 90) % 360) }}>
                <RotateCcw />
            </Button>
        );

        setButtonItem("webrtc-viewer-widget-rotate-cw",
            <Button variant={"ghost"} onClick={() => { setRotation((r) => (r + 90) % 360) }}>
                <RotateCw />
            </Button>
        );



        return () => {
            removeButtonItem("webrtc-viewer-widget-rotate-cw");
            removeButtonItem("webrtc-viewer-widget-rotate-ccw");
            pc.close();
        };
    }, [props]);

    return (
        <div>
            {isCompatibleWithTopicSource && (<video
                id="video"
                autoPlay
                muted
                playsInline
                ref={videoRef}
                style={{ width: '100%', height: 'auto', transform: `rotate(${rotation}deg)` }}
            />
            )
            }
            {!isCompatibleWithTopicSource && (
                <div>
                    <h3>Topic source is not compatible with this widget</h3>
                    <p>Topic must be from ROS2 datasource and have a Webrtc server running</p>
                </div>)}
        </div>
    );
};

export default WebrtcRos2VideoStream;



export function WebRtcRos2Definition() {

    const pluginsManager = usePluginsManager();

    const title: ControlElement = {
        type: "Control",
        scope: "#/properties/title",
    }

    const topic: AsyncTopicControlType = {
        type: "TopicSelect",
        scope: "#/properties/topic",
        options: {
            asyncFunction: async () => {
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], new DatasourceTopicFilter({
                    source_id: /rosbridge-suite-source/
                }));
            },
            buffer: 1,
        }
    }

    const iceServersUrls: ControlElement = {
        type: "Control",
        scope: "#/properties/iceServersUrls",
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, topic, iceServersUrls],
    }

    return {
        id: 'webrtc-viewer-widget',
        name: 'WebRTC viewer',
        description: 'Display a video stream from a ROS2 topic',
        titleProp: 'title',
        icon: <CctvIcon />,
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    title: 'Title'
                },
                topic: {
                    type: 'object',
                    title: 'Topic',
                },
                iceServersUrls: {
                    type: 'array',
                    title: 'ICE Servers URLs',
                    items: {
                        type: 'string'
                    },
                    default: ['stun:stun.l.google.com:19302']
                }
            },
            required: ['title', 'topic']
        },
        uischema: layout,
        data: {
            title: 'WebRTC viewer',
            iceServersUrls: ['stun:stun.l.google.com:19302']
        },
        Component: (data: WebrtcRos2VideoStreamProps) => (
            <WebrtcRos2VideoStream title={data.title} topic={data.topic} />
        )

    }
}
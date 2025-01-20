import { DatasourceTopic, SelectedTopic } from '@/core/datasources/datasource-interface';
import { AsyncTopicControlType } from '@/core/jsonforms/controls/topic-selector/topic-selector';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';
import { RosBridgeSuiteDataSourceSettings } from '@/plugins/random-data-sources/rosbridge-suite-source';
import { ControlElement, VerticalLayout } from '@jsonforms/core';
import React, { useEffect, useRef } from 'react';

interface WebrtcRos2VideoStreamProps {
    title: string;
    topic: SelectedTopic;
}

const getHostFromWSUrl = (url: string) => {

    const urlParts = url.split('/');
    return urlParts[2].split(':')[0];
};


const WebrtcRos2VideoStream = (props: WebrtcRos2VideoStreamProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    const isCompatibleWithTopicSource = true;// props.topic.source.id === 'rosbridge-suite-source';
    const ros2Definition = props.topic.source as RosBridgeSuiteDataSourceSettings;

    const host = getHostFromWSUrl(ros2Definition.url);
    const topic = props.topic.topic;

    useEffect(() => {

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
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
                console.error("Negotiation failed:", error);
            }
        };

        negotiate();

        return () => {
            pc.close();
        };
    }, []);

    return (
        <div>
            {isCompatibleWithTopicSource && (<video
                id="video"
                autoPlay
                muted
                playsInline
                ref={videoRef}
                style={{ width: '100%', height: 'auto' }}
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
        "type": "TopicSelect",
        "scope": "#/properties/topic",
        "options": {
            "asyncFunction": async () => {
                return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(PluginsHooks.AVAILABLE_TOPICS, [], 'number');
            },
            // "propertyType": "number"
        }
    }

    const layout: VerticalLayout = {
        type: "VerticalLayout",
        elements: [title, topic],
    }

    return {
        id: 'webrtc-viewer-widget',
        name: 'WebRTC viewer',
        description: 'Display a video stream from a ROS2 topic',
        titleProp: 'title',
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
                }
            },
            required: ['title', 'topic']
        },
        uischema: layout,
        data: {
            title: 'WebRTC viewer'
        },
        Component: (data: WebrtcRos2VideoStreamProps) => (
            <WebrtcRos2VideoStream title={data.title} topic={data.topic} />
        )

    }
}
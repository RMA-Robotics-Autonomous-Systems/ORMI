"use client"



import React, { createContext, useContext, ReactNode, useEffect, useRef, useState } from 'react';

import { PluginAction, usePluginsManager } from 'ormi-core/plugins';
import { PluginsHooks } from 'ormi-core/plugins';

import { DatasourceTopic, SelectedTopic } from 'ormi-core/datasources';
import { Spinner, toast } from 'ormi-components';
import { getSchemaFromStringName, IMU, Movement, Vector4 } from 'ormi-core/types';
import { Vector3 } from 'ormi-core/types';
import { JsonSchema } from '@jsonforms/core';

const TelloSourceContext = createContext(null);

export interface TelloSourceSettings {
    id: string;
    title: string;
    enable: boolean;
    ip: string;
}

interface TelloTopic extends DatasourceTopic {
    description?: string;
}

// Tello has multiple topics, that can receive data or publish data, but all can't do both, some can
const telloTopics: Record<string, TelloTopic> = {
    "speed": {
        topic: 'speed',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'Movement',
        rawType: 'Movement',
        bufferSize: 1,
        description: 'Speed data (vgx, vgy, vgz)'
    } as TelloTopic,
    "battery": {
        topic: 'battery',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'number',
        rawType: 'number',
        bufferSize: 1,
        description: 'Battery percentage'
    } as TelloTopic,
    "temps": {
        topic: 'temps',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'number',
        rawType: 'number',
        bufferSize: 1,
        description: 'Average temperature in °C'
    } as TelloTopic,
    "altitude": {
        topic: 'altitude',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'number',
        rawType: 'number',
        bufferSize: 1,
        description: 'Height in cm'
    } as TelloTopic,
    "imu": {
        topic: 'imu',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'IMU',
        rawType: 'IMU',
        bufferSize: 1,
        description: 'IMU data (orientation and acceleration)'
    } as TelloTopic,
    "tof": {
        topic: 'tof',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'number',
        rawType: 'number',
        bufferSize: 1,
        description: 'Time of flight distance in cm'
    } as TelloTopic,
    "movement": {
        topic: 'movement',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'Movement',
        rawType: 'Movement',
        bufferSize: 1,
        description: 'Movement data (combined from various fields)'
    } as TelloTopic,
    "baro": {
        topic: 'baro',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'number',
        rawType: 'number',
        bufferSize: 1,
        description: 'Barometer measurement in cm'
    } as TelloTopic,
    "time": {
        topic: 'time',
        datasource_id: '',
        source: {} as TelloSourceSettings,
        type: 'number',
        rawType: 'number',
        bufferSize: 1,
        description: 'Motor time in seconds'
    } as TelloTopic
}


interface TelloState {
    imu: IMU,
    speed: Movement,
    altitude: number,
    battery: number
}

interface TelloAdvertiser {
    count: number;
    topic: string;
    action: PluginAction;
}

// Convert Euler angles (in radians) to quaternion
const toQuaternion = (vector: Vector3): Vector4 => {
    const cy = Math.cos(vector.z * 0.5);
    const sy = Math.sin(vector.z * 0.5);
    const cp = Math.cos(vector.x * 0.5);
    const sp = Math.sin(vector.x * 0.5);
    const cr = Math.cos(vector.y * 0.5);
    const sr = Math.sin(vector.y * 0.5);

    return {
        w: cy * cp * cr + sy * sp * sr,
        x: cy * sp * cr - sy * cp * sr,
        y: cy * cp * sr + sy * sp * cr,
        z: sy * cp * cr - cy * sp * sr
    };
}

const parseRaw = (telloMsg: any): TelloState => {
    // parse the telloMsg into a telloState

    if (!telloMsg || !telloMsg.parsed) {
        return {} as TelloState;
    }

    const parsed = telloMsg.parsed;

    // Convert IMU data
    const imu: IMU = {
        linear_acceleration: {
            x: parsed.agx || 0,
            y: parsed.agy || 0,
            z: parsed.agz || 0
        },
        angular_velocity: { x: 0, y: 0, z: 0 },
        orientation: toQuaternion({
            x: parsed.pitch ? parsed.pitch * (Math.PI / 180) : 0,
            y: parsed.roll ? parsed.roll * (Math.PI / 180) : 0,
            z: parsed.yaw ? parsed.yaw * (Math.PI / 180) : 0
        })
    };

    // Convert speed data
    const speed: Movement = {
        linear: {
            x: parsed.vgx || 0,
            y: parsed.vgy || 0,
            z: parsed.vgz || 0,
        },
        angular: { x: 0, y: 0, z: 0 }
    };

    return {
        imu,
        speed,
        altitude: parsed.h || 0,
        battery: parsed.bat || 0
    } as TelloState;
}

/*

Received message: {"origin": "state", "raw": "pitch:-1;roll:0;yaw:0;vgx:0;vgy:0;vgz:0;templ:67;temph:68;tof:10;h:0;bat:94;baro:-8.24;time:0;agx:-26.00;agy:7.00;agz:-997.00;\r\n", "parsed": {"pitch": -1.0, "roll": 0.0, "yaw": 0.0, "vgx": 0.0, "vgy": 0.0, "vgz": 0.0, "templ": 67.0, "temph": 68.0, "tof": 10.0, "h": 0.0, "bat": 94.0, "baro": -8.24, "time": 0.0, "agx": -26.0, "agy": 7.0, "agz": -997.0}, "timestamp": 1746616192.9981532, "fields": {"pitch": {"value": -1.0, "description": "Attitude pitch in degrees"}, "roll": {"value": 0.0, "description": "Attitude roll in degrees"}, "yaw": {"value": 0.0, "description": "Attitude yaw in degrees"}, "vgx": {"value": 0.0, "description": "Speed on X axis"}, "vgy": {"value": 0.0, "description": "Speed on Y axis"}, "vgz": {"value": 0.0, "description": "Speed on Z axis"}, "templ": {"value": 67.0, "description": "Lowest temperature in \u00b0C"}, "temph": {"value": 68.0, "description": "Highest temperature in \u00b0C"}, "tof": {"value": 10.0, "description": "Time of flight distance in cm"}, "h": {"value": 0.0, "description": "Height in cm"}, "bat": {"value": 94.0, "description": "Battery percentage"}, "baro": {"value": -8.24, "description": "Barometer measurement in cm"}, "time": {"value": 0.0, "description": "Motor time in seconds"}, "agx": {"value": -26.0, "description": "Acceleration on X axis"}, "agy": {"value": 7.0, "description": "Acceleration on Y axis"}, "agz": {"value": -997.0, "description": "Acceleration on Z axis"}}}
*/


// Create a provider component
const TelloSourceProvider = (children: ReactNode, props: TelloSourceSettings) => {

    const pluginsManager = usePluginsManager();

    const subscribersCountRef = useRef(new Map<string, number>());

    const connectionRef = useRef<Promise<boolean> | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    const messageQueueRef = useRef<string[]>([]);
    const isConnectedRef = useRef(false);


    const datasource_id = props.id;
    const available_topics_handler = `${datasource_id}-available-topics`;
    const subscribe_hook = `${datasource_id}-subscribe`;
    const unsubscribe_hook = `${datasource_id}-unsubscribe`;
    const definition_hook = `${datasource_id}-definition`;

    const advertise_hook = `${datasource_id}-advertise`;
    const unadvertise_hook = `${datasource_id}-unadvertise`;
    const available_types = `${datasource_id}-available-types`;

    const advertiserRef = useRef<Map<string, TelloAdvertiser>>(new Map<string, TelloAdvertiser>());

    const [initialized, setInitialized] = useState(false);

    useEffect(() => {

        // setup the connection inside a timeout to avoid 
        // the effect of react strict mode
        const waitTimeOut = setTimeout(() => {

            // create a websocket) connection to the tello
            connectionRef.current = new Promise((resolve, reject) => {
                socketRef.current = new WebSocket(`ws://${props.ip}:8005`);

                socketRef.current.onopen = () => {
                    isConnectedRef.current = true;

                    socketRef.current?.send('command');
                    resolve(true);
                    setInitialized(true);
                };

                socketRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

                socketRef.current.onclose = () => {
                    isConnectedRef.current = false;
                };

                // Handle incoming messages
                socketRef.current.onmessage = (event) => {
                    const message = event.data;

                    const msg = JSON.parse(message);

                    if (msg["origin"] == "state") {
                        const telloState = parseRaw(msg);

                        // check for the subscribed topic (count >= 1), and publish the data on the hook
                        // pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, data, Date.now());

                        // Loop through each topic we need to publish data for
                        Object.keys(telloTopics).forEach(topicKey => {
                            // Check if there are subscribers for this topic
                            if (subscribersCountRef.current.has(topicKey)) {
                                const topic = telloTopics[topicKey];

                                // Based on the topic type, publish the appropriate data
                                switch (topicKey) {
                                    case 'imu':
                                        pluginsManager.doAction(`${datasource_id}-${topicKey}-published`, telloState.imu, Date.now());
                                        break;
                                    case 'speed':
                                        pluginsManager.doAction(`${datasource_id}-${topicKey}-published`, telloState.speed, Date.now());
                                        break;
                                    case 'altitude':
                                        pluginsManager.doAction(`${datasource_id}-${topicKey}-published`, telloState.altitude, Date.now());
                                        break;
                                    case 'battery':
                                        pluginsManager.doAction(`${datasource_id}-${topicKey}-published`, telloState.battery, Date.now());
                                        break;
                                    case 'tof':
                                        if (msg.parsed.tof !== undefined) {
                                            pluginsManager.doAction(`${datasource_id}-${topicKey}-published`, msg.parsed.tof, Date.now());
                                        }
                                        break;
                                    case 'temps':
                                        if (msg.parsed.templ !== undefined) {
                                            pluginsManager.doAction(`${datasource_id}-${topicKey}-published`,
                                                (msg.parsed.templ + msg.parsed.temph) / 2, Date.now());
                                        }
                                        break;
                                    case 'time':
                                        if (msg.parsed.time !== undefined) {
                                            pluginsManager.doAction(`${datasource_id}-${topicKey}-published`, msg.parsed.time, Date.now());
                                        }
                                        break;
                                    case 'baro':
                                        if (msg.parsed.baro !== undefined) {
                                            pluginsManager.doAction(`${datasource_id}-${topicKey}-published`, msg.parsed.baro, Date.now());
                                        }
                                        break;
                                }
                            }
                        });


                    } else if (msg["origin"] == "command") {
                        toast("Tello says: " + msg["msg"]);
                    }


                    // console.log('Received message:', message);
                }

            });

            // create a custom event : 
            // datasource_id-topic-published
            pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
                id: available_topics_handler,
                priority: 10,
                filter: (topics: DatasourceTopic[]) => {

                    // add all the topics to the list and fill the missing fields
                    Object.keys(telloTopics).forEach((topic) => {
                        const telloTopic = telloTopics[topic];
                        telloTopic.datasource_id = datasource_id;
                        telloTopic.source = props;
                        telloTopic.topic = topic;
                        telloTopic.bufferSize = 1;

                        // check if the topic is already in the list
                        const existingTopic = topics.find((t) => t.topic === topic);
                        if (!existingTopic) {
                            topics.push(telloTopic);
                        }
                    });

                    return topics;
                }
            });


            pluginsManager.addFilter(`${datasource_id}-tello-connection`, {
                id: `${datasource_id}-tello-connection`,
                filter: (_obj = {}) => {
                    return socketRef.current;
                },
                priority: 1,
            });

            pluginsManager.addAction(subscribe_hook, {
                id: subscribe_hook,
                priority: 10,
                action: (topic: SelectedTopic) => {

                    // check if the topic exist
                    // Check if the topic exists in the defined tello topics
                    if (!telloTopics[topic.topic]) {
                        console.warn(`Topic ${topic.topic} does not exist in Tello datasource`);
                        return;
                    }

                    // increase the counter if it exist, create the counter if it doesn't
                    if (subscribersCountRef.current.has(topic.topic)) {
                        const count = subscribersCountRef.current.get(topic.topic) || 0;
                        subscribersCountRef.current.set(topic.topic, count + 1);
                    } else {
                        subscribersCountRef.current.set(topic.topic, 1);
                    }
                }
            });

            pluginsManager.addAction(unsubscribe_hook, {
                id: unsubscribe_hook,
                priority: 10,
                action: (topic: SelectedTopic, ignoreCount = false) => {

                    // check if the topic exists
                    if (!telloTopics[topic.topic]) {
                        console.warn(`Topic ${topic.topic} does not exist in Tello datasource`);
                        return;
                    }

                    // decrease the counter if ignoreCount is false
                    if (!ignoreCount && subscribersCountRef.current.has(topic.topic)) {
                        const count = subscribersCountRef.current.get(topic.topic) || 0;
                        if (count > 1) {
                            subscribersCountRef.current.set(topic.topic, count - 1);
                            return;
                        }
                    }

                    // remove the counter when it reaches 0 or when ignoreCount is true
                    subscribersCountRef.current.delete(topic.topic);
                }
            });

            pluginsManager.addFilter(definition_hook, {
                id: definition_hook,
                priority: 10,
                filter: (definition: JsonSchema, topic: DatasourceTopic) => {
                    // return a JsonSchema representing the datasource
                    return getSchemaFromStringName(topic.type)
                }
            });

            console.log('adding advertise', advertise_hook);
            pluginsManager.addFilter(advertise_hook, {
                id: advertise_hook,
                priority: 10,
                filter: async (topic: SelectedTopic): Promise<boolean> => {
                    // Only the movement topic can be advertised
                    if (topic.topic !== 'movement') {
                        console.warn(`Topic ${topic.topic} cannot be advertised`);
                        return false;
                    }

                    // check if the publiser already exist
                    if (advertiserRef.current && advertiserRef.current.has(topic.topic)) {
                        const advertiser = advertiserRef.current.get(topic.topic);
                        if (advertiser) {
                            advertiser.count = (advertiser.count || 0) + 1;
                            console.warn(`Advertiser ${topic.topic} already exist, count: ${advertiser.count}`);
                        }
                        return true;
                    }


                    const hook = `${datasource_id}-${topic.topic}-publish`;

                    // create the advertiser
                    const advertiser: TelloAdvertiser = {
                        count: 1,
                        topic: topic.topic,
                        action: {
                            id: hook,
                            priority: 10,
                            action: (selected_topic: SelectedTopic, message: Movement, webtype: any) => {
                                // check if the socket is connected
                                if (isConnectedRef.current && socketRef.current) {
                                    // send the data to the tello

                                    /*
                                        rc a b c d
                                        a : left right (-100 to 100)
                                        b : forward backward (-100 to 100)
                                        c : up down (-100 to 100)
                                        d : yaw (-100 to 100)
    
                                        movement.linear.x -> backward forward (-1 to 1)
                                        movement.linear.y -> left right (-1 to 1)
                                        movement.linear.z -> up down (-1 to 1)
                                        movement.angular.z -> yaw (-1 to 1)
                                    */

                                    // convert the message to the tello format
                                    const rc = "rc " + message.linear.y * 100 + " " + message.linear.x * 100 + " " + message.linear.z * 100 + " " + message.angular.z * 100;

                                    socketRef.current.send(rc);
                                } else {
                                    console.warn(`Tello is not connected`);
                                }
                            }

                        }
                    };


                    // add the advertiser to the list
                    if (advertiserRef.current) {
                        advertiserRef.current.set(topic.topic, advertiser);
                    }
                    // add the action to the plugins manager
                    pluginsManager.addAction(hook, advertiser.action);

                    console.log(`Advertiser ${topic.topic} created`);
                    return true;
                }
            });

            console.log('adding unadvertise', unadvertise_hook);
            pluginsManager.addAction(unadvertise_hook, {
                id: unadvertise_hook,
                priority: 10,
                action: async (topic: DatasourceTopic, ignoreCount: boolean = false) => {

                    // Only the movement topic can be unadvertised
                    if (topic.topic !== 'movement') {
                        console.warn(`Topic ${topic.topic} cannot be unadvertised`);
                        return;
                    }

                    // check if the advertiser exist
                    if (advertiserRef.current && advertiserRef.current.has(topic.topic)) {
                        const advertiser = advertiserRef.current.get(topic.topic);
                        if (advertiser) {
                            advertiser.count = (advertiser.count || 0) - 1;

                            if (advertiser.count <= 0 || ignoreCount) {
                                // remove the action from the plugins manager
                                pluginsManager.removeAction(`${datasource_id}-${topic.topic}-publish`);
                                // remove the advertiser from the list
                                advertiserRef.current.delete(topic.topic);
                                console.log(`Advertiser ${topic.topic} removed`);
                            } else {
                                // update the advertiser
                                advertiserRef.current.set(topic.topic, advertiser);
                                console.warn(`Advertiser ${topic.topic} already exist, count: ${advertiser.count}`);
                            }
                        }
                    }

                }
            });


            pluginsManager.addFilter(available_types, {
                id: available_types,
                filter: async (types: string[]) => {
                    try {
                        const all_types = ["movement", "IMU", "number"];
                        return [...types, ...all_types];
                    } catch (error) {
                        return types;
                    }
                },
                priority: 100,
            });

        }, 1000);


        return () => {
            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeFilter(`${datasource_id}-tello-connection`);
            pluginsManager.removeFilter(definition_hook);
            pluginsManager.removeAction(subscribe_hook);
            pluginsManager.removeAction(unsubscribe_hook);

            pluginsManager.removeFilter(advertise_hook);
            pluginsManager.removeAction(unadvertise_hook);
            pluginsManager.removeFilter(available_types);

            // remove all advertisers actions
            if (advertiserRef.current) {
                advertiserRef.current.forEach((advertiser) => {
                    pluginsManager.removeAction(`${datasource_id}-${advertiser.topic}-publish`);
                });
            }
            subscribersCountRef.current.clear();
            advertiserRef.current.clear();

            // Remove actions after cleanup

            clearTimeout(waitTimeOut);
            // Close the WebSocket connection if it exists
            if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
            }

        };
    }, [props]);

    return (
        <TelloSourceContext.Provider value={null}>
            {initialized && children}
            {!initialized && <Spinner />}
        </TelloSourceContext.Provider>
    );
};

// Create a custom hook to use the context
const useRandomProvider = () => {
    const context = useContext(TelloSourceContext);
    if (context === undefined) {
        throw new Error('useRandomProvider must be used within a TelloSourceProvider');
    }
    return context;
};

export { TelloSourceProvider, useRandomProvider };
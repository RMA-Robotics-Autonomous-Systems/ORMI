"use client"
/*
    Provider that creates a datasets with random data

    data -> 
        [source] -> {
            label: 'current_time',
            data: [random data]    
        },
        [source] -> {
            label: 'current_time',
            data: [random data]    
        },
*/

import React, { createContext, ReactNode, useEffect, useRef } from 'react';

import * as ROSLIB from 'roslib'

import { usePluginsManager } from 'ormi-core/plugins';
import { PluginsHooks } from 'ormi-core/plugins';

import { DatasourceProviderSettings, DatasourceTopic, SelectedTopic } from 'ormi-core/datasources';
import { toast, Spinner } from 'ormi-core/components';
import { JsonSchema } from '@jsonforms/core';
import { decodeTypeDefs } from './ros2-message-parser';
import { UnifiedConverter } from './ros2/unified-converter';

const RosBridgeSuiteSourceContext = createContext(null);

// time to wait before trying to connect to the ROSBridge Suite
const WAIT_FOR_CONNECTION = 500;

interface RosBridgeSuiteDataSourceSettings extends DatasourceProviderSettings {
    url: string;
    reconnectTimeout: number;
    toasts: boolean;
}

export interface ROSTopic {
    topic: string;
    type: string;
}

export async function GetTopicType(ROS: ROSLIB.Ros, topic: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        ROS.getTopicType(topic, (type: string) => {
            resolve(type);
        }, (error: any) => {
            reject(error);
        });
    });
}


export async function GetTopicsList(ROS: ROSLIB.Ros): Promise<ROSTopic[]> {
    return new Promise<ROSTopic[]>((resolve, reject) => {
        ROS.getTopics((results: { topics: string[], types: string[] }) => {

            const topics: ROSTopic[] = [];

            for (let i = 0; i < results.topics.length; i++) {
                topics.push({
                    topic: results.topics[i],
                    type: results.types[i]
                });
            }

            resolve(
                topics
            );

        }, (error: any) => {
            reject(error);
        });
    });
}

export async function GetTopicsAndRawTypes(ROS: ROSLIB.Ros): Promise<Map<string, JsonSchema>> {

    return new Promise<Map<string, JsonSchema>>((resolve, reject) => {

        ROS.getTopicsAndRawTypes((results: { topics: string[], types: string[], typedefs_full_text: string[] }) => {
            const topics = new Map<string, JsonSchema>();

            for (let i = 0; i < results.topics.length; i++) {

                const def = results.typedefs_full_text[i];
                const decoded = decodeTypeDefs(def);    // parse the typedefs into a JsonSchema

                topics.set(results.topics[i], decoded);
            }

            resolve(topics);

        }, (error: any) => {
            reject(error);
        });

    });

}

export async function GetServices(ROS: ROSLIB.Ros): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        ROS.getServices((results: string[]) => {
            resolve(results);
        }, (error: any) => {
            reject(error);
        });
    });
}

export async function GetAllTopicTypes(ROS: ROSLIB.Ros): Promise<string[]> {
    // return all the types in the system
    return new Promise<string[]>(async (resolve, reject) => {

        const services = await GetServices(ROS);

        // find the service that contains : '/rosapi/interfaces'
        const service_name = services.find((service) => service.includes('/rosapi/interfaces'));

        if (!service_name) {
            reject("Service not found");
            return;
        }

        const addTwoIntsClient = new ROSLIB.Service({
            ros: ROS,
            name: service_name,
            serviceType: 'rosapi_msgs/srv/Interfaces'
        });

        const request = new ROSLIB.ServiceRequest({});

        addTwoIntsClient.callService(request, function (result) {
            resolve(result.interfaces);
        }, function (error) {
            reject(error);
        });
    });
}

type RosTopicAndCounter = {
    topic: ROSLIB.Topic,
    counter: number,
    hook: string
}

// Create a provider component
const RosBridgeSuiteSourceProvider = (children: ReactNode, props: RosBridgeSuiteDataSourceSettings) => {
    const pluginsManager = usePluginsManager();

    const subscribersRef = useRef(new Map<string, ROSLIB.Topic>());
    const subscribersCountRef = useRef(new Map<string, number>());

    // constant for the datasource
    const datasource_id = props.id;
    const available_topics_handler = `${datasource_id}-available-topics`;
    const subscribe_hook = `${datasource_id}-subscribe`;
    const unsubscribe_hook = `${datasource_id}-unsubscribe`;
    const definition_hook = `${datasource_id}-definition`;
    const advertise_hook = `${datasource_id}-advertise`;
    const unadvertise_hook = `${datasource_id}-unadvertise`;
    const available_types = `${datasource_id}-available-types`;


    // ROS Websocket
    const ROSRef = useRef<ROSLIB.Ros | null>(null);

    const connectionRef = useRef<Promise<boolean> | null>(null);
    const [connected, setConnected] = React.useState(false);

    const [retry, setRetry] = React.useState(0);    // force re-render to re-connect

    const ros_publishers = useRef(new Map<string, RosTopicAndCounter>()).current = new Map<string, RosTopicAndCounter>();

    useEffect(() => {

        if (!props.enable) {
            setConnected(true);     // allow to render children
            return;
        }

        const waitTimeOut = setTimeout(() => {
            connectionRef.current = new Promise<boolean>((resolve, reject) => {
                if (!ROSRef.current || !ROSRef.current.isConnected) {
                    const ros = new ROSLIB.Ros({
                        url: props.url
                    });

                    ros.on('connection', () => {

                        if (props.toasts) {
                            toast({
                                title: `Connected to ${props.title}`,
                                description: `Connection established with ${props.url}`,
                            });
                        }


                        setConnected(true);
                        resolve(true);
                    });

                    ros.on('error', (error) => {
                        if (props.toasts) {
                            toast({
                                title: `Error in ${props.title}`,
                                description: `Failed to connect to ${props.url}`,
                                variant: 'destructive'
                            });
                        }
                        setConnected(false);
                        reject(error);
                    });

                    ros.on('close', () => {

                        if (props.toasts) {
                            toast({
                                title: `Disconnected from ${props.title}`,
                            });
                        }
                        setTimeout(() => {
                            setRetry(retry + 1);
                        }, props.reconnectTimeout * 1000);

                        setConnected(false);
                        resolve(false);
                    });

                    ROSRef.current = ros;
                }
            });

            pluginsManager.addFilter(`${datasource_id}-ros-2-connection`, {
                id: `${datasource_id}-ros-2-connection`,
                filter: (_obj = {}) => {
                    return ROSRef.current;
                },
                priority: 1,
            });

            // Register plugin handlers
            pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
                id: available_topics_handler,
                filter: async (topics) => {
                    try {
                        await connectionRef.current;
                        const rosTopics = await GetTopicsList(ROSRef.current!);

                        return [...topics, ...rosTopics.map((topic) => ({
                            topic: topic.topic,
                            datasource_id: "rosbridge-suite-source",
                            source: props,
                            type: UnifiedConverter.getWebappTypeFromROSType(topic.type) || '',
                            rawType: topic.type
                        }))];
                    } catch (error) {
                        return topics;
                    }
                },
                priority: 100,
            });

            pluginsManager.addAction(subscribe_hook, {
                id: subscribe_hook,
                action: async (topic: DatasourceTopic) => {
                    try {
                        await connectionRef.current;

                        if (subscribersRef.current.has(topic.topic)) {
                            subscribersCountRef.current.set(
                                topic.topic,
                                (subscribersCountRef.current.get(topic.topic) || 0) + 1
                            );
                            return;
                        }

                        // const topicType = await GetTopicType(ROSRef.current!, topic.topic);
                        const subscriber = new ROSLIB.Topic({
                            ros: ROSRef.current!,
                            name: topic.topic,
                            messageType: topic.rawType,
                        });

                        subscriber.subscribe((message: any) => {

                            // convert the incoming message to webapp format
                            const convertedMessage = UnifiedConverter.convertToWebapp(message, topic.type, topic.rawType);

                            pluginsManager.doAction(
                                `${datasource_id}-${topic.topic}-published`,
                                convertedMessage,
                                Date.now()
                            );
                        });

                        subscribersRef.current.set(topic.topic, subscriber);
                        subscribersCountRef.current.set(topic.topic, 1);
                    } catch (error) {
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: "Failed to subscribe to topic",
                                variant: "destructive",
                            });
                        }
                    }
                },
                priority: 100,
            });

            pluginsManager.addAction(unsubscribe_hook, {
                id: unsubscribe_hook,
                action: async (topic: DatasourceTopic, ignoreCount: boolean = false) => {
                    try {
                        await connectionRef.current;

                        if (!subscribersRef.current.has(topic.topic)) {
                            return;
                        }

                        const count = subscribersCountRef.current.get(topic.topic) || 0;
                        subscribersCountRef.current.set(topic.topic, count - 1);

                        if (count <= 1 || ignoreCount) {
                            const subscriber = subscribersRef.current.get(topic.topic);
                            subscriber!.unsubscribe();
                            subscribersRef.current.delete(topic.topic);
                            subscribersCountRef.current.delete(topic.topic);

                        }


                    } catch (error) {
                        console.error("Unsubscribe error:", error);
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: "Failed to unsubscribe from topic",
                                variant: "destructive",
                            });
                        }
                    }
                },

                priority: 100,
            });

            pluginsManager.addFilter(definition_hook, {
                id: definition_hook,
                priority: 10,
                filter: async (definition: JsonSchema, topic: DatasourceTopic) => {
                    // return a JsonSchema representing the topic message structure
                    // normally the current definition is empty.

                    const converter = UnifiedConverter.converters[topic.type];
                    if (converter && converter.isPrimitive) {
                        return definition;
                    }

                    // get message definition from ROS
                    const topics_and_raw_types = await GetTopicsAndRawTypes(ROSRef.current!);
                    const current_topic_raw_type = topics_and_raw_types.get(topic.topic);

                    if (!current_topic_raw_type) {
                        return definition;
                    }

                    return current_topic_raw_type;
                }
            });

            pluginsManager.addFilter(advertise_hook, {
                id: advertise_hook,
                filter: async (topic: SelectedTopic) => {
                    try {

                        await connectionRef.current;

                        if (ros_publishers.has(topic.topic)) {
                            const topic_and_counter = ros_publishers.get(topic.topic)!;
                            topic_and_counter.counter++;
                            return true;
                        }

                        const publisher = new ROSLIB.Topic({
                            ros: ROSRef.current!,
                            name: topic.topic,
                            messageType: topic.rawType,
                        });

                        const hook = `${datasource_id}-${topic.topic}-publish`;

                        ros_publishers.set(topic.topic, {
                            topic: publisher,
                            counter: 1,
                            hook: hook
                        });

                        pluginsManager.addAction(hook, {
                            id: hook,
                            action: async (selected_topic: SelectedTopic, message: any, webtype: any) => {
                                try {
                                    const converted = UnifiedConverter.convertToROS2(message, webtype, topic.rawType);

                                    const msg = new ROSLIB.Message(converted);

                                    publisher.publish(msg);

                                } catch (error) {
                                    console.error("Failed to publish message", error);
                                }
                            },
                            priority: 100,
                        });

                        return true;

                    } catch (error) {
                        console.error("Advertise error:", error);
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: "Failed to advertise topic",
                                variant: "destructive",
                            });
                        }
                        return false;
                    }
                },
                priority: 100,

            });

            pluginsManager.addAction(unadvertise_hook, {
                id: unadvertise_hook,
                action: async (topic: DatasourceTopic, ignoreCount: boolean = false) => {
                    try {
                        await connectionRef.current;

                        if (!ros_publishers.has(topic.topic)) {
                            return;
                        }

                        const topic_and_counter = ros_publishers.get(topic.topic)!;
                        if (topic_and_counter.counter <= 1 || ignoreCount) {
                            topic_and_counter.topic.unadvertise();
                            ros_publishers.delete(topic.topic);
                        }

                        topic_and_counter.counter--;

                    } catch (error) {
                        console.error("Unadvertise error:", error);
                        if (props.toasts) {
                            toast({
                                title: "Error",
                                description: "Failed to unadvertise topic",
                                variant: "destructive",
                            });
                        }
                    }
                },
                priority: 100,
            });

            pluginsManager.addFilter(available_types, {
                id: available_types,
                filter: async (types: string[]) => {
                    try {
                        await connectionRef.current;
                        const all_types = await GetAllTopicTypes(ROSRef.current!);
                        return [...types, ...all_types];
                    } catch (error) {
                        return types;
                    }
                },
                priority: 100,
            });

        }, WAIT_FOR_CONNECTION);

        const disconnect = async () => {
            if (!connectionRef.current) {
                return;
            }

            await connectionRef.current;

            if (ROSRef.current && ROSRef.current.isConnected) {
                ROSRef.current.close();
            }
        }

        return () => {
            clearTimeout(waitTimeOut);

            if (!connectionRef.current) {
                return;
            }

            pluginsManager.removeFilter(`${datasource_id}-ros-2-connection`);
            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeAction(subscribe_hook);
            pluginsManager.removeAction(unsubscribe_hook);
            pluginsManager.removeFilter(definition_hook);
            pluginsManager.removeFilter(advertise_hook);
            pluginsManager.removeAction(unadvertise_hook);
            pluginsManager.removeFilter(available_types);

            // unsubscribe from all topics
            subscribersRef.current.forEach((subscriber) => {
                subscriber.unsubscribe();
            });

            // unadvertise all topics and remove hookks
            ros_publishers.forEach((topic_and_counter) => {
                // if (topic_and_counter.counter > 1) {
                //     topic_and_counter.counter--;
                //     return;
                // }

                topic_and_counter.topic.unadvertise();
                pluginsManager.removeAction(topic_and_counter.hook);
            });


            subscribersRef.current.clear();
            subscribersCountRef.current.clear();

            disconnect();
        }

    }, [retry, props]);


    return (
        <RosBridgeSuiteSourceContext.Provider value={null}>
            {connected && children}
            {!connected && <Spinner />}
        </RosBridgeSuiteSourceContext.Provider>
    );

}

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };
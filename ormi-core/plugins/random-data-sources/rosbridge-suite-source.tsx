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
"use client";

import React, { createContext, ReactNode, useEffect, useRef } from 'react';

import ROSLIB from 'roslib';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';

import { DatasourceProviderSettings, DatasourceTopic } from '@/core/datasources/datasource-interface';
import { toast } from '@/hooks/use-toast';
import { JsonSchema } from '@jsonforms/core';
import { decodeTypeDefs } from './ros2-message-parser';

const RosBridgeSuiteSourceContext = createContext(null);

// time to wait before trying to connect to the ROSBridge Suite
const WAIT_FOR_CONNECTION = 500;

interface RosBridgeSuiteDataSourceSettings extends DatasourceProviderSettings {
    url: string;
    reconnectTimeout: number;
}

interface ROSTopic {
    topic: string;
    type: string;
}

async function GetTopicType(ROS: ROSLIB.Ros, topic: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        ROS.getTopicType(topic, (type: string) => {
            resolve(type);
        }, (error: any) => {
            reject(error);
        });
    });
}


async function GetTopicsList(ROS: ROSLIB.Ros): Promise<ROSTopic[]> {
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

async function GetTopicsAndRawTypes(ROS: ROSLIB.Ros): Promise<Map<string, JsonSchema>> {

    return new Promise<Map<string, JsonSchema>>((resolve, reject) => {

        ROS.getTopicsAndRawTypes((results: { topics: string[], types: string[], typedefs_full_text: string[] }) => {
            const topics = new Map<string, JsonSchema>();

            for (let i = 0; i < results.topics.length; i++) {

                const def = results.typedefs_full_text[i];
                const decoded = decodeTypeDefs(def);

                topics.set(results.topics[i], decoded);
            }

            resolve(topics);

        }, (error: any) => {
            reject(error);
        });

    });

}

// Create a provider component
const RosBridgeSuiteSourceProvider: React.FC<{ children: ReactNode, props: RosBridgeSuiteDataSourceSettings }> = ({ children, props }) => {
    const pluginsManager = usePluginsManager() as PluginsManager;

    const subscribersRef = useRef(new Map<string, ROSLIB.Topic>());
    const subscribersCountRef = useRef(new Map<string, number>());

    // constant for the datasource
    const datasource_id = props.id;
    const available_topics_handler = `${datasource_id}-available-topics`;
    const subscribe_hook = `${datasource_id}-subscribe`;
    const unsubscribe_hook = `${datasource_id}-unsubscribe`;
    const definition_hook = `${datasource_id}-definition`;

    // ROS Websocket
    const ROSRef = useRef<ROSLIB.Ros | null>(null);

    const connectionRef = useRef<Promise<boolean> | null>(null);
    const [connected, setConnected] = React.useState(false);

    const [retry, setRetry] = React.useState(0);    // force re-render to re-connect

    useEffect(() => {

        const waitTimeOut = setTimeout(() => {
            connectionRef.current = new Promise<boolean>((resolve, reject) => {
                if (!ROSRef.current || !ROSRef.current.isConnected) {
                    const ros = new ROSLIB.Ros({
                        url: props.url
                    });

                    ros.on('connection', () => {
                        toast({
                            title: `Connected to ${props.title}`,
                            description: `Connection established with ${props.url}`,
                        });

                        setConnected(true);
                        resolve(true);
                    });

                    ros.on('error', (error) => {
                        toast({
                            title: `Error in ${props.title}`,
                            description: `Failed to connect to ${props.url}`,
                            variant: 'destructive'
                        });
                        setConnected(false);
                        reject(error);
                    });

                    ros.on('close', () => {
                        toast({
                            title: `Disconnected from ${props.title}`,
                        });

                        setTimeout(() => {
                            setRetry(retry + 1);
                        }, props.reconnectTimeout * 1000);

                        setConnected(false);
                        resolve(false);
                    });

                    ROSRef.current = ros;
                }
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
                            source: props,
                            type: topic.type,
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

                        const topicType = await GetTopicType(ROSRef.current!, topic.topic);
                        const subscriber = new ROSLIB.Topic({
                            ros: ROSRef.current!,
                            name: topic.topic,
                            messageType: topicType,
                        });

                        subscriber.subscribe((message: any) => {
                            pluginsManager.doAction(
                                `${datasource_id}-${topic.topic}-published`,
                                message,
                                Date.now()
                            );
                        });

                        subscribersRef.current.set(topic.topic, subscriber);
                        subscribersCountRef.current.set(topic.topic, 1);
                    } catch (error) {
                        toast({
                            title: "Error",
                            description: "Failed to subscribe to topic",
                            variant: "destructive",
                        });
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
                        if (count <= 1 || ignoreCount) {
                            const subscriber = subscribersRef.current.get(topic.topic);
                            subscriber!.unsubscribe();
                            subscribersRef.current.delete(topic.topic);
                            subscribersCountRef.current.delete(topic.topic);
                        }

                        subscribersCountRef.current.set(topic.topic, count - 1);

                    } catch (error) {
                        console.error("Unsubscribe error:", error);
                        toast({
                            title: "Error",
                            description: "Failed to unsubscribe from topic",
                            variant: "destructive",
                        });
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

                    console.log("getting definition for topic", topic);

                    // get message definition from ROS
                    const topics_and_raw_types = await GetTopicsAndRawTypes(ROSRef.current!);
                    const current_topic_raw_type = topics_and_raw_types.get(topic.topic);

                    if (!current_topic_raw_type) {
                        console.log("topic not found in topics_and_raw_types", topic.topic, current_topic_raw_type, topics_and_raw_types);
                        return definition;
                    }

                    console.log(current_topic_raw_type);

                    return current_topic_raw_type;
                }
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

            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeAction(subscribe_hook);
            pluginsManager.removeAction(unsubscribe_hook);
            pluginsManager.removeFilter(definition_hook);

            // unsubscribe from all topics
            subscribersRef.current.forEach((subscriber) => {
                subscriber.unsubscribe();
            });

            subscribersRef.current.clear();
            subscribersCountRef.current.clear();

            disconnect();
        }

    }, [retry, props]);


    return (
        <RosBridgeSuiteSourceContext.Provider value={null}>
            {connected && children}
        </RosBridgeSuiteSourceContext.Provider>
    );

}

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };
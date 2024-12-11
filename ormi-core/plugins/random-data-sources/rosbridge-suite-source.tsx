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

const RosBridgeSuiteSourceContext = createContext(null);

interface RosBridgeSuiteDataSourceSettings extends DatasourceProviderSettings {
    url: string;
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

// Create a provider component
const RosBridgeSuiteSourceProvider: React.FC<{ children: ReactNode, props: RosBridgeSuiteDataSourceSettings }> = ({ children, props }) => {
    const pluginsManager = usePluginsManager() as PluginsManager;

    const subscribersRef = useRef(new Map<string, ROSLIB.Topic>());
    const subscribersCountRef = useRef(new Map<string, number>());

    const datasource_id = props.id;
    const available_topics_handler = `${datasource_id}-available-topics`;
    const subscribe_hook = `${datasource_id}-subscribe`;
    const unsubscribe_hook = `${datasource_id}-unsubscribe`;
    const definition_hook = `${datasource_id}-definition`;

    const connectionTimeoutRef = useRef<NodeJS.Timeout>();
    const connectionPromiseRef = useRef<Promise<boolean>>();
    const rosInstanceRef = useRef<ROSLIB.Ros>();

    useEffect(() => {
        let isComponentMounted = true;

        // Ensure ROS instance exists
        if (!rosInstanceRef.current) {
            rosInstanceRef.current = new ROSLIB.Ros({ url: props.url });
        }

        const ROS = rosInstanceRef.current;

        if (!connectionPromiseRef.current) {
            connectionPromiseRef.current = new Promise<boolean>((resolve, reject) => {
                connectionTimeoutRef.current = setTimeout(() => {
                    reject(new Error("Connection timeout"));
                }, 10000);

                ROS.on("connection", () => {
                    if (isComponentMounted) {
                        clearTimeout(connectionTimeoutRef.current);
                        toast({
                            title: "Connected to ROSBridge Suite",
                            description: `Connected to ROSBridge Suite at ${props.url}`,
                        });
                        resolve(true);
                    }
                });

                ROS.on("error", (error) => {
                    if (isComponentMounted) {
                        clearTimeout(connectionTimeoutRef.current);
                        reject(error);
                    }
                });

                ROS.on("close", () => {
                    toast({
                        title: "Disconnected",
                        description: "Disconnected from ROSBridge Suite",
                    });
                });
            });
        }

        // Register plugin handlers
        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: available_topics_handler,
            filter: async (topics) => {
                try {
                    await connectionPromiseRef.current;
                    if (!isComponentMounted) return topics;

                    const rosTopics = await GetTopicsList(ROS);
                    return [...topics, ...rosTopics.map((topic) => ({
                        topic: topic.topic,
                        source: props,
                        type: topic.type,
                    }))];
                } catch (error) {
                    console.error("Failed to get topics:", error);
                    return topics;
                }
            },
            priority: 100,
        });

        pluginsManager.addAction(subscribe_hook, {
            id: subscribe_hook,
            action: async (topic: DatasourceTopic) => {
                try {
                    await connectionPromiseRef.current;
                    if (!isComponentMounted) return;

                    if (subscribersRef.current.has(topic.topic)) {
                        subscribersCountRef.current.set(
                            topic.topic,
                            (subscribersCountRef.current.get(topic.topic) || 0) + 1
                        );
                        return;
                    }

                    const topicType = await GetTopicType(ROS, topic.topic);
                    const subscriber = new ROSLIB.Topic({
                        ros: ROS,
                        name: topic.topic,
                        messageType: topicType,
                    });

                    subscriber.subscribe((message: any) => {
                        if (isComponentMounted) {
                            pluginsManager.doAction(
                                `${datasource_id}-${topic.topic}-published`,
                                message,
                                Date.now()
                            );
                        }
                    });

                    subscribersRef.current.set(topic.topic, subscriber);
                    subscribersCountRef.current.set(topic.topic, 1);
                } catch (error) {
                    console.error("Subscribe error:", error);
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
            action: async (topic: DatasourceTopic) => {
                try {
                    await connectionPromiseRef.current;
                    if (!isComponentMounted) return;

                    if (!subscribersRef.current.has(topic.topic)) {
                        return;
                    }

                    const count = subscribersCountRef.current.get(topic.topic) || 0;
                    if (count > 1) {
                        subscribersCountRef.current.set(topic.topic, count - 1);
                        return;
                    }

                    const subscriber = subscribersRef.current.get(topic.topic);
                    subscriber!.unsubscribe();
                    subscribersRef.current.delete(topic.topic);
                    subscribersCountRef.current.delete(topic.topic);
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

        return () => {
            isComponentMounted = false;
            clearTimeout(connectionTimeoutRef.current);

            // Clean up subscriptions
            subscribersRef.current.forEach((subscriber) => {
                try {
                    subscriber.unsubscribe();
                } catch (error) {
                    console.error("Error unsubscribing:", error);
                }
            });
            subscribersRef.current.clear();
            subscribersCountRef.current.clear();

            // Remove plugin handlers
            try {
                pluginsManager.removeFilter(available_topics_handler);
                pluginsManager.removeAction(subscribe_hook);
                pluginsManager.removeAction(unsubscribe_hook);
            } catch (error) {
                console.warn("Error removing plugin handlers:", error);
            }

            // Disconnect ROS
            if (rosInstanceRef.current && rosInstanceRef.current.isConnected) {
                rosInstanceRef.current.close();
            }
        };
    }, [props.url]);


    return (
        <RosBridgeSuiteSourceContext.Provider value={null}>
            {children}
        </RosBridgeSuiteSourceContext.Provider>
    );
};

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };
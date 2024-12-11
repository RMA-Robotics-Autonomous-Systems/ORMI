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

    const ROSRef = useRef<ROSLIB.Ros | null>(null);


    useEffect(() => {
        let isComponentMounted = true;
        const ROS = new ROSLIB.Ros({
            transportLibrary: 'websocket',
            url: props.url
        });

        // Connection state management
        const connectionPromise = new Promise<boolean>((resolve, reject) => {
            ROS.on("connection", () => {
                if (isComponentMounted) {
                    toast({
                        title: "Connected to ROSBridge Suite",
                        description: `Connected to ROSBridge Suite at ${props.url}`,
                    });
                    resolve(true);
                }
            });

            ROS.on("error", (error: any) => {
                if (isComponentMounted) {
                    reject(false);
                }
            });
        });

        // Plugin handlers with connection check
        const availableTopicsHandler = async (topics: DatasourceTopic[]) => {
            try {
                await connectionPromise;
                if (!isComponentMounted) return topics;

                const rosTopics = await GetTopicsList(ROS);
                return [...topics, ...rosTopics.map(topic => ({
                    topic: topic.topic,
                    source: props,
                    type: topic.type,
                }))];
            } catch (error) {
                console.error("Failed to get topics:", error);
                return topics;
            }
        };

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: available_topics_handler,
            filter: availableTopicsHandler,
            priority: 100
        });

        pluginsManager.addAction(subscribe_hook, {
            id: subscribe_hook,
            action: async (topic: DatasourceTopic) => {
                try {
                    await connectionPromise;
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
                        reconnect_on_close: true,
                        queue_length: 1
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
                        variant: "destructive"
                    });
                }
            },
            priority: 100
        });

        const disconnection = async (connectionPromise: Promise<boolean>) => {

            if (await connectionPromise) {
                if (ROS.isConnected) {
                    ROS.close();
                }
            }

        };

        // Cleanup function
        return () => {
            isComponentMounted = false;

            // Cleanup all subscriptions
            subscribersRef.current.forEach((subscriber) => {
                subscriber.unsubscribe();
            });
            subscribersRef.current.clear();
            subscribersCountRef.current.clear();

            // Remove plugin handlers
            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeAction(subscribe_hook);
            pluginsManager.removeAction(unsubscribe_hook);

            // Close ROS connection
            disconnection(connectionPromise);
        };
    }, [props.url]); // Only re-run if URL changes

    return (
        <RosBridgeSuiteSourceContext.Provider value={null}>
            {children}
        </RosBridgeSuiteSourceContext.Provider>
    );
};

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };
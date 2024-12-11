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



    useEffect(() => {
        // const ROS = ROSRef.current;
        const ROS = new ROSLIB.Ros(
            {
                transportLibrary: 'websocket',
                url: props.url
            }
        );

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: available_topics_handler,
            filter: async (topics: DatasourceTopic[]) => {

                if (!ROS.isConnected) {
                    return topics;
                }

                const rosTopics = await GetTopicsList(ROS);

                for (const topic of rosTopics) {
                    topics.push({
                        topic: topic.topic,
                        source: props,
                        type: topic.type,
                    });
                }


                return topics;
            },
            priority: 100
        });

        pluginsManager.addAction(subscribe_hook, {
            id: subscribe_hook,
            action: async (topic: DatasourceTopic) => {

                if (!ROS.isConnected) {
                    toast({
                        title: "Error",
                        description: "Could not connect to ROSBridge Suite",
                        variant: "destructive"
                    });
                    return;
                }

                const topicType = await GetTopicType(ROS, topic.topic);

                // check if the subscriber already exists, if yes increment the count
                if (subscribersRef.current.has(topic.topic)) {
                    subscribersCountRef.current.set(topic.topic, (subscribersCountRef.current.get(topic.topic) || 0) + 1);
                    return;
                }

                const subscriber = new ROSLIB.Topic({
                    ros: ROS,
                    name: topic.topic,
                    messageType: topicType
                });

                subscriber.subscribe((message: any) => {
                    pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, message, Date.now());
                });

                subscribersRef.current.set(topic.topic, subscriber);
                subscribersCountRef.current.set(topic.topic, 1);

            },
            priority: 100
        });

        pluginsManager.addAction(unsubscribe_hook, {
            id: unsubscribe_hook,
            action: async (topic: DatasourceTopic) => {

                if (!ROS.isConnected) {
                    return;
                }

                if (!subscribersRef.current.has(topic.topic)) {
                    return;
                }

                const count = subscribersCountRef.current.get(topic.topic);
                if (!count) {
                    throw new Error(`Subscriber count not found for topic: ${topic.topic}`);
                }

                if (count === 1) {
                    const subscriber = subscribersRef.current.get(topic.topic);
                    if (!subscriber) {
                        throw new Error(`Subscriber not found for topic: ${topic.topic}`);
                    }
                    subscriber.unsubscribe();
                    subscribersRef.current.delete(topic.topic);
                    subscribersCountRef.current.delete(topic.topic);
                } else {
                    subscribersCountRef.current.set(topic.topic, count - 1);
                }
            },
            priority: 100
        });

        const connect = async () => {

            ROS.on("connection", () => {
                toast({
                    title: "Connected to ROSBridge Suite",
                    description: `Connected to ROSBridge Suite at ${props.url}`,
                });
            });

            ROS.on("error", (error: any) => {
                console.log(ROS, error);
                toast({
                    title: "Error connecting to ROSBridge Suite",
                    description: `Could not connect to ROSBridge Suite at ${props.url}`,
                    variant: "destructive"
                });
            });

            ROS.on("close", () => {
                console.log("Disconnected from ROSBridge Suite");
                toast({
                    title: "Disconnected from ROSBridge Suite",
                    description: "Please check the URL and try again",
                    variant: "destructive"
                });
            });

            try {
                // await ROS.connect(props.url);
            } catch (error) {
                console.error("Connection error:", error);
            }
        };

        connect();

        return () => {
            // the filter is only added when the connection is successful
            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeFilter(definition_hook);

            pluginsManager.removeAction(subscribe_hook);

            // call the unsubscribe action for all the subscribers
            subscribersRef.current.forEach((subscriber, topic) => {

                pluginsManager.doAction(unsubscribe_hook, {
                    topic: topic,
                    source: props
                });

                subscriber.unsubscribe();

            });

            pluginsManager.removeAction(unsubscribe_hook);

            ROS.close();

        };
    }, [props.url]); // Added props.url as dependency

    return (
        <RosBridgeSuiteSourceContext.Provider value={null}>
            {children}
        </RosBridgeSuiteSourceContext.Provider>
    );
};

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };
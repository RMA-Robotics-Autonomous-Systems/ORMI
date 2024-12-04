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

import React, { createContext, useContext, ReactNode, useEffect, useRef } from 'react';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';

import { RandomDataSourceSettings } from './index';
import { DatasourceTopic } from '@/core/datasources/datasource-interface';

const RandomIMUSourceContext = createContext(null);

const datasource_id = "random-imu-source";

// Create a provider component
const RandomIMUSourceProvider: React.FC<{ children: ReactNode, props: RandomDataSourceSettings }> = ({ children, props }) => {

    const pluginsManager = usePluginsManager() as PluginsManager;

    const intervalesRef = useRef(new Map<string, NodeJS.Timeout>());
    const subscribersCountRef = useRef(new Map<string, number>());


    useEffect(() => {
        const available_topics = props.topics;

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: 'random-imu-source-available-topics',
            priority: 10,
            filter: (topics: DatasourceTopic[], type: string) => {

                for (const topic of available_topics) {
                    topics.push({
                        topic: topic.topic,
                        source: datasource_id,
                        type: typeof 0,

                        subscribeHook: `${datasource_id}_${topic.topic}_subscribe`,
                        unsubscribeHook: `${datasource_id}_${topic.topic}_unsubscribe`,
                        pubshlishHook: `${datasource_id}_${topic.topic}_publish`,

                        definitionHook: `${datasource_id}_${topic.topic}_definition`,
                    });
                }

                console.log("available topics", topics);

                return topics;
            }
        });

        const getTopicFrequency = (topic: string) => {
            return available_topics.find(t => t.topic === topic)?.frequency || 1000;
        };

        available_topics.forEach(topic => {
            pluginsManager.addAction(`${datasource_id}_${topic.topic}_subscribe`, {
                id: `random-imu-source-subscribe-${topic.topic}`,
                priority: 10,
                action: (topic: DatasourceTopic) => {

                    subscribersCountRef.current.set(topic.topic, (subscribersCountRef.current.get(topic.topic) || 0) + 1);

                    if (intervalesRef.current.has(topic.topic)) {
                        return;
                    }

                    const freq = getTopicFrequency(topic.topic);

                    const interval = setInterval(() => {

                        const imu_data = {
                            velocity: {
                                x: Math.random(),
                                y: Math.random(),
                                z: Math.random()
                            },
                            acceleration: {
                                x: Math.random(),
                                y: Math.random(),
                                z: Math.random()
                            },
                            orientation: {
                                x: Math.random(),
                                y: Math.random(),
                                z: Math.random()
                            },
                        }

                        pluginsManager.doAction(`${datasource_id}_${topic.topic}_publish`, imu_data, Date.now());
                    }, freq); // Assuming freq is in milliseconds

                    intervalesRef.current.set(topic.topic, interval);
                }
            });

            pluginsManager.addAction(`${datasource_id}_${topic.topic}_unsubscribe`, {
                id: `random-imu-source-unsubscribe-${topic.topic}`,
                priority: 10,
                action: (topic: DatasourceTopic) => {

                    const count = subscribersCountRef.current.get(topic.topic) || 0;

                    if (count <= 1) {
                        clearInterval(intervalesRef.current.get(topic.topic));
                        intervalesRef.current.delete(topic.topic);
                    }

                    subscribersCountRef.current.set(topic.topic, count - 1);

                }
            });

            pluginsManager.addFilter(`${datasource_id}_${topic.topic}_definition`, {
                id: `random-imu-source-definition-${topic.topic}`,
                priority: 10,
                filter: () => {
                    // return a JsonSchema representing the topic message structure
                    return {
                        type: 'object',
                        properties: {
                            velocity: {
                                type: 'object',
                                properties: {
                                    x: { type: 'number' },
                                    y: { type: 'number' },
                                    z: { type: 'number' },
                                }
                            },
                            acceleration: {
                                type: 'object',
                                properties: {
                                    x: { type: 'number' },
                                    y: { type: 'number' },
                                    z: { type: 'number' },
                                }
                            },
                            orientation: {
                                type: 'object',
                                properties: {
                                    x: { type: 'number' },
                                    y: { type: 'number' },
                                    z: { type: 'number' },
                                }
                            }
                        }
                    };
                }
            });


        });

        return () => {
            available_topics.forEach(topic => {

                pluginsManager.doAction(`${datasource_id}_${topic.topic}_unsubscribe`, topic);
                pluginsManager.removeAction(`${datasource_id}_${topic.topic}_subscribe`);
                pluginsManager.removeAction(`${datasource_id}_${topic.topic}_unsubscribe`);
                pluginsManager.removeAction(`${datasource_id}_${topic.topic}_definition`);

                console.log("unsubscribed from topic", topic.topic);
            });
        };
    }, []);

    return (
        <RandomIMUSourceContext.Provider value={null}>
            {children}
        </RandomIMUSourceContext.Provider>
    );
};

// Create a custom hook to use the context
const useRandomProvider = () => {
    const context = useContext(RandomIMUSourceContext);
    if (context === undefined) {
        throw new Error('useRandomProvider must be used within a RandomIMUSourceProvider');
    }
    return context;
};

export { RandomIMUSourceProvider, useRandomProvider };
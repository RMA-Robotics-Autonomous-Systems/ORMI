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


// Create a provider component
const RandomIMUSourceProvider: React.FC<{ children: ReactNode, props: RandomDataSourceSettings }> = ({ children, props }) => {

    const pluginsManager = usePluginsManager() as PluginsManager;

    const intervalesRef = useRef(new Map<string, NodeJS.Timeout>());
    const subscribersCountRef = useRef(new Map<string, number>());

    const datasource_id = props.id;
    const available_topics_handler = `${datasource_id}-available-topics`;
    const subscribe_hook = `${datasource_id}-subscribe`;
    const unsubscribe_hook = `${datasource_id}-unsubscribe`;
    const definition_hook = `${datasource_id}-definition`;



    useEffect(() => {
        const available_topics = props.topics;

        console.log("mounting random imu source");

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: available_topics_handler,
            priority: 10,
            filter: (topics: DatasourceTopic[], type: string) => {

                for (const topic of available_topics) {
                    topics.push({
                        topic: topic.topic,
                        source: props,
                        type: typeof 0,
                    });
                }

                return topics;
            }
        });

        const getTopicFrequency = (topic: string) => {
            return available_topics.find(t => t.topic === topic)?.frequency || 30; // default to 30hz
        };

        pluginsManager.addAction(subscribe_hook, {
            id: subscribe_hook,
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

                    pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, imu_data, Date.now());
                }, 1000 / freq); // Assuming freq is in hz

                intervalesRef.current.set(topic.topic, interval);
            }
        });

        pluginsManager.addAction(unsubscribe_hook, {
            id: unsubscribe_hook,
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

        pluginsManager.addFilter(definition_hook, {
            id: definition_hook,
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

        return () => {

            console.log("unmounting random imu source");

            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeFilter(definition_hook);
            pluginsManager.removeAction(subscribe_hook);

            available_topics.forEach(topic => {
                pluginsManager.doAction(unsubscribe_hook, topic);
            });

            pluginsManager.removeAction(unsubscribe_hook);
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
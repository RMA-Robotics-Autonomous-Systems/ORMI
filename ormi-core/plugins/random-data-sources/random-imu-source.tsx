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

import React, { createContext, useContext, ReactNode, useEffect, useRef, useState } from 'react';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';

import { RandomDataSourceSettings } from './index';
import { DatasourceTopic } from '@/core/datasources/datasource-interface';
import { Spinner } from '@/components/spinner';
import { IMU } from '@/core/types/movement';

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

    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        const available_topics = props.topics;

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: available_topics_handler,
            priority: 10,
            filter: (topics: DatasourceTopic[], type: string) => {

                for (const topic of available_topics) {
                    topics.push({
                        topic: topic.topic,
                        source: props,
                        type: "IMU",
                        rawType: "imu",
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

                    const time = Date.now() / 1000; // Time in seconds
                    const stepFrequency = 2; // Steps per second
                    const stepAmplitude = 0.5;

                    const imu_data = {
                        linear_acceleration: {
                            x: stepAmplitude * Math.sin(2 * Math.PI * stepFrequency * time), // Forward-backward motion
                            y: Math.abs(stepAmplitude * Math.sin(4 * Math.PI * stepFrequency * time)), // Up-down motion
                            z: stepAmplitude * Math.cos(2 * Math.PI * stepFrequency * time) * 0.3, // Side-to-side motion
                        },
                        angular_velocity: {
                            x: stepAmplitude * Math.cos(2 * Math.PI * stepFrequency * time) * 0.2, // Roll
                            y: stepAmplitude * Math.sin(2 * Math.PI * stepFrequency * time) * 0.1, // Pitch
                            z: stepAmplitude * Math.sin(4 * Math.PI * stepFrequency * time) * 0.15, // Yaw
                        },
                        orientation: {
                            x: Math.sin(2 * Math.PI * stepFrequency * time) * 0.1,
                            y: Math.cos(2 * Math.PI * stepFrequency * time) * 0.1,
                            z: Math.sin(4 * Math.PI * stepFrequency * time) * 0.05,
                            w: 1.0,
                        }
                    } as IMU;

                    pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, imu_data, Date.now());
                }, 1000 / freq); // Assuming freq is in hz

                intervalesRef.current.set(topic.topic, interval);
            }
        });

        pluginsManager.addAction(unsubscribe_hook, {
            id: unsubscribe_hook,
            priority: 10,
            action: (topic: DatasourceTopic, ignoreCount: boolean = false) => {

                const count = subscribersCountRef.current.get(topic.topic) || 0;

                if (count <= 1 || ignoreCount) {
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
                        linear_acceleration: {
                            type: 'object',
                            properties: {
                                x: { type: 'number' },
                                y: { type: 'number' },
                                z: { type: 'number' },
                            }
                        },
                        angular_velocity: {
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
                }
            }
        });

        setInitialized(true);

        return () => {

            pluginsManager.removeFilter(available_topics_handler);
            pluginsManager.removeFilter(definition_hook);
            pluginsManager.removeAction(subscribe_hook);

            available_topics.forEach(topic => {
                pluginsManager.doAction(unsubscribe_hook, topic, true);
            });

            pluginsManager.removeAction(unsubscribe_hook);

            intervalesRef.current.clear();
            subscribersCountRef.current.clear();
        };
    }, [props]);

    return (
        <RandomIMUSourceContext.Provider value={null}>
            {initialized && children}
            {!initialized && <Spinner />}
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
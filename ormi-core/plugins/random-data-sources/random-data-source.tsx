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
import { DatasourceTopic, SelectedTopic } from '@/core/datasources/datasource-interface';
import { Spinner } from '@/components/spinner';
import { IMU, Movement } from '@/core/types/movement';
import { Vector3 } from '@/core/types/common';

const RandomDataSourceContext = createContext(null);



// Create a provider component
const RandomDataSourceProvider: React.FC<{ children: ReactNode, props: RandomDataSourceSettings }> = ({ children, props }) => {

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

        const intervalGenerator = (topic: SelectedTopic): NodeJS.Timeout => {

            const freq = getTopicFrequency(topic.topic);

            switch (topic.type) {

                case 'GeolocationPosition':
                    return setInterval(() => {
                        pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, {
                            coords: {
                                latitude: 50.8503 + Math.random() * 0.1 - 0.05,
                                longitude: 4.3517 + Math.random() * 0.1 - 0.05,
                                altitude: Math.random() * 100,
                                accuracy: Math.random() * 10,
                                altitudeAccuracy: Math.random() * 10,
                                heading: Math.random() * 360,
                                speed: Math.random() * 10
                            }
                        } as GeolocationPosition, Date.now());
                    }, 1000 / freq);

                case 'IMU':
                    return setInterval(() => {

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
                    }, 1000 / freq);

                case 'number':
                    let old_value = Math.random();
                    return setInterval(() => {
                        const value = old_value + Math.random() * 0.1 - 0.05;
                        old_value = value;

                        pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, value, Date.now());
                    }, 1000 / freq);

                case 'Movement':
                    return setInterval(() => {

                        const data = {
                            linear: {
                                x: Math.random() * 2 - 1,
                                y: Math.random() * 2 - 1,
                                z: Math.random() * 2 - 1

                            } as Vector3,

                            angular: {

                                x: Math.random() * 2 - 1,
                                y: Math.random() * 2 - 1,
                                z: Math.random() * 2 - 1

                            } as Vector3

                        } as Movement;

                        pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, data, Date.now());

                    }, 1000 / freq);

                case 'boolean':
                    return setInterval(() => {
                        pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, Math.random() > 0.5, Date.now());
                    }, 1000 / freq);

                default:
                    return setInterval(() => {
                        pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, Math.random(), Date.now());
                    }, 1000 / freq);
            }
        };


        // create a custom event : 
        // datasource_id-topic-published
        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: available_topics_handler,
            priority: 10,
            filter: (topics: DatasourceTopic[]) => {

                for (const topic of available_topics) {
                    topics.push({
                        topic: topic.topic,
                        source: props,
                        type: topic.type,
                        rawType: topic.type,
                    });
                }

                return topics;
            }
        });

        const getTopicFrequency = (topic: string) => {
            return available_topics.find(t => t.topic === topic)?.frequency || 30;  // default to 30hz
        };

        pluginsManager.addAction(subscribe_hook, {
            id: subscribe_hook,
            priority: 10,
            action: (topic: SelectedTopic) => {
                subscribersCountRef.current.set(topic.topic, (subscribersCountRef.current.get(topic.topic) || 0) + 1);

                if (intervalesRef.current.has(topic.topic)) {
                    return;
                }

                const interval = intervalGenerator(topic);

                intervalesRef.current.set(topic.topic, interval);
            }
        });

        pluginsManager.addAction(unsubscribe_hook, {
            id: unsubscribe_hook,
            priority: 10,
            action: (topic: SelectedTopic, ignoreCount: boolean = false) => {

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
                // return a JsonSchema representing the datasource
                return {
                    type: 'number'
                };
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

        };
    }, [props]);

    return (
        <RandomDataSourceContext.Provider value={null}>
            {initialized && children}
            {!initialized && <Spinner />}
        </RandomDataSourceContext.Provider>
    );
};

// Create a custom hook to use the context
const useRandomProvider = () => {
    const context = useContext(RandomDataSourceContext);
    if (context === undefined) {
        throw new Error('useRandomProvider must be used within a RandomDataSourceProvider');
    }
    return context;
};

export { RandomDataSourceProvider, useRandomProvider };
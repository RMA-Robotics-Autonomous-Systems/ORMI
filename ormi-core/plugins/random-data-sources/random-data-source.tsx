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
import { Vector3, PointsCloud } from '@/core/types/common';

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
            try {
                const freq = getTopicFrequency(topic.topic);

                switch (topic.type) {

                    case 'GeolocationPosition':

                        const walker = {
                            latitude: 50.8503,
                            longitude: 4.3517,
                            altitude: 100,
                            accuracy: 5,
                            altitudeAccuracy: 5,
                            heading: 0,
                            speed: 0,
                        };

                        return setInterval(() => {
                            walker.latitude += (Math.random() - 0.5) * 0.0001;      // small random step
                            walker.longitude += (Math.random() - 0.5) * 0.0001;
                            walker.altitude += (Math.random() - 0.5) * 0.0005;         // slight altitude change
                            walker.heading += Math.random() * 1;
                            walker.speed = Math.abs((Math.random() - 0.5) * 0.2);

                            pluginsManager.doAction(
                                `${datasource_id}-${topic.topic}-published`,
                                { coords: { ...walker } } as GeolocationPosition,
                                Date.now()
                            );
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

                        return setInterval(() => {

                            data.linear.x += Math.random() * 0.1 - 0.05;
                            data.linear.y += Math.random() * 0.1 - 0.05;
                            data.linear.z += Math.random() * 0.1 - 0.05;

                            data.angular.x += Math.random() * 0.1 - 0.05;
                            data.angular.y += Math.random() * 0.1 - 0.05;
                            data.angular.z += Math.random() * 0.1 - 0.05;

                            pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, data, Date.now());

                        }, 1000 / freq);

                    case 'boolean':

                        let time_of_change = Date.now();
                        let value = Math.random() > 0.5;

                        return setInterval(() => {
                            const now = Date.now();
                            const elapsed = now - time_of_change;
                            // Increase probability over time (1 at 5 seconds or more)
                            const probability = Math.min(1, elapsed / 5000);
                            if (Math.random() < probability) {
                                value = !value;
                                time_of_change = now;
                            }
                            pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, value, now);
                        }, 1000 / freq);

                    case 'PointsCloud':
                        const numPoints = 1000;
                        // Create initial point cloud with phase offsets for smooth animation
                        const basePoints = Array.from({ length: numPoints }, () => ({
                            x: (Math.random() - 0.5) * 2,
                            y: (Math.random() - 0.5) * 2,
                            z: (Math.random() - 0.5) * 2
                        }));
                        const baseColors = Array.from({ length: numPoints }, () => ({
                            r: Math.random(),
                            g: Math.random(),
                            b: Math.random(),
                            a: 1.0
                        }));
                        // Precompute phase offsets for each coordinate
                        const phases = Array.from({ length: numPoints }, () => ({
                            x: Math.random() * Math.PI * 2,
                            y: Math.random() * Math.PI * 2,
                            z: Math.random() * Math.PI * 2
                        }));
                        // Create reusable Vector3 objects
                        const pointsObjects: Vector3[] = basePoints.map(() => ({ x: 0, y: 0, z: 0 }));

                        return setInterval(() => {
                            const t = Date.now() / 1000;
                            const amplitude = 0.05;
                            // Smoothly update each point based on its phase offset
                            for (let i = 0; i < numPoints; i++) {
                                pointsObjects[i].x = basePoints[i].x + Math.sin(t + phases[i].x) * amplitude;
                                pointsObjects[i].y = basePoints[i].y + Math.sin(t + phases[i].y) * amplitude;
                                pointsObjects[i].z = basePoints[i].z + Math.sin(t + phases[i].z) * amplitude;
                            }
                            pluginsManager.doAction(
                                `${datasource_id}-${topic.topic}-published`,
                                {
                                    points: pointsObjects,
                                    colors: baseColors
                                } as PointsCloud,
                                Date.now()
                            );
                        }, 1000 / freq);

                    default:
                        return setInterval(() => {
                            pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, Math.random(), Date.now());
                        }, 1000 / freq);
                }
            } catch (error) {
                console.error(`Error generating interval for topic ${topic.topic}:`, error);
                return setInterval(() => { }, 1000); // Fallback empty interval
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

                // check that the topic is available
                if (!available_topics.find(t => t.topic === topic.topic)) {
                    console.error(`Topic ${topic.topic} not available in ${datasource_id}`);
                    return;
                }

                console.log(`Subscribing to topic ${topic.topic}`);

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
            action: (topic: SelectedTopic, ignoreCount = false) => {

                console.log(`Unsubscribing from topic ${topic.topic}`);

                // force clear interval
                if (ignoreCount && intervalesRef.current.get(topic.topic)) {
                    console.log(`Forcefully clearing interval for topic ${topic.topic}`);
                    clearInterval(intervalesRef.current.get(topic.topic));
                    intervalesRef.current.delete(topic.topic);
                    return;
                }

                const count = subscribersCountRef.current.get(topic.topic) || 0;
                const newCount = count - 1;
                subscribersCountRef.current.set(topic.topic, newCount);

                if (newCount <= 0) {
                    console.log(`No more subscribers for topic ${topic.topic}, clearing interval`);
                    clearInterval(intervalesRef.current.get(topic.topic));
                    intervalesRef.current.delete(topic.topic);
                }

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

            console.log('Cleaning up RandomDataSourceProvider');
            intervalesRef.current.forEach((interval, topic) => {
                console.log(`Forcefully clearing interval for topic ${topic}`);
                clearInterval(interval);
            });
            intervalesRef.current.clear();
            subscribersCountRef.current.clear();

            // Remove actions after cleanup
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
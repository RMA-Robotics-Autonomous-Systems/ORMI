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

const RandomDataSourceContext = createContext(null);

const datasource_id = "random-data-source";

// Create a provider component
const RandomDataSourceProvider: React.FC<{ children: ReactNode, props: RandomDataSourceSettings }> = ({ children, props }) => {

    const pluginsManager = usePluginsManager() as PluginsManager;

    const intervalesRef = useRef(new Map<string, NodeJS.Timeout>());
    const subscribersCountRef = useRef(new Map<string, number>());


    useEffect(() => {
        const available_topics = props.topics;

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: 'random-data-source-available-topics',
            priority: 10,
            filter: () => {
                return available_topics.map(topic => ({
                    topic: topic.topic,
                    source: datasource_id,
                    type: typeof 0
                }));
            }
        });

        const getTopicFrequency = (topic: string) => {
            return available_topics.find(t => t.topic === topic)?.frequency || 1000;
        };

        available_topics.forEach(topic => {
            pluginsManager.addAction(`${datasource_id}_${topic.topic}_subscribe`, {
                id: `random-data-source-subscribe-${topic.topic}`,
                priority: 10,
                action: (topic: DatasourceTopic) => {

                    subscribersCountRef.current.set(topic.topic, (subscribersCountRef.current.get(topic.topic) || 0) + 1);

                    if (intervalesRef.current.has(topic.topic)) {
                        console.log("already subscribed to topic", topic.topic);
                        return;
                    }

                    const freq = getTopicFrequency(topic.topic);

                    let old_value = Math.random();
                    const interval = setInterval(() => {

                        const value = old_value + Math.random() * 0.1 - 0.05;
                        old_value = value;

                        pluginsManager.doAction(`${datasource_id}_${topic.topic}_publish`, value, Date.now());
                    }, freq); // Assuming freq is in milliseconds

                    intervalesRef.current.set(topic.topic, interval);
                }
            });

            pluginsManager.addAction(`${datasource_id}_${topic.topic}_unsubscribe`, {
                id: `random-data-source-unsubscribe-${topic.topic}`,
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
        });

        return () => {
            available_topics.forEach(topic => {
                pluginsManager.doAction(`${datasource_id}_${topic.topic}_unsubscribe`, topic);
                pluginsManager.removeAction(`${datasource_id}_${topic.topic}_publish`);
                console.log("unsubscribed from topic", topic.topic);
            });
        };
    }, []);

    return (
        <RandomDataSourceContext.Provider value={null}>
            {children}
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
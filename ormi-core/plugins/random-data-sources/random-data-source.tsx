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



// Create a provider component
const RandomDataSourceProvider: React.FC<{ children: ReactNode, props: RandomDataSourceSettings }> = ({ children, props }) => {

    const pluginsManager = usePluginsManager() as PluginsManager;

    const intervalesRef = useRef(new Map<string, NodeJS.Timeout>());
    const subscribersCountRef = useRef(new Map<string, number>());


    useEffect(() => {
        const available_topics = props.topics;
        const datasource_id = props.id;

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: `${datasource_id}_available_topics`,
            priority: 10,
            filter: (topics: DatasourceTopic[], type: string) => {

                for (const topic of available_topics) {
                    topics.push({
                        topic: topic.topic,
                        source: props,
                        type: typeof 0,

                        subscribeHook: `${datasource_id}_${topic.topic}_subscribe`,
                        unsubscribeHook: `${datasource_id}_${topic.topic}_unsubscribe`,
                        pubshlishHook: `${datasource_id}_${topic.topic}_publish`,

                        definitionHook: `${datasource_id}_${topic.topic}_definition`,
                    });
                }

                return topics;
            }
        });

        const getTopicFrequency = (topic: string) => {
            return available_topics.find(t => t.topic === topic)?.frequency || 30;  // default to 30hz
        };

        available_topics.forEach(topic => {
            pluginsManager.addAction(`${datasource_id}_${topic.topic}_subscribe`, {
                id: `random-data-source-subscribe-${topic.topic}`,
                priority: 10,
                action: (topic: DatasourceTopic) => {

                    subscribersCountRef.current.set(topic.topic, (subscribersCountRef.current.get(topic.topic) || 0) + 1);

                    if (intervalesRef.current.has(topic.topic)) {
                        return;
                    }

                    const freq = getTopicFrequency(topic.topic);

                    let old_value = Math.random();
                    const interval = setInterval(() => {

                        const value = old_value + Math.random() * 0.1 - 0.05;
                        old_value = value;

                        pluginsManager.doAction(`${datasource_id}_${topic.topic}_publish`, value, Date.now());
                    }, 1000 / freq); // Assuming freq is in hz

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

            pluginsManager.addFilter(`${datasource_id}_${topic.topic}_definition`, {
                id: `random-data-source-definition-${topic.topic}`,
                priority: 10,
                filter: () => {
                    // return a JsonSchema representing the topic message structure
                    return {
                        type: 'number'
                    };
                }
            });

        });

        return () => {

            pluginsManager.removeFilter(`${datasource_id}_available_topics`);

            available_topics.forEach(topic => {

                pluginsManager.doAction(`${datasource_id}_${topic.topic}_unsubscribe`, topic);
                pluginsManager.removeAction(`${datasource_id}_${topic.topic}_subscribe`);
                pluginsManager.removeAction(`${datasource_id}_${topic.topic}_unsubscribe`);
                pluginsManager.removeAction(`${datasource_id}_${topic.topic}_definition`);

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
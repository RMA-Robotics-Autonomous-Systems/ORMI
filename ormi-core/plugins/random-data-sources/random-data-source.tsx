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

import React, { createContext, useContext, ReactNode, useEffect, useRef, useState } from 'react';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';

import { RandomDataSourceSettings } from './index';
import { DatasourceTopic, SelectedTopic } from '@/core/datasources/datasource-interface';
import { Spinner } from '@/components/spinner';

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


        // create a custom event : 
        // datasource_id-topic-published
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

                const freq = getTopicFrequency(topic.topic);

                let old_value = Math.random();
                const interval = setInterval(() => {

                    const value = old_value + Math.random() * 0.1 - 0.05;
                    old_value = value;

                    pluginsManager.doAction(`${datasource_id}-${topic.topic}-published`, value, Date.now());
                }, 1000 / freq); // Assuming freq is in hz

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
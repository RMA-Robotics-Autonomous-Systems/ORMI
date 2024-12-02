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

import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';

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
    const [intervales, setIntervales] = useState<Map<string, NodeJS.Timeout>>(new Map());
    const [subscribers_count, setSubscribersCount] = useState<Map<string, number>>(new Map());

    useEffect(() => {

        const availables_topics = props.topics;

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {   // takes an array of DatasourceTopic
            id: 'random-data-source-available-topics',
            priority: 10,
            filter: () => {
                const topics: DatasourceTopic[] = [];
                for (const topic of availables_topics) {
                    topics.push({
                        topic: topic.topic,
                        source: datasource_id,
                        type: typeof (0)
                    });
                }
                return topics;
            }
        });

        const getTopicFrequency = (topic: string) => {
            const topic_freq = availables_topics.find(t => t.topic === topic)?.frequency;
            return topic_freq || 1000;
        }

        // for each topic, create a subscriber hook.
        for (const topic of availables_topics) {
            pluginsManager.addAction(datasource_id + "_" + topic.topic + "_" + "subscribe", {
                id: `random-data-source-subscribe-${topic.topic}`,
                priority: 10,
                action: (topic: DatasourceTopic) => {

                    // increment the subscribers count
                    const currentSubscribersCount = new Map(subscribers_count);
                    const count = currentSubscribersCount.get(topic.topic) || 0;
                    currentSubscribersCount.set(topic.topic, count + 1);
                    setSubscribersCount(currentSubscribersCount);

                    // only if the topic is not already subscribed
                    if (intervales.has(topic.topic)) {
                        return;
                    }

                    // create an interval to generate random data
                    const freq = getTopicFrequency(topic.topic);

                    const interval = setInterval(() => {
                        const value = Math.random();
                        pluginsManager.doAction(datasource_id + "_" + topic.topic + "_" + "publish", value, Date.now());
                    }, freq / 1000);


                    const currentIntervales = new Map(intervales);
                    currentIntervales.set(topic.topic, interval);
                    setIntervales(currentIntervales);
                }
            });

            pluginsManager.addAction(datasource_id + "_" + topic.topic + "_" + "unsubscribe", {
                id: `random-data-source-unsubscribe-${topic.topic}`,
                priority: 10,
                action: (topic: DatasourceTopic) => {
                    const interval = intervales.get(topic.topic);
                    if (interval) {

                        // decrement the subscribers count
                        const currentSubscribersCount = new Map(subscribers_count);
                        const count = currentSubscribersCount.get(topic.topic) || 0;
                        currentSubscribersCount.set(topic.topic, count - 1);
                        setSubscribersCount(currentSubscribersCount);

                        // if there are no more subscribers, remove the interval
                        if (count <= 1) {
                            clearInterval(interval);
                            const currentIntervales = new Map(intervales);
                            currentIntervales.delete(topic.topic);
                            setIntervales(currentIntervales);
                        }
                    }
                }
            });
        }

        return () => {
            for (const interval of intervales) {
                clearInterval(interval[1]);
            }

            pluginsManager.removeFilter('random-data-source-aivalable-topics');

            // for each topic, remove the subscriber hook, and unsubscribe hook and the publisher hook
            for (const topic of availables_topics) {
                pluginsManager.removeFilter(`random-data-source-subscribe-${topic.topic}`);
                pluginsManager.removeFilter(`random-data-source-unsubscribe-${topic.topic}`);
            }
        }

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
        throw new Error('usePlugins must be used within a RandomDataSourceProvider');
    }
    return context;
};

export { RandomDataSourceProvider, useRandomProvider };
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

import { toast } from '@/hooks/use-toast';
import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';

import { RandomDataSourceSettings } from './index';
import { DatasourceTopic } from '@/core/datasources/datasource-interface';

const RandomDataSourceContext = createContext(null);

// Create a provider component
const RandomDataSourceProvider: React.FC<{ children: ReactNode, props: RandomDataSourceSettings }> = ({ children, props }) => {

    const pluginsManager = usePluginsManager() as PluginsManager;

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
                        type: 'number',
                        source: 'random-data-source'
                    });
                }
                return topics;
            }
        });

        const intervales: NodeJS.Timeout[] = [];

        // foreach source, generate random data using the frequency to create a wave
        // for (const source of source_map.keys()) {

        //     const freq = availables_sources_freq[availables_sources.indexOf(source)];

        //     const interval = setInterval(() => {
        //         const source_data = source_map.get(source);

        //         const counter = counters.get(source) || 0;

        //         if (source_data) {


        //             const y = Math.sin((counter) * (1 / freq) * Math.PI * 2);

        //             source_data.data.push(y);

        //             source_data.times.push(Date.now());

        //             // keep only the last 10 values
        //             if (source_data.data.length > 200) {
        //                 source_data.data.shift();
        //                 source_data.times.shift();
        //             }

        //             setSources(new Map(source_map));
        //             setCounters(new Map(counters.set(source, (counter + 1) % 1000)));
        //         }
        //     }, freq);

        //     intervales.push(interval);
        // }

        return () => {
            for (const interval of intervales) {
                clearInterval(interval);
            }

            pluginsManager.removeFilter('random-data-source-aivalable-topics');
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
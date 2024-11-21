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


interface RandomDataSource {
    times: number[];
    data: number[];
}

interface RandomDataSourceManager {
    sources: Map<string, RandomDataSource>;
}


const RandomDataSourceContext = createContext<RandomDataSourceManager>({
    sources: new Map()
});


// Create a provider component
const RandomDataSourceProvider: React.FC<{ children: ReactNode, props: any }> = ({ children, props }) => {

    const [sources, setSources] = useState<Map<string, RandomDataSource>>(new Map());


    useEffect(() => {

        const availables_sources = ["/imu/vel/x", "source2", "source3"];

        const source_map = new Map<string, RandomDataSource>();

        if (!props.topics) {
            toast({
                title: 'Error',
                description: 'No topics available',
                variant: 'destructive',
            })
            return;
        }

        for (const topic of props.topics) {
            if (availables_sources.includes(topic.topic)) {
                source_map.set(topic.topic, {
                    times: [],
                    data: []
                });
            }
        }

        setSources(source_map);

        const intervales: NodeJS.Timeout[] = [];
        // foreach source, generate random data
        for (const source of source_map.keys()) {
            const interval = setInterval(() => {
                const source_data = source_map.get(source);
                if (source_data) {
                    source_data.data.push(Math.random());
                    source_data.times.push(Date.now());

                    // keep only the last 10 values
                    if (source_data.data.length > 10) {
                        source_data.data.shift();
                        source_data.times.shift();
                    }

                    setSources(new Map(source_map));
                }
            }, 16);
            intervales.push(interval);
        }


        return () => {
            for (const interval of intervales) {
                clearInterval(interval);
            }
        }

    }, []);

    return (
        <RandomDataSourceContext.Provider value={{ sources }}>
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
/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/


import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { DatasourceTopic } from '../datasource-interface';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';

interface LocalDataSources {
    sources: Map<string, Source<any>>;

}

interface Source<T> {
    data: T[];
    times: number[];
}

interface LocalDataSourcesProviderProps {
    children: ReactNode;
    TopicsProps: string[];
    buffersSize: number;
}

const LocalDataSourcesContext = createContext<LocalDataSources>({
});

const LocalDataSourcesProvider: React.FC<LocalDataSourcesProviderProps> = ({ children, TopicsProps, buffersSize }) => {

    const [sources, setSources] = useState<Map<string, Source<any>>>(new Map<string, Source<any>>());
    const pluginsManager = usePluginsManager();

    const Topics = (TopicsProps as string[]).map(topic => JSON.parse(topic.topic) as DatasourceTopic);

    useEffect(() => {
        // create a random id for the local datasource
        const local_id = "local-datasource-" + Math.random().toString(36).substring(7);

        // For each topic, create a source
        Topics.forEach(topic => {
            setSources(prev => {
                const newSources = new Map(prev);

                // create a source of the type of the topic
                const source: Source<any> = {
                    data: [],
                    times: []
                };

                newSources.set(topic.topic, source);

                return newSources;
            });

            // subscribe to the topic
            console.log("subscribed to topic", topic.topic);
            pluginsManager.doAction(topic.source + "_" + topic.topic + "_subscribe", topic);

            // add an action on the data hook of the topic
            console.log("adding action", topic.source + "_" + topic.topic + "_publish");
            pluginsManager.addAction(topic.source + "_" + topic.topic + "_publish", {
                id: `${local_id}_${topic.source}_${topic.topic}_publish`,
                priority: 10,
                action: (value: any, time: number) => {

                    setSources(prev => {

                        const newSources = new Map(prev);

                        // get the source
                        const source = newSources.get(topic.topic);
                        if (!source) {
                            return newSources;
                        }

                        // add the data to the source
                        source.data.push(value);
                        source.times.push(time);

                        if (source.data.length > buffersSize) {
                            source.data.shift();
                            source.times.shift();
                        }

                        newSources.set(topic.topic, source);

                        return newSources;
                    });
                }
            });

        });


        return () => {
            Topics.forEach(topic => {
                pluginsManager.doAction(topic.source + "_" + topic.topic + "_unsubscribe", topic);

                pluginsManager.removeAction(`${local_id}_${topic.source}_${topic.topic}_data`);

                console.log("unsubscribed from topic", topic.topic);
            });
        }

    }, []);


    return (
        <LocalDataSourcesContext.Provider value={{ sources }}>
            {children}
        </LocalDataSourcesContext.Provider>
    );
};

const useLocalsourceProvider = () => {
    const context = useContext(LocalDataSourcesContext);
    if (!context) {
        throw new Error('useLocalsourceProvider must be used within a GlobalDataSourcesProvider');
    }

    return context;
};

export { LocalDataSourcesProvider, useLocalsourceProvider };
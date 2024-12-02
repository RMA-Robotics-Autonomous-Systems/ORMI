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
    Topics: DatasourceTopic[] | string[];
    buffersSize: number;
}

const LocalDataSourcesContext = createContext<LocalDataSources>({
});

const LocalDataSourcesProvider: React.FC<LocalDataSourcesProviderProps> = ({ children, Topics, buffersSize }) => {

    const [sources, setSources] = useState<Map<string, Source<any>>>(new Map<string, Source<any>>());
    const pluginsManager = usePluginsManager();

    // if the topics are strings, convert them to DatasourceTopic by using JSON.parse
    if (typeof Topics[0] === "string") {
        Topics = Topics.map(topic => JSON.parse(topic) as DatasourceTopic);
    }

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
            pluginsManager.doAction(topic.source + "_" + topic.topic + "_subscribe", topic);

            // add an action on the data hook of the topic
            pluginsManager.addAction(topic.source + "_" + topic.topic + "_data", {
                id: `${local_id}_${topic.source}_${topic.topic}_data`,
                priority: 10,
                action: (data: any, topic: DatasourceTopic) => {
                    setSources(prev => {
                        const newSources = new Map(prev);

                        // get the source
                        const source = newSources.get(topic.topic);
                        if (!source) {
                            return newSources;
                        }

                        // add the data to the source
                        source.data.push(data);
                        source.times.push(Date.now());

                        // if the buffer is full, remove the first element
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
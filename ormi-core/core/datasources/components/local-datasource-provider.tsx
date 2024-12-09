/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/


import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';

import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { SelectedTopic } from '@/core/jsonforms/topic-selector/topic-selector';

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
    sources: new Map<string, Source<any>>()
});

const LocalDataSourcesProvider: React.FC<LocalDataSourcesProviderProps> = ({ children, TopicsProps, buffersSize }) => {

    const [sources, setSources] = useState<Map<string, Source<any>>>(new Map<string, Source<any>>());
    // const sources = useRef<Map<string, Source<any>>>(new Map<string, Source<any>>()).current;
    const pluginsManager = usePluginsManager();

    const Topics = (TopicsProps as any[]).map(topic => JSON.parse(topic.topic) as SelectedTopic);

    useEffect(() => {
        // create a random id for the local datasource
        const local_id = "local-datasource-" + Math.random().toString(36).substring(7);

        const propertiesGetter = (data: any, property: string) => {
            /*
                create a function that gets the value of the property from the data
                the property is a string that is in the form of "property1-property2-property3"

                the properties are recursively accessed from the data object

                the function should return the value of the property from the data
            */

            if (!property || property === '') {
                return data;
            }

            const properties = property.split('-');

            let value = data;
            for (const prop of properties) {
                value = value[prop];
            }

            return value;
        }

        // For each topic, create a source
        Topics.forEach(topic => {

            const sourceId = (topic.property !== '') ? topic.topic + "+" + topic.property : topic.topic;

            sources.set(sourceId, {
                data: [],
                times: []
            });

            // subscribe to the topic
            pluginsManager.doAction(topic.source + "_" + topic.topic + "_subscribe", topic);

            // add an action on the data hook of the topic
            pluginsManager.addAction(topic.source + "_" + topic.topic + "_publish", {
                id: `${local_id}_${topic.source}_${topic.topic}_${topic.property}_publish`,
                priority: 10,
                action: (value: any, time: number) => {

                    const source = sources.get(sourceId);

                    if (!source) {
                        console.error('source not found', sourceId, sources);
                        return;
                    }

                    if (topic.property && topic.property !== '') {
                        value = propertiesGetter(value, topic.property);
                    }

                    source.data.push(value);
                    source.times.push(time);

                    if (source.data.length > buffersSize) {
                        source.data.shift();
                        source.times.shift();
                    }

                    setSources(new Map(sources));
                }
            });

        });

        return () => {
            Topics.forEach(topic => {
                pluginsManager.doAction(topic.source + "_" + topic.topic + "_unsubscribe", topic);

                pluginsManager.removeAction(`${local_id}_${topic.source}_${topic.topic}_${topic.property}_publish`);
            });
        }

    }, [TopicsProps]);


    return (
        <LocalDataSourcesContext.Provider value={{ sources }}>
            {children}
        </LocalDataSourcesContext.Provider>
    );
};

const useLocalDataSource = () => {
    const context = useContext(LocalDataSourcesContext);
    if (!context) {
        throw new Error('useLocalDataSource must be used within a GlobalDataSourcesProvider');
    }

    return context;
};

export { LocalDataSourcesProvider, useLocalDataSource };
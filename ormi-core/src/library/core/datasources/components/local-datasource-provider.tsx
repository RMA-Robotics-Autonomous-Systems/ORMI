"use client"
/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/


import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';


import { usePluginsManager } from '@/library/core/plugins/components/plugins-provider';
import { useDashboardManager } from '@/library/core/dashboard/components/dashboard-provider';
import { toast } from '@/library/hooks/use-toast';
import { SelectedTopic } from '../datasource-interface';
import { Spinner } from '@/library/components/spinner';

interface LocalDataSources {
    sources: Map<string, Source<any>>;
}

interface Source<T> {
    data: T[];
    times: number[];
}

interface LocalDataSourcesProviderProps {
    children: ReactNode;
    SelectedTopics: SelectedTopic[];
    buffersSize: number;
}

const LocalDataSourcesContext = createContext<LocalDataSources>({
    sources: new Map<string, Source<any>>()
});

const LocalDataSourcesProvider = (props: LocalDataSourcesProviderProps) => {

    const { children, SelectedTopics, buffersSize } = props;

    const [sources, setSources] = useState<Map<string, Source<any>>>(new Map<string, Source<any>>());
    // const sources = useRef<Map<string, Source<any>>>(new Map<string, Source<any>>()).current;
    const pluginsManager = usePluginsManager();

    const Topics = SelectedTopics;

    const local_id = useRef(Math.random().toString(36).substring(7)).current;

    const [initialized, setInitialized] = useState(false);

    const { datasources } = useDashboardManager();

    useEffect(() => {
        // create a random id for the local datasource

        sources.clear();

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

        let isMounted = true;

        new Promise<Map<string, boolean>>((resolve) => {

            const initializedTopics = new Map<string, boolean>();

            function setInitializedTopic(topic: string, state: boolean) {
                if (!isMounted) return;
                initializedTopics.set(topic, state);
                if (initializedTopics.size === Topics.length) {
                    resolve(initializedTopics);
                }
            }

            // For each topic, create a source
            Topics.forEach(async topic => {

                const sourceId = (topic.property !== '') ? topic.topic + "+" + topic.property : topic.topic;

                sources.set(sourceId, {
                    data: [],
                    times: []
                });

                // subscribe to the topic, this start the data flow inside the datasource
                // this triggers the published action on the data hook of the topic
                console.log('ask to subscribe to topic', topic);
                const result = await pluginsManager.WaitAndDoAction(`${topic.source.id}-subscribe`, 1, topic)

                if (result === false) {
                    setInitializedTopic(topic.topic, false);
                    return;
                }

                // add an action on the data hook of the topic, will only be triggered when the data is published, and if the topic is subscribed
                //topic.source.id + "-" + topic.topic + "-published"
                pluginsManager.addAction(`${topic.source.id}-${topic.topic}-published`, {
                    id: `${local_id}-${topic.source.id}-${topic.topic}_${topic.property}-published`,
                    priority: 10,
                    action: (value: any, time: number) => {
                        if (!isMounted) return;

                        // Use the functional update form of setSources
                        setSources(prevSources => {
                            const currentSource = prevSources.get(sourceId);

                            if (!currentSource) {
                                console.error('source not found during update', sourceId, prevSources);
                                return prevSources; // Return previous state if source not found
                            }

                            let processedValue = value;
                            if (topic.property && topic.property !== '') {
                                processedValue = propertiesGetter(value, topic.property);
                            }

                            // Create new arrays for immutability
                            const newData = [...currentSource.data, processedValue];
                            const newTimes = [...currentSource.times, time];

                            // Apply buffer limit
                            const bufferLimit = topic.bufferSize || buffersSize;
                            if (newData.length > bufferLimit) {
                                newData.shift(); // Remove oldest element from the new array
                                newTimes.shift(); // Remove corresponding time from the new array
                            }

                            // Create a new source object
                            const newSource = {
                                data: newData,
                                times: newTimes,
                            };

                            // Create a new map for the new state
                            const newSources = new Map(prevSources);
                            newSources.set(sourceId, newSource);

                            return newSources; // Return the new map as the next state
                        });
                    }
                });

                setInitializedTopic(topic.topic, true);
            });


        }).then((initializedTopics) => {
            if (!isMounted) return;

            // add toast for the topics that are not initialized
            const notInitializedTopics = Topics.filter(topic => !initializedTopics.get(topic.topic));

            const message = (
                <div>
                    <div>Some topics are not initialized:</div>
                    <ul>
                        {notInitializedTopics.map((topic, index) => <li key={`${topic.topic}-${index}`}>{topic.topic}</li>)}
                    </ul>
                </div>
            )

            if (notInitializedTopics.length > 0) {
                toast({
                    title: "Error",
                    description: message,
                    variant: "destructive"
                });
            }

            setInitialized(true);
        });

        return () => {
            isMounted = false;
            Topics.forEach(async topic => {
                // unsubscribe from the topic, if no other widget is subscribed to the topic, the data flow will stop
                // await pluginsManager.WaitForActionToExist(`${topic.source}-unsubscribe`);
                // pluginsManager.doAction(`${topic.source}-unsubscribe`, topic);
                console.log('ask to unsubscribe from topic', topic);
                await pluginsManager.WaitAndDoAction(`${topic.source.id}-unsubscribe`, 1, topic);

                // remove the action that was added to the data hook of the topic,
                pluginsManager.removeAction(`${local_id}-${topic.source.id}-${topic.topic}_${topic.property}-published`);
            });
        }

    }, [SelectedTopics, datasources, buffersSize]);


    return (
        <LocalDataSourcesContext.Provider value={{ sources }}>
            {initialized && children}
            {!initialized && <Spinner />}
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
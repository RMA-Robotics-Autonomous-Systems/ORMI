"use client"
/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/

import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { SelectedTopic } from '../datasource-interface';

import { useDashboardManager } from '../../dashboard/components/dashboard-provider';
import { toast } from 'sonner';
import { Spinner } from '@workspace/ui/components/spinner';

import { usePluginsManager } from '@workspace/ormi-plugins';



interface LocalDataSources {
    sources: Map<string, Source<any>>;
}

interface Source<T> {
    data: T[];
    times: number[];
    referenceFrameId: string;   // reference frame id, used to identify the reference frame of the data
}

interface LocalDataSourcesProviderProps {
    children: ReactNode;
    SelectedTopics: SelectedTopic[];
    buffersSize: number;
    updateFrequency?: number; // Hz, default is 30Hz
}

const LocalDataSourcesContext = createContext<LocalDataSources>({
    sources: new Map<string, Source<any>>()
});

const LocalDataSourcesProvider = (props: LocalDataSourcesProviderProps) => {
    const { children, SelectedTopics, buffersSize, updateFrequency = 30 } = props;

    const [sources, setSources] = useState<Map<string, Source<any>>>(new Map<string, Source<any>>());
    // Store pendingUpdates in useRef to persist between renders but not trigger re-renders
    const pendingUpdatesRef = useRef<Map<string, { value: any, time: number, referenceFrameId: string }>>(
        new Map<string, { value: any, time: number, referenceFrameId: string }>()
    );
    // Access the pendingUpdates through the .current property
    const pendingUpdates = pendingUpdatesRef.current;

    // Create a stable reference to the context value
    const contextValue = useRef<LocalDataSources>({ sources });

    // Update the context value reference whenever sources changes
    useEffect(() => {
        contextValue.current = { sources };
    }, [sources]);

    const pluginsManager = usePluginsManager();
    const Topics = SelectedTopics;
    const local_id = useRef(Math.random().toString(36).substring(7)).current;
    const [initialized, setInitialized] = useState(false);
    const { datasources } = useDashboardManager();
    const [updateCount, setUpdateCount] = useState(0);

    useEffect(() => {
        // Clear any pending updates
        pendingUpdates.clear();

        // Pre-compute topic lookup map for O(1) access
        const topicLookupMap = new Map<string, SelectedTopic>();
        Topics.forEach(topic => {
            const sourceId = (topic.property !== '') ? topic.topic + "+" + topic.property : topic.topic;
            topicLookupMap.set(sourceId, topic);
        });

        // Initialize the sources map with empty sources for all topics
        setSources(prevSources => {
            const newSources = new Map<string, Source<any>>();

            // Initialize empty sources for all topics
            Topics.forEach(topic => {
                const sourceId = (topic.property !== '') ? topic.topic + "+" + topic.property : topic.topic;
                newSources.set(sourceId, {
                    data: [],
                    times: [],
                    referenceFrameId: "unknown"
                });
            });

            return newSources;
        });

        const propertiesGetter = (data: any, property: string) => {
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

        // Set up the throttling interval
        const updateInterval = 1000 / updateFrequency; // milliseconds between updates

        const intervalId = setInterval(() => {
            if (!isMounted) return;

            if (pendingUpdates.size === 0) return;

            setSources(prevSources => {
                // Only update if there are actually pending updates
                if (pendingUpdates.size === 0) return prevSources;

                // For performance with large datasets, only copy sources that need updates
                const sourcesToUpdate = new Set(pendingUpdates.keys());

                // If only a few sources need updates, be more selective
                if (sourcesToUpdate.size <= 3 && prevSources.size > 5) {
                    const newSources = new Map(prevSources);

                    pendingUpdates.forEach((update, sourceId) => {
                        const currentSource = newSources.get(sourceId);
                        if (!currentSource) return;

                        // Get buffer limit using O(1) lookup
                        const topic = topicLookupMap.get(sourceId);
                        const bufferLimit = topic?.bufferSize || buffersSize;

                        // Efficient buffer management
                        let newData: any[];
                        let newTimes: number[];

                        if (currentSource.data.length < bufferLimit) {
                            newData = [...currentSource.data, update.value];
                            newTimes = [...currentSource.times, update.time];
                        } else {
                            newData = [...currentSource.data.slice(1), update.value];
                            newTimes = [...currentSource.times.slice(1), update.time];
                        }

                        newSources.set(sourceId, {
                            data: newData,
                            times: newTimes,
                            referenceFrameId: update.referenceFrameId || "unknown"
                        });
                    });

                    pendingUpdates.clear();
                    setUpdateCount(prev => prev + 1);
                    return newSources;
                }

                // Fallback to full copy for many updates
                const newSources = new Map<string, Source<any>>();

                // First copy all existing sources
                prevSources.forEach((source, key) => {
                    newSources.set(key, { ...source });
                });

                // Then apply updates
                pendingUpdates.forEach((update, sourceId) => {
                    const currentSource = newSources.get(sourceId);
                    if (!currentSource) {
                        return;
                    }

                    // Get buffer limit using O(1) lookup
                    const topic = topicLookupMap.get(sourceId);
                    const bufferLimit = topic?.bufferSize || buffersSize;

                    // Efficient buffer management - avoid array spread when possible
                    let newData: any[];
                    let newTimes: number[];

                    if (currentSource.data.length < bufferLimit) {
                        // Still room in buffer - simple append
                        newData = [...currentSource.data, update.value];
                        newTimes = [...currentSource.times, update.time];
                    } else {
                        // Buffer full - use slice for efficient removal + append
                        newData = [...currentSource.data.slice(1), update.value];
                        newTimes = [...currentSource.times.slice(1), update.time];
                    }

                    // Update the source with new data - create a new object
                    newSources.set(sourceId, {
                        data: newData,
                        times: newTimes,
                        referenceFrameId: update.referenceFrameId || "unknown"
                    });
                });

                // Increment update counter to verify updates are happening
                setUpdateCount(prev => prev + 1);

                // Clear pending updates after processing
                pendingUpdates.clear();

                return newSources;
            });
        }, updateInterval);

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

                // subscribe to the topic, this start the data flow inside the datasource
                const result = await pluginsManager.WaitAndDoAction(`${topic.source.id}-subscribe`, 1, topic)

                if (result === false) {
                    setInitializedTopic(topic.topic, false);
                    return;
                }

                // add an action on the data hook of the topic, will only be triggered when the data is published, and if the topic is subscribed
                pluginsManager.addAction(`${topic.source.id}-${topic.topic}-published`, {
                    id: `${local_id}-${topic.source.id}-${topic.topic}_${topic.property}-published`,
                    priority: 10,
                    action: (value: any, time: number, referenceFrameId: string) => {
                        if (!isMounted) return;

                        let processedValue = value;
                        if (topic.property && topic.property !== '') {
                            processedValue = propertiesGetter(value, topic.property);
                        }

                        // Store in pendingUpdates
                        pendingUpdates.set(sourceId, {
                            value: processedValue,
                            time,
                            referenceFrameId: referenceFrameId || "unknown"
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
                toast("Some topics are not initialized: " + notInitializedTopics.map(topic => topic.topic).join(", "));
            }

            setInitialized(true);
        });

        return () => {
            isMounted = false;
            clearInterval(intervalId);

            Topics.forEach(async topic => {
                // unsubscribe from the topic, if no other widget is subscribed to the topic, the data flow will stop
                await pluginsManager.WaitAndDoAction(`${topic.source.id}-unsubscribe`, 1, topic);

                // remove the action that was added to the data hook of the topic,
                pluginsManager.removeAction(`${local_id}-${topic.source.id}-${topic.topic}_${topic.property}-published`);
            });
        }

    }, [SelectedTopics, datasources, buffersSize, updateFrequency]);

    return (
        <LocalDataSourcesContext.Provider value={contextValue.current}>
            {initialized && children}
            {!initialized && <Spinner />}
        </LocalDataSourcesContext.Provider>
    );
};

// Hook to force updates when data changes
const useLocalDataSource = () => {
    const context = useContext(LocalDataSourcesContext);
    if (!context) {
        throw new Error('useLocalDataSource must be used within a GlobalDataSourcesProvider');
    }

    // Use a ref to track the last known sources size to detect changes more efficiently
    const lastSizeRef = useRef(0);
    const [, forceUpdate] = useState({});

    useEffect(() => {
        const intervalId = setInterval(() => {
            const currentSize = context.sources.size;
            if (currentSize !== lastSizeRef.current) {
                lastSizeRef.current = currentSize;
                forceUpdate({});
            }
        }, 50); // Reduced from 100ms to 50ms for better responsiveness

        return () => clearInterval(intervalId);
    }, [context.sources]);

    return context;
};

export { LocalDataSourcesProvider, useLocalDataSource };
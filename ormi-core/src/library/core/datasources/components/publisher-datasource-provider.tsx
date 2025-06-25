"use client"
/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/


import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';

import { usePluginsManager } from '@/library/core/plugins/components/plugins-provider';
import { useDashboardManager } from '@/library/core/dashboard/components/dashboard-provider';
import { toast } from 'ormi-components';
import PluginsManager from '@/library/core/plugins/plugins-manager';
import { SelectedTopic } from '../datasource-interface';
import { Spinner } from 'ormi-components'; // Import Spinner

interface PublisherDataSources {
    publishers: Map<string, Publisher>;
}

interface PublisherDataSourcesProviderProps {
    children: ReactNode;
    SelectedTopics: SelectedTopic[];
}

class Publisher {

    topic: SelectedTopic;

    pm: PluginsManager;

    constructor(topic: SelectedTopic, pluginManager: PluginsManager) {
        this.topic = topic;
        this.pm = pluginManager;
    }

    async advertise() {
        console.log("ask to advertise", this.topic);
        return await this.pm.applyFilterAsync(`${this.topic.source.id}-advertise`, this.topic);
    }

    unadvertise() {
        console.log("ask to unadvertise", this.topic);
        this.pm.doAction(`${this.topic.source.id}-unadvertise`, this.topic);
    }

    publish<T>(data: T, webtype: string) {
        this.pm.doAction(`${this.topic.source.id}-${this.topic.topic}-publish`, this.topic, data, webtype);
    }
}


const PublisherDataSourcesContext = createContext<PublisherDataSources>({
    publishers: new Map<string, Publisher>()
});

const PublisherDataSourcesProvider = (props: PublisherDataSourcesProviderProps) => {

    const { children, SelectedTopics } = props;

    const pluginsManager = usePluginsManager();

    const Topics = SelectedTopics;

    const [publishers, setPublishers] = useState<Map<string, Publisher>>(new Map());
    const publishersRef = useRef<Map<string, Publisher>>(new Map()); // Ref to hold publishers for cleanup
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        let isMounted = true; // Flag to track mount status
        publishersRef.current = new Map(); // Reset ref on effect run

        new Promise<Map<string, boolean>>((resolve) => {

            const initializedTopics = new Map<string, boolean>();

            function setInitializedTopic(topic: string, state: boolean) {
                if (!isMounted) return; // Check mount status
                initializedTopics.set(topic, state);
                // Resolve only if all topics have reported status
                if (initializedTopics.size === Topics.length) {
                    resolve(initializedTopics);
                }
            }

            // Handle empty topics case
            if (Topics.length === 0) {
                resolve(initializedTopics);
                return;
            }

            // For each topic, create a source
            Topics.forEach(async topic => {
                if (!isMounted) return; // Check before async operation

                const publisher = new Publisher(topic, pluginsManager);
                let result = false; // Default to false

                try {
                    result = await publisher.advertise() as boolean;
                    if (isMounted && result) {
                        // Update state and ref only if successful and mounted
                        setPublishers((prev) => {
                            const newPublishers = new Map(prev);
                            newPublishers.set(topic.topic, publisher);
                            publishersRef.current = newPublishers; // Keep ref in sync with state
                            return newPublishers;
                        });
                    }
                } catch (error) {
                    console.error(`Failed to advertise topic ${topic.topic}:`, error);
                    // Keep result as false
                } finally {
                    // Always report status, even on failure
                    setInitializedTopic(topic.topic, result);
                }
            });


        }).then((initializedTopics) => {
            if (!isMounted) return; // Check mount status

            // add toast for the topics that are not initialized
            const notInitializedTopics = Topics.filter(topic => !initializedTopics.get(topic.topic));

            if (notInitializedTopics.length > 0) {
                const message = (
                    <div>
                        <div>Failed to initialize publishers for topics:</div>
                        <ul>
                            {notInitializedTopics.map((topic, index) => <li key={`${topic.topic}-${index}`}>{topic.topic}</li>)}
                        </ul>
                    </div>
                )
                toast("Failed to initialize publishers for topics: " + notInitializedTopics.map(topic => topic.topic).join(", "));
            }

            setInitialized(true); // Set initialized regardless of individual topic success
        });

        return () => {
            isMounted = false; // Set flag on cleanup
            console.log("Unmounting publisher data source provider, unadvertising topics...");
            // Use the ref for cleanup
            publishersRef.current.forEach(publisher => {
                try {
                    publisher.unadvertise();
                } catch (error) {
                    console.error(`Error unadvertising topic ${publisher.topic.topic}:`, error);
                }
            });
            publishersRef.current.clear(); // Clear the ref
            setPublishers(new Map()); // Reset state
            setInitialized(false); // Reset initialized state
        }

        // Rerun effect if SelectedTopics change
    }, [SelectedTopics, pluginsManager]);


    return (
        <PublisherDataSourcesContext.Provider value={{ publishers }}>
            {initialized && children}
            {!initialized && <Spinner />} {/* Use Spinner */}
        </PublisherDataSourcesContext.Provider>
    );
};

const usePublisherDataSource = () => {
    const context = useContext(PublisherDataSourcesContext);
    if (!context) {
        throw new Error('useLocalDataSource must be used within a GlobalDataSourcesProvider');
    }

    return context;
};

export { PublisherDataSourcesProvider, usePublisherDataSource };
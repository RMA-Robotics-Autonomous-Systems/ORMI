"use client"
/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/


import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { usePluginsManager } from '@/library/core/plugins/components/plugins-provider';
import { useDashboardManager } from '@/library/core/dashboard/components/dashboard-provider';
import { toast } from '@/library/hooks/use-toast';
import PluginsManager from '@/library/core/plugins/plugins-manager';
import { SelectedTopic } from '../datasource-interface';

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
        return await this.pm.applyFilterAsync(`${this.topic.source.id}-advertise`, this.topic);
    }

    unadvertise() {
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

    // const sources = useRef<Map<string, Source<any>>>(new Map<string, Source<any>>()).current;
    const pluginsManager = usePluginsManager();

    const Topics = SelectedTopics;

    const [publishers, setPublishers] = useState<Map<string, Publisher>>(new Map());
    const [initialized, setInitialized] = useState(false);

    const { datasources } = useDashboardManager();

    useEffect(() => {
        new Promise<Map<string, boolean>>((resolve) => {

            const initializedTopics = new Map<string, boolean>();

            function setInitializedTopic(topic: string, state: boolean) {
                initializedTopics.set(topic, state);
                if (initializedTopics.size === Topics.length) {
                    resolve(initializedTopics);
                }
            }

            // For each topic, create a source
            Topics.forEach(async topic => {

                const publisher = new Publisher(topic, pluginsManager);

                const result = await publisher.advertise();

                setPublishers((prev) => {
                    const newPublishers = new Map(prev);
                    newPublishers.set(topic.topic, publisher);
                    return newPublishers;
                });

                setInitializedTopic(topic.topic, result as boolean);
            });


        }).then((initializedTopics) => {

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
            // for each publisher, destroy it
            publishers.forEach(publisher => {
                publisher.unadvertise();
            });
        }

    }, [SelectedTopics, datasources]);


    return (
        <PublisherDataSourcesContext.Provider value={{ publishers }}>
            {initialized && children}
            {!initialized && <div>Loading...</div>}
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
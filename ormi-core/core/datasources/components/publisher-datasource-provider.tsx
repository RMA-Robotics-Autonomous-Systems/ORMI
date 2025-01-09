/*
    This file is responsible for providing the local datasource to the widgets.
    it manages the subscriptions and unsubscriptions of the widgets to the datasource topics.

    it also manages the buffer of the data that is being sent to the widgets.
*/


import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';

import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { SelectedTopic } from '@/core/jsonforms/topic-selector/topic-selector';
import { useDashboardManager } from '@/core/dashboard/components/dashboard-provider';
import { toast } from '@/hooks/use-toast';
import { DatasourceTopic } from '../datasource-interface';
import PluginsManager from '@/core/plugins/plugins-manager';

interface PublisherDataSources {
    publishers: Map<string, Publisher>;
}

interface PublisherDataSourcesProviderProps {
    children: ReactNode;
    TopicsProps: string[];
}

class Publisher {

    topic: SelectedTopic;

    pm: PluginsManager;

    constructor(topic: SelectedTopic, pluginManager: PluginsManager) {
        this.topic = topic;
        this.pm = pluginManager;
    }

    async advertise() {

        const result = await this.pm.applyFilterAsync(`${this.topic.source}-advertise`, this.topic);

        return result;
    }

    unadvertise() {

        this.pm.doAction(`${this.topic.source}-unadvertise`, this.topic);

    }

    publish<T>(data: T) {
        this.pm.doAction(`${this.topic.source}-${this.topic.topic}-publish`, this.topic, data);
    }
}


const PublisherDataSourcesContext = createContext<PublisherDataSources>({
    publishers: new Map<string, Publisher>()
});

const PublisherDataSourcesProvider: React.FC<PublisherDataSourcesProviderProps> = ({ children, TopicsProps }) => {

    // const sources = useRef<Map<string, Source<any>>>(new Map<string, Source<any>>()).current;
    const pluginsManager = usePluginsManager();

    const Topics = (TopicsProps as any[]).map(topic => JSON.parse(topic.topic) as SelectedTopic);

    const local_id = useRef(Math.random().toString(36).substring(7)).current;

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

                console.log('PublisherDataSourcesProvider', topic.topic, result);

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

            console.log('PublisherDataSourcesProvider initialized');
            setInitialized(true);
        });

        return () => {
            // for each publisher, destroy it
            publishers.forEach(publisher => {
                publisher.unadvertise();
            });
        }

    }, [TopicsProps, datasources]);


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
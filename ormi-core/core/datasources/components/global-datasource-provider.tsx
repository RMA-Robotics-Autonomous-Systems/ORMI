"use client";



/*
    Load all available datasources and create a provider for them

    - allow to interact with all datasources

*/


import { toast } from '@/hooks/use-toast';
import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { Datasource, DatasourceDefinition, DatasourceTopic } from '../datasource-interface';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '../../plugins/plugins-types';

interface GlobalDataSources {
    dataSourcesTypes: Map<string, DatasourceDefinition>;

    availableDataSources: Map<string, Datasource>;

    getAvailableTopics: (type?: string) => DatasourceTopic[];

    subScribeToTopic: (topic: DatasourceTopic) => void;
}

const GlobalDataSourcesContext = createContext<GlobalDataSources>({
    dataSourcesTypes: new Map(),
    availableDataSources: new Map(),
    getAvailableTopics: (type: string = "") => [],
    subScribeToTopic: () => { }
});

const GlobalDataSourcesProvider: React.FC<{ children: ReactNode, datasources: Map<string, Datasource> }> = ({ children, datasources }) => {

    const [dataSourcesTypes, setDataSourcesTypes] = useState<Map<string, DatasourceDefinition>>(new Map());
    const [availableDataSources, setAvailableDataSources] = useState<Map<string, Datasource>>(datasources);

    const pluginsManager = usePluginsManager() as PluginsManager;

    useEffect(() => {

        const dataSourcesTypes_array = pluginsManager.applyFilter(PluginsHooks.DATASOURCES_LIST, []);
        const dataSourcesTypes_map = new Map<string, DatasourceDefinition>();
        for (const dataSource of dataSourcesTypes_array) {
            dataSourcesTypes_map.set(dataSource.id, dataSource);
        }
        setDataSourcesTypes(dataSourcesTypes_map);

    }, []);

    const getProvider = (datasource_id: string) => {
        const dataSourceType = dataSourcesTypes.get(datasource_id);
        if (!dataSourceType) {
            toast({
                title: 'Error',
                description: `Datasource ${datasource_id} not found`,
                variant: 'destructive',
            })
            return null;
        }
        return dataSourceType.Provider;
    };

    const getAvailableTopics = (type: string = "") => {
        const topics = pluginsManager.applyFilter(PluginsHooks.AVAILABLE_TOPICS, []);

        if (type) {
            return topics.filter((topic: DatasourceTopic) => topic.type === type);
        }

        return topics;
    }

    const subScribeToTopic = (topic: DatasourceTopic) => {
        // console.log('Subscribing to topic', topic);
    }

    return (
        <GlobalDataSourcesContext.Provider value={{ dataSourcesTypes, availableDataSources, getAvailableTopics, subScribeToTopic }}>
            {Array.from(availableDataSources.values()).reduceRight((acc, datasource) => {
                const Provider = getProvider(datasource.datasource_id);
                if (!Provider) {
                    return acc;
                }
                return (
                    <Provider props={datasource.settings}>
                        {acc}
                    </Provider>
                );
            }, children)}
        </GlobalDataSourcesContext.Provider>
    );
}

const useGlobalDataSources = () => useContext(GlobalDataSourcesContext);

export { GlobalDataSourcesProvider, useGlobalDataSources };
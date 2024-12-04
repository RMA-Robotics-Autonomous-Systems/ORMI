"use client";



/*
    Load all available datasources and create a provider for them

    - allow to interact with all datasources

*/


import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { Datasource, DatasourceDefinition } from '../datasource-interface';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '../../plugins/plugins-types';

interface GlobalDataSources {
    dataSourcesTypes: Map<string, DatasourceDefinition>;
    availableDataSources: Map<string, Datasource>;
}

const GlobalDataSourcesContext = createContext<GlobalDataSources>({
    dataSourcesTypes: new Map(),
    availableDataSources: new Map(),
});

const GlobalDataSourcesProvider: React.FC<{ children: ReactNode, datasources: Map<string, Datasource> }> = ({ children, datasources }) => {

    const [dataSourcesTypes, setDataSourcesTypes] = useState<Map<string, DatasourceDefinition>>(new Map());
    const [availableDataSources] = useState<Map<string, Datasource>>(datasources);

    const pluginsManager = usePluginsManager() as PluginsManager;

    const [initialized, setInitialized] = useState(false);

    useEffect(() => {

        const dataSourcesTypes_array = pluginsManager.applyFilter<DatasourceDefinition[]>(PluginsHooks.DATASOURCES_LIST, []);
        const dataSourcesTypes_map = new Map<string, DatasourceDefinition>();
        for (const dataSource of dataSourcesTypes_array) {
            dataSourcesTypes_map.set(dataSource.id, dataSource);
        }
        setDataSourcesTypes(dataSourcesTypes_map);
        setInitialized(true);

    }, []);

    const getProvider = (datasource_id: string) => {
        const dataSourceType = dataSourcesTypes.get(datasource_id);
        if (!dataSourceType) {
            console.error(`Datasource ${datasource_id} not found`);
            return null;
        }
        return dataSourceType.Provider;
    };

    return (
        <GlobalDataSourcesContext.Provider value={{ dataSourcesTypes, availableDataSources }}>
            {initialized && Array.from(availableDataSources.values()).reduceRight((children_stack, datasource) => {
                const Provider = getProvider(datasource.datasource_id);
                if (!Provider) {
                    return children_stack;
                }
                return (
                    <Provider props={datasource.settings}>
                        {children_stack}
                    </Provider>
                );
            }, children)}
        </GlobalDataSourcesContext.Provider>
    );
}

const useGlobalDataSources = () => {
    const context = useContext(GlobalDataSourcesContext);
    if (!context) {
        throw new Error('useGlobalDataSources must be used within a GlobalDataSourcesProvider');
    }

    return context;
};

export { GlobalDataSourcesProvider, useGlobalDataSources };
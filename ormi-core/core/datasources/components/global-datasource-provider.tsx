"use client";

/*
    Load all available datasources and create a provider for them

    - allow to interact with all datasources

*/

import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { DatasourceDefinition, DatasourceProviderSettings } from '../datasource-interface';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '../../plugins/plugins-types';
import { useNavbar } from '@/components/advanced/navbar/navbar-provider';
import { Button } from '@/components/ui/button';
import { CheckIcon, CloudCogIcon } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';


import DatasourceCard from './datasource-card';
import { useDashboardManager } from '@/core/dashboard/components/dashboard-provider';
import DatasourceAdder from './datasource-adder';



type GlobalDataSources = object;

const GlobalDataSourcesContext = createContext<GlobalDataSources>({});

const GlobalDataSourcesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {

    const { datasources, updateDatasource, addDatasource, removeDatasource } = useDashboardManager();

    const [dataSourcesTypes, setDataSourcesTypes] = useState<Map<string, DatasourceDefinition<DatasourceProviderSettings>>>(new Map());

    const pluginsManager = usePluginsManager() as PluginsManager;

    const [initialized, setInitialized] = useState(false);

    const { setNavbarItem, removeNavbarItem } = useNavbar();

    useEffect(() => {
        const dataSourcesTypes_array = pluginsManager.applyFilter<DatasourceDefinition<DatasourceProviderSettings>[]>(PluginsHooks.DATASOURCES_LIST, []);
        const dataSourcesTypes_map = new Map<string, DatasourceDefinition<DatasourceProviderSettings>>();
        for (const dataSource of dataSourcesTypes_array) {
            dataSourcesTypes_map.set(dataSource.id, dataSource);
        }
        setDataSourcesTypes(dataSourcesTypes_map);
        setInitialized(true);
    }, []);

    useEffect(() => {

        function getDatasourceDef(datasource_id: string): DatasourceDefinition<DatasourceProviderSettings> {
            if (!dataSourcesTypes.has(datasource_id)) {
                console.error(`Datasource ${datasource_id} not found`);
                throw new Error(`Datasource ${datasource_id} not found`);
            }
            return dataSourcesTypes.get(datasource_id)!;
        }

        function handleAdd(datasource_id: string) {
            addDatasource(datasource_id);
        }

        function handleRemove(source_id: string) {
            removeDatasource(source_id);
        }

        setNavbarItem("center", "datasources_combo",
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant={"ghost"}>Datasources <CloudCogIcon /></Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Datasources</DialogTitle>
                        <DialogDescription>
                            Setup the different datasources used in this workspace.
                        </DialogDescription>
                        <div>
                            <div>
                                {Array.from(datasources.values()).map((datasource) => {
                                    return (
                                        <DatasourceCard onRemove={handleRemove} data={datasource.settings} key={datasource.settings.id} definition={getDatasourceDef(datasource.datasource_id)} onValidate={function (datasource_def, settings: DatasourceProviderSettings): void {
                                            updateDatasource(datasource.datasource_id, settings);
                                        }} />
                                    );
                                })}
                            </div>
                            <div className="flex justify-end mt-1.5 gap-3" style={{ justifyContent: "flex-end" }} >
                                <DatasourceAdder handleAdd={handleAdd} />
                                <DialogClose className="float-end" asChild>
                                    <Button onClick={() => { }}>
                                        <CheckIcon />
                                    </Button>
                                </DialogClose>
                            </div>
                        </div>
                    </DialogHeader>
                </DialogContent>
            </Dialog>, 0
        );

        return () => {
            removeNavbarItem("center", "datasources_combo");
        };

    }, [dataSourcesTypes, datasources]);

    // Memoize the provider chain to prevent unnecessary rerenders
    const providerChain = React.useMemo(() => {

        const getProvider = (datasource_id: string) => {
            const dataSourceType = dataSourcesTypes.get(datasource_id);
            if (!dataSourceType) {
                console.error(`Datasource ${datasource_id} not found`);
                return null;
            }
            return dataSourceType.Provider;
        };

        if (!initialized) return null;

        return Array.from(datasources.values()).reduceRight((children_stack, datasource) => {
            const Provider = getProvider(datasource.datasource_id);
            if (!Provider) {
                return children_stack;
            }
            return (
                <Provider key={datasource.datasource_id} props={datasource.settings}>
                    {children_stack}
                </Provider>
            );
        }, children);
    }, [initialized, datasources, dataSourcesTypes]);

    return (
        <GlobalDataSourcesContext.Provider value={{}}>
            {providerChain}
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
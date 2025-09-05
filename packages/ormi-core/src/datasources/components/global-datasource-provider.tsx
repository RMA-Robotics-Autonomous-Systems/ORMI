"use client"

/*
    Load all available datasources and create a provider for them

    - allow to interact with all datasources

*/

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Datasource, DatasourceDefinition, DatasourceProviderSettings } from '../datasource-interface';
import { useDashboardManager } from '../../dashboard/components/dashboard-provider';

import { PluginsHooks, PluginsManager, usePluginsManager } from '@workspace/ormi-plugins';


import { useNavbar } from "@workspace/ui/combined/navbar";

import { Button } from '@workspace/ui/components/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@workspace/ui/components/dialog';

import { WidgetDefinition } from '../../widgets/widget-interface';
import DatasourceAdder from './datasource-adder';
import DatasourceCard from './datasource-card';
import { CheckIcon, CloudCogIcon } from 'lucide-react';
import { Template, useTemplates } from '../../templates';

type GlobalDataSources = object;

const GlobalDataSourcesContext = createContext<GlobalDataSources>({});

const GlobalDataSourcesProvider = (props: { children: React.ReactNode }) => {

    const { children } = props;

    const { datasources, updateDatasource, addDatasource, removeDatasource } = useDashboardManager();

    const [dataSourcesTypes, setDataSourcesTypes] = useState<Map<string, DatasourceDefinition<DatasourceProviderSettings>>>(new Map());

    const pluginsManager = usePluginsManager() as PluginsManager;

    const [dataLoaded, setDataLoaded] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [providersReady, setProvidersReady] = useState(false);

    const { setNavbarItem, removeNavbarItem } = useNavbar();

    const { addTemplate } = useTemplates();

    useEffect(() => {
        const dataSourcesTypes_array = pluginsManager.applyFilter<DatasourceDefinition<DatasourceProviderSettings>[]>(PluginsHooks.DATASOURCES_LIST, []);
        const dataSourcesTypes_map = new Map<string, DatasourceDefinition<DatasourceProviderSettings>>();
        for (const dataSource of dataSourcesTypes_array) {
            dataSourcesTypes_map.set(dataSource.id, dataSource);
        }
        setDataSourcesTypes(dataSourcesTypes_map);
        setDataLoaded(true);

    }, []);

    useEffect(() => {
        setInitialized(dataLoaded === true);
    }, [dataLoaded]);

    // Track provider readiness - ensure all providers are mounted before mounting children
    useEffect(() => {
        if (!initialized) {
            setProvidersReady(false);
            return;
        }

        // If no datasources, children can be mounted immediately
        if (datasources.size === 0) {
            setProvidersReady(true);
            return;
        }

        // For now, set providers ready when initialized
        // In the future, this could wait for actual provider mounting signals
        setProvidersReady(true);
    }, [initialized, datasources.size]);

    useEffect(() => {

        if (!initialized) return;

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
                    <Button variant={"ghost"}
                        className={datasources.size === 0 ? "animate-pulse" : ""}
                        style={datasources.size === 0 ? {
                            animation: "pulse-bg 0.7s infinite, pulse-scale 0.7s infinite",
                            boxShadow: "0 0 0 0 hsl(var(--primary))"
                        } : {}}>
                        Datasources <CloudCogIcon />
                    </Button>
                </DialogTrigger>
                <DialogContent size='large'>
                    <DialogHeader>
                        <DialogTitle>Datasources</DialogTitle>
                        <DialogDescription>
                            Setup the different datasources used in this workspace.
                        </DialogDescription>
                        <div>
                            <div>
                                {Array.from(datasources.values()).map((datasource) => {
                                    return (
                                        <DatasourceCard addTemplate={addTemplate} onRemove={handleRemove} data={datasource.settings} key={datasource.settings.id} definition={getDatasourceDef(datasource.datasource_id)} onValidate={function (datasource_def, settings: DatasourceProviderSettings): void {
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

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_DATASOURCES, {
            id: "available_datasources",
            priority: 10,
            filter: () => {
                return Array.from(datasources.values())
            }
        });



        return () => {
            removeNavbarItem("center", "datasources_combo");
            pluginsManager.removeFilter("available_datasources");
        };

    }, [initialized, addDatasource, dataSourcesTypes, datasources, pluginsManager, removeDatasource, updateDatasource]);

    useEffect(() => {
        if (!initialized) return;

        /**
         * Filter the widgets list based on the available datasources.
         * This filter will be applied to the widgets list when the datasources are available.
         * It will return only the widgets that are compatible with the available datasources.
         * 
         * This filter is the last one to be applied.
         */
        pluginsManager.addFilter(PluginsHooks.WIDGETS_LIST, {
            id: "filter_widgets_list_based_on_datasources",
            priority: Number.MAX_SAFE_INTEGER,
            filter: (widgets: WidgetDefinition[]) => {
                const datasourceArray = pluginsManager.applyFilter<Datasource[]>(PluginsHooks.AVAILABLE_DATASOURCES, []);

                // if no datasources are available, return no widgets
                if (datasourceArray.length === 0) {
                    return [];
                }
                return pluginsManager.applyFilter<WidgetDefinition[]>(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, widgets, datasourceArray);
            }
        })

        return () => {
            pluginsManager.removeFilter("filter_widgets_list_based_on_datasources");
        }

    }, [datasources, initialized]);

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

        // Don't render anything until providers are ready
        if (!providersReady) return null;

        // If no datasources, render children directly
        if (datasources.size === 0) {
            return children;
        }

        // Build the provider chain from outside to inside
        return Array.from(datasources.values()).reduceRight((children_stack, datasource) => {
            const Provider = getProvider(datasource.datasource_id);
            if (!Provider) {
                return children_stack;
            }

            return (
                <Provider key={datasource.settings.id} props={datasource.settings}>
                    {children_stack}
                </Provider>
            );
        }, children);
    }, [providersReady, datasources, children, dataSourcesTypes]);

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
"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/*
    Load all available datasources and create a provider for them

    - allow to interact with all datasources

*/
import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePluginsManager } from '../../../../library/core/plugins/components/plugins-provider';
import { PluginsHooks } from '../../plugins/plugins-types';
import { useNavbar } from '../../../../library/components/advanced/navbar/navbar-provider';
import { Button } from '../../../../library/components/ui/button';
import { CheckIcon, CloudCogIcon } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../../../library/components/ui/dialog';
import DatasourceCard from './datasource-card';
import { useDashboardManager } from '../../../../library/core/dashboard/components/dashboard-provider';
import DatasourceAdder from './datasource-adder';
var GlobalDataSourcesContext = createContext({});
var GlobalDataSourcesProvider = function (props) {
    var children = props.children;
    var _a = useDashboardManager(), datasources = _a.datasources, updateDatasource = _a.updateDatasource, addDatasource = _a.addDatasource, removeDatasource = _a.removeDatasource;
    var _b = useState(new Map()), dataSourcesTypes = _b[0], setDataSourcesTypes = _b[1];
    var pluginsManager = usePluginsManager();
    var _c = useState(false), initialized = _c[0], setInitialized = _c[1];
    var _d = useNavbar(), setNavbarItem = _d.setNavbarItem, removeNavbarItem = _d.removeNavbarItem;
    useEffect(function () {
        var dataSourcesTypes_array = pluginsManager.applyFilter(PluginsHooks.DATASOURCES_LIST, []);
        var dataSourcesTypes_map = new Map();
        for (var _i = 0, dataSourcesTypes_array_1 = dataSourcesTypes_array; _i < dataSourcesTypes_array_1.length; _i++) {
            var dataSource = dataSourcesTypes_array_1[_i];
            dataSourcesTypes_map.set(dataSource.id, dataSource);
        }
        setDataSourcesTypes(dataSourcesTypes_map);
        setInitialized(true);
    }, []);
    useEffect(function () {
        function getDatasourceDef(datasource_id) {
            if (!dataSourcesTypes.has(datasource_id)) {
                console.error("Datasource ".concat(datasource_id, " not found"));
                throw new Error("Datasource ".concat(datasource_id, " not found"));
            }
            return dataSourcesTypes.get(datasource_id);
        }
        function handleAdd(datasource_id) {
            addDatasource(datasource_id);
        }
        function handleRemove(source_id) {
            removeDatasource(source_id);
        }
        setNavbarItem("center", "datasources_combo", _jsxs(Dialog, { children: [_jsx(DialogTrigger, { asChild: true, children: _jsxs(Button, { variant: "ghost", children: ["Datasources ", _jsx(CloudCogIcon, {})] }) }), _jsx(DialogContent, { children: _jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Datasources" }), _jsx(DialogDescription, { children: "Setup the different datasources used in this workspace." }), _jsxs("div", { children: [_jsx("div", { children: Array.from(datasources.values()).map(function (datasource) {
                                            return (_jsx(DatasourceCard, { onRemove: handleRemove, data: datasource.settings, definition: getDatasourceDef(datasource.datasource_id), onValidate: function (datasource_def, settings) {
                                                    updateDatasource(datasource.datasource_id, settings);
                                                } }, datasource.settings.id));
                                        }) }), _jsxs("div", { className: "flex justify-end mt-1.5 gap-3", style: { justifyContent: "flex-end" }, children: [_jsx(DatasourceAdder, { handleAdd: handleAdd }), _jsx(DialogClose, { className: "float-end", asChild: true, children: _jsx(Button, { onClick: function () { }, children: _jsx(CheckIcon, {}) }) })] })] })] }) })] }), 0);
        pluginsManager.addFilter(PluginsHooks.AVAILABLE_DATASOURCES, {
            id: "available_datasources",
            priority: 10,
            filter: function () {
                return Array.from(datasources.values());
            }
        });
        return function () {
            removeNavbarItem("center", "datasources_combo");
            pluginsManager.removeFilter("available_datasources");
        };
    }, [addDatasource, dataSourcesTypes, datasources, pluginsManager, removeDatasource, removeNavbarItem, setNavbarItem, updateDatasource]);
    // Memoize the provider chain to prevent unnecessary rerenders
    var providerChain = React.useMemo(function () {
        var getProvider = function (datasource_id) {
            var dataSourceType = dataSourcesTypes.get(datasource_id);
            if (!dataSourceType) {
                console.error("Datasource ".concat(datasource_id, " not found"));
                return null;
            }
            return dataSourceType.Provider;
        };
        if (!initialized)
            return null;
        return Array.from(datasources.values()).reduceRight(function (children_stack, datasource) {
            var Provider = getProvider(datasource.datasource_id);
            if (!Provider) {
                return children_stack;
            }
            return (_jsx(Provider, { props: datasource.settings, children: children_stack }, datasource.settings.id));
        }, children);
    }, [initialized, datasources, children, dataSourcesTypes]);
    return (_jsx(GlobalDataSourcesContext.Provider, { value: {}, children: providerChain }));
};
var useGlobalDataSources = function () {
    var context = useContext(GlobalDataSourcesContext);
    if (!context) {
        throw new Error('useGlobalDataSources must be used within a GlobalDataSourcesProvider');
    }
    return context;
};
export { GlobalDataSourcesProvider, useGlobalDataSources };

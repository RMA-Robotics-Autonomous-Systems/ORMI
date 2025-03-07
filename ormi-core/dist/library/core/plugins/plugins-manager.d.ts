import { PluginAction, PluginClientSide, PluginFilter } from "./plugins-types";
import { PluginsHooks } from "./plugins-types";
declare class PluginsManager {
    private plugins;
    constructor(pluginsMap: Map<string | PluginsHooks, PluginClientSide>);
    applyFilter<T>(filterName: string | PluginsHooks, ...args: any): T;
    applyFilterAsync<T>(filterName: string | PluginsHooks, ...args: any): Promise<T>;
    addFilter(filterName: string | PluginsHooks, filter: PluginFilter): void;
    removeFilter(pluginFilterId: string): void;
    doAction(actionName: string | PluginsHooks, ...args: any): void;
    WaitAndDoAction(actionName: string | PluginsHooks, timeoutSecond?: number, ...args: any): Promise<boolean>;
    addAction(actionName: string | PluginsHooks, action: PluginAction): void;
    removeAction(pluginActionId: string): void;
    WaitForActionToExist(actionName: string | PluginsHooks, timeoutSecond?: number): Promise<boolean>;
    getPlugins(): Map<string | PluginsHooks, PluginClientSide>;
}
export default PluginsManager;

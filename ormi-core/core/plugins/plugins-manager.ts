import { PluginAction, PluginClientSide, PluginFilter } from "./plugin-core";
import { PluginsHooks } from "./plugins-types";

/*

    Class used in client side to manage actions and filters of plugins

*/
class PluginsManager{

    private plugins: Map<string | PluginsHooks, PluginClientSide>;

    constructor(pluginLoader: Map<string | PluginsHooks, PluginClientSide>){
        this.plugins = pluginLoader

        // add a "basic" plugin that will be used to add new filters and actions from the client side
        this.plugins.set("basic", {
            actions: new Map(),
            filters: new Map(),
            name: "basic",
            description: "basic plugin",
            version: "1.0.0"
        });
    }

    applyFilter<T>(filterName: string | PluginsHooks, ...args: any): T{

        if(args.length < 1){
            throw new Error(`No argument given in ${filterName}`);
        }
        let result = args[0];
        const filters : PluginFilter[] = [];

        this.plugins.forEach((plugin) => {
            if (plugin.filters.has(filterName)) {
                const filter = plugin.filters.get(filterName);
                if(filter !== undefined){
                    filters.push(filter);
                }
            }
        });

        filters.sort((a, b) => a.priority - b.priority);

        filters.forEach((filter) => {
            result = filter.filter(result, args.slice(1));
        });

        return result;
    }

    addFilter(filterName: string | PluginsHooks, filter: PluginFilter): void{
        this.plugins.get("basic")?.filters.set(filterName, filter);
    }

    removeFilter(pluginFilterId: string): void{
        this.plugins.get("basic")?.filters.delete(pluginFilterId);
    }


    doAction(actionName: string | PluginsHooks, ...args: any): void{

        const actions: PluginAction[] = [];

        this.plugins.forEach((plugin) => {
            if(plugin.actions.has(actionName)){
                const action = plugin.actions.get(actionName);
                if(action !== undefined){
                    actions.push(action);
                }
            }
        });

        actions.sort((a, b) => a.priority - b.priority);

        actions.forEach((action) => {
            action.action(...args);
        });
    }

    addAction(actionName: string | PluginsHooks, action: PluginAction): void{
        this.plugins.get("basic")?.actions.set(actionName, action);
    }

    removeAction(pluginActionId: string): void{
        this.plugins.get("basic")?.actions.delete(pluginActionId);
    }
}


export default PluginsManager;
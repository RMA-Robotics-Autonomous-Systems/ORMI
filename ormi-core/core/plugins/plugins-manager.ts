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
            const filtersMap = plugin.filters.get(filterName);

            if(filtersMap !== undefined){
                filtersMap.forEach((filter) => {
                    filters.push(filter);
                });
            }

        });

        filters.sort((a, b) => a.priority - b.priority);

        filters.forEach((filter) => {
            result = filter.filter(result, args.slice(1));
        });

        return result;
    }

    addFilter(filterName: string | PluginsHooks, filter: PluginFilter): void{

        const basicPlugin = this.plugins.get("basic");

        if(basicPlugin === undefined){
            throw new Error("Basic plugin not found");
        }

        if(!basicPlugin.filters.has(filterName)){
            basicPlugin.filters.set(filterName, new Map());
        }

        basicPlugin.filters.get(filterName)?.set(filter.id, filter);
    }

    removeFilter(pluginFilterId: string): void{
        this.plugins.get("basic")?.filters.forEach((filterMap) => {
            filterMap.delete(pluginFilterId);
        });
        
    }

    doAction(actionName: string | PluginsHooks, ...args: any): void{

        const actions: PluginAction[] = [];

        this.plugins.forEach((plugin) => {
            if(plugin.actions.has(actionName)){

                const actionsMap = plugin.actions.get(actionName);

                if(actionsMap !== undefined){
                    actionsMap.forEach((action) => {
                        actions.push(action);
                    });
                }

            }
        });

        actions.sort((a, b) => a.priority - b.priority);

        actions.forEach((action) => {
            action.action(...args);
        });
    }

    addAction(actionName: string | PluginsHooks, action: PluginAction): void{

        const basicPlugin = this.plugins.get("basic");

        if(basicPlugin === undefined){
            throw new Error("Basic plugin not found");
        }

        if(!basicPlugin.actions.has(actionName)){
            basicPlugin.actions.set(actionName, new Map());
        }

        basicPlugin.actions.get(actionName)?.set(action.id, action);

    }

    removeAction(pluginActionId: string): void{
        this.plugins.get("basic")?.actions.forEach((actionMap) => {
            actionMap.delete(pluginActionId);
        });
    }
}


export default PluginsManager;
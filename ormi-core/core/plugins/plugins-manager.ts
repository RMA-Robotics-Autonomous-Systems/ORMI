import { PluginAction, PluginData, PluginFilter } from "./plugin-core";
import { PluginsHooks } from "./plugins-types";

/*

    Class used in client side to manage plugins.

*/
class PluginsManager{

    private plugins: Map<string | PluginsHooks, PluginData>;

    constructor(pluginLoader: Map<string | PluginsHooks, PluginData>){
        this.plugins = pluginLoader
    }

    applyFilter(filterName: string | PluginsHooks, ...args: any): any{

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

}


export default PluginsManager;
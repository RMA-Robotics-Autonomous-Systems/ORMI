import { PluginData } from "./plugin-core";

/*

    Class used in client side to manage plugins.

*/
class PluginsManager{

    private plugins: Map<string, PluginData>;

    constructor(pluginLoader: Map<string, PluginData>){
        this.plugins = pluginLoader
    }

    getPlugin(pluginName: string): unknown{
        // Get plugin from plugins object

        if(this.plugins.has(pluginName)){
            return this.plugins.get(pluginName);
        }

        throw new Error(`Plugin ${pluginName} not found`);
    }

    getPlugins(): Map<string,object>{
        return this.plugins;
    }

    applyFilter(filterName: string, ...args: any): any{

        if(args.length < 1){
            throw new Error(`No argument given in ${filterName}`);
        }
        let result = args[0];
        const filters = [];

        this.plugins.forEach((plugin) => {
            if (plugin.filters.has(filterName)) {
                const filter = plugin.filters.get(filterName);
                filters.push(filter);
            }
        });

        filters.sort((a, b) => a.priority - b.priority);

        filters.forEach((filter) => {
            result = filter.filter(result, args.slice(1));
        });

        return result;
    }

    doAction(actionName: string, ...args: any): void{

        const actions = [];

        this.plugins.forEach((plugin) => {
            if(plugin.actions.has(actionName)){
                const action = plugin.actions.get(actionName);
                actions.push(action);
            }
        });

        actions.sort((a, b) => a.priority - b.priority);

        actions.forEach((action) => {
            action.action(...args);
        });
    }

}


export default PluginsManager;
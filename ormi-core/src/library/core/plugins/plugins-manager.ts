import { PluginAction, PluginClientSide, PluginFilter } from "./plugins-types";
import { PluginsHooks } from "./plugins-types";

/*

    Class used in client side to manage actions and filters of plugins

*/
class PluginsManager{

    private plugins: Map<string | PluginsHooks, PluginClientSide>;

    constructor(pluginsMap: Map<string | PluginsHooks, PluginClientSide>){
        this.plugins = pluginsMap

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

        if(filters.length === 0){
            console.warn(`No filter found for ${filterName}`);
        }

        filters.sort((a, b) => a.priority - b.priority);

        filters.forEach((filter) => {
            result = filter.filter(result, ...args.slice(1));
        });

        return result;
    }

    async applyFilterAsync<T>(filterName: string | PluginsHooks, ...args: any): Promise<T>{
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

        if(filters.length === 0){
            console.warn(`No filter found for ${filterName}`);
        }

        filters.sort((a, b) => a.priority - b.priority);

        for(const filter of filters){
            result = await filter.filter(result, ...args.slice(1)) as T;
        }

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

        if(basicPlugin.filters.get(filterName)?.has(filter.id)){
            throw new Error(`Filter with id ${filter.id} already exists`);
        }

        basicPlugin.filters.get(filterName)?.set(filter.id, filter);
    }

    removeFilter(pluginFilterId: string): void{
        // search for the filter in all plugins
        // if none has the filter, throw an error, otherwise delete it
        this.plugins.forEach((plugin) => {
            plugin.filters.forEach((filterMap) => {
                if(filterMap.has(pluginFilterId)){
                    filterMap.delete(pluginFilterId);
                    return;
                }
            });
        });

        // throw new Error(`Filter with id ${pluginFilterId} not found`);
    }

    /*
        Execute all callback registered on the "actionName" hook.
        If no action found, will log a warning.
    */
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

        if(actions.length === 0){
            console.warn(`No action found for ${actionName}`);
        }
        
        actions.forEach((action) => {
            action.action(...args);
        });
    }
    
    /*
        Same as do action, but will wait for action to exist.
    */
    async WaitAndDoAction(actionName : string | PluginsHooks, timeoutSecond : number = 5, ...args: any): Promise<boolean>{
        const result = await this.WaitForActionToExist(actionName, timeoutSecond);

        if(!result){
            return false;
        }

        this.doAction(actionName, ...args);
        return true;
    }

    /*
        Add an action to the system. The action can later be called using the "actionName"
    */
    addAction(actionName: string | PluginsHooks, action: PluginAction): void{

        const basicPlugin = this.plugins.get("basic");

        if(basicPlugin === undefined){
            throw new Error("Basic plugin not found");
        }

        if(!basicPlugin.actions.has(actionName)){
            basicPlugin.actions.set(actionName, new Map());
        }

        if(basicPlugin.actions.get(actionName)?.has(action.id)){
            throw new Error(`Action with id ${action.id} already exists`);
        }

        basicPlugin.actions.get(actionName)?.set(action.id, action);

    }

    /*
        Remove an action from its id
    */
    removeAction(pluginActionId: string): void{
        // search for the action in all plugins, if none has the action, throw an error, otherwise delete it
        this.plugins.forEach((plugin) => {
            plugin.actions.forEach((actionsMap) => {
                if(actionsMap.has(pluginActionId)){
                    actionsMap.delete(pluginActionId);
                    return;
                }
            });
        });

        // throw new Error(`Action with id ${pluginActionId} not found`);
    }

    /*
        Wait for action to existe, check at a period of 100ms until found or timed out
    */
    WaitForActionToExist(actionName: string | PluginsHooks, timeoutSecond : number = 5): Promise<boolean>{
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if(this.plugins.get("basic")?.actions.has(actionName)){
                    clearInterval(interval);
                    clearTimeout(timeout);
                    resolve(true);
                }
            }, 100);

            const timeout = setTimeout(() => {
                clearInterval(interval);
                resolve(false);
            }, timeoutSecond * 1000);
        });
    }

    getPlugins(): Map<string | PluginsHooks, PluginClientSide>{
        return this.plugins;
    }
}

export default PluginsManager;
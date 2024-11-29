enum PluginsHooks {
    PLUGIN_PROVIDER_BEFORE_CHILDREN,    // filter called before rendering children of the plugin provider
    PLUGIN_PROVIDER_AFTER_CHILDREN,     // filter called after  rendering children of the plugin provider
    
    WIDGETS_LIST,   // hooks that take an array of widgets and return an array of widgets
    DATASOURCES_LIST,   // hooks that take an array of datasources definition and return an array of datasources definition
    AVAILABLE_TOPICS   // hooks that take an array of topics and return an array of topics
}

interface PluginAction{
    id : string;
    priority: number;    
    action: (...args: any) => void;
}

interface PluginFilter{
    id: string;
    priority: number;
    filter: (...args: any) => any;
}

interface PluginClientSide{
    name: string;
    description: string;
    version: string;
    actions: Map<string | PluginsHooks, PluginAction>;
    filters: Map<string | PluginsHooks, PluginFilter>;
}

export type { PluginAction, PluginFilter , PluginClientSide };
export { PluginsHooks };
enum PluginsHooks {
    PLUGIN_PROVIDER_BEFORE_CHILDREN,    // filter called before rendering children of the plugin provider
    PLUGIN_PROVIDER_AFTER_CHILDREN,     // filter called after  rendering children of the plugin provider
    
    FIELD_TYPE,
    WIDGETS_LIST,   // hooks that take an array of widgets and return an array of widgets
}

interface PluginAction{
    priority: number;    
    action: (...args: any) => void;
}

interface PluginFilter{
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
enum PluginsHooks {
    FIELD_TYPE,
    WIDGETS,
}

interface PluginAction{
    name: string;
    priority: number;    
    action: (...args: any) => void;
}

interface PluginFilter{
    name: string;
    priority: number;
    filter: (...args: any) => any;
}

interface PluginData{
    name: string;
    description: string;
    version: string;
    actions: Map<string, PluginAction>;
    filters: Map<string, PluginFilter>;
}

export type { PluginsHooks, PluginAction, PluginFilter , PluginData };
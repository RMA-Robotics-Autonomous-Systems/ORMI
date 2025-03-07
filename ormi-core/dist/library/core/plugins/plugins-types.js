var PluginsHooks;
(function (PluginsHooks) {
    PluginsHooks["PLUGIN_PROVIDER_BEFORE_CHILDREN"] = "plugins-before-children";
    PluginsHooks["PLUGIN_PROVIDER_AFTER_CHILDREN"] = "plugins-after-children";
    PluginsHooks["WIDGETS_LIST"] = "plugins-widgets-list";
    PluginsHooks["DATASOURCES_LIST"] = "plugins-datasources-list";
    /**
     *  hooks that take an array of topics and return an array of all available topics from the different plugins
     *  params: [ topics: DatasourceTopic[], filter?: DatasourceTopicFilter ]
     */
    PluginsHooks["AVAILABLE_TOPICS"] = "plugins-topics-list";
    PluginsHooks["AVAILABLE_DATASOURCES"] = "plugins-datasources-availables"; // hooks that take an array of datasources and return an array of datasources
})(PluginsHooks || (PluginsHooks = {}));
export { PluginsHooks };

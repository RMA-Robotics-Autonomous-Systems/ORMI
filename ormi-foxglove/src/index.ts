import { Plugin, PluginsHooks } from "ormi-core/plugins";
import { FoxgloveDataSourceSettings, FoxgloveSourceProvider } from "./foxglove-source";
import { DatasourceDefinition } from "ormi-core";
import { convertMessageDefinitionsToJsonSchema } from "./message-to-jsonschema";

/**
 * Foxglove WebSocket Plugin
 * 
 * This plugin provides integration with the Foxglove WebSocket protocol for connecting to 
 * ROS2 and other robotics platforms that support the Foxglove WebSocket protocol.
 */
class FoxglovePlugin extends Plugin {
    constructor() {
        super();

        this.name = "Foxglove WebSocket";
        this.description = "Provides integration with Foxglove WebSocket protocol";
        this.version = "1.0.0";
        this.author = "Florian Lebecque";
        this.email = "florian.lebecque@mil.be";

        // Register the DataSource provider
        const dataSourceFilter = {
            id: "foxglove-datasource-provider",
            priority: 10,
            filter: (datasources: any[]) => {
                // Add Foxglove WebSocket datasource provider
                datasources.push({
                    id: 'foxglove-source',
                    name: 'Foxglove WebSocket',
                    description: 'Connecting to Foxglove WebSocket servers',

                    schema: {
                        title: "Foxglove WebSocket",
                        type: 'object',
                        properties: {
                            title: { type: "string", title: "Title" },
                            enable: { type: "boolean", title: "Enable" },
                            url: {
                                type: 'string',
                                title: 'URL'
                            },
                            reconnectTimeout: {
                                type: 'number',
                                title: 'Reconnect Timeout (s)'
                            },
                            toasts: {
                                type: 'boolean',
                                title: 'Display Toasts'
                            }
                        }
                    },

                    data: {
                        id: '',
                        title: '',
                        enable: true,
                        toasts: false,
                        url: '',
                        reconnectTimeout: 2,
                    },

                    Provider: ({ children, props }) => FoxgloveSourceProvider(children, props)

                } as DatasourceDefinition<FoxgloveDataSourceSettings>);
                
                return datasources;
            }
        };

        this.addFilter(PluginsHooks.DATASOURCES_LIST, dataSourceFilter);
    }
}

export default FoxglovePlugin;
export { convertMessageDefinitionsToJsonSchema };
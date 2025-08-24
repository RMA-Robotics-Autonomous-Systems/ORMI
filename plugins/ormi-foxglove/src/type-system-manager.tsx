/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React, { ReactNode, useEffect, useState } from 'react';
import { parse } from "@foxglove/rosmsg";

import { usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';
import { UnifiedConverter } from "./unified-converter";
import { FoxgloveDataSourceSettings, DatasourceTopic } from './types';
import { useFoxgloveData } from './foxglove-data-handler';
import { interfaceList } from './interface-list';

interface TypeSystemManagerProps {
    children: ReactNode;
    settings: FoxgloveDataSourceSettings;
}

const TypeSystemManager: React.FC<TypeSystemManagerProps> = ({ children, settings }) => {
    const { client, channels, isConnected } = useFoxgloveData();
    const pluginsManager = usePluginsManager();

    // Initialization state
    const [isInitialized, setIsInitialized] = useState(false);

    const datasource_id = settings.id;
    const definition_hook = `${datasource_id}-definition`;
    const available_types = `${datasource_id}-available-types`;

    // Register type system hooks (excluding duplicates handled by FoxgloveDataHandler)
    useEffect(() => {
        if (!settings.enable || !isConnected) {
            setIsInitialized(false);
            return;
        }

        // Store filter IDs for cleanup
        const filterIds = {
            definition_hook,
            available_types
        };

        // NOTE: Available topics and connection client filters are handled by FoxgloveDataHandler
        // Only register unique type system filters here

        // Register definition filter
        pluginsManager.addFilter(definition_hook, {
            id: definition_hook,
            priority: 10,
            filter: async (definition: any, topic: DatasourceTopic): Promise<any> => {
                try {
                    // Find the channel for this topic
                    const channel = Array.from(channels.values()).find((channel) => {
                        return channel.topic === topic.topic;
                    });

                    if (!channel) {
                        throw new Error(`Channel not found for topic ${topic.topic}`);
                    }

                    const channelSchema = channel.schema;

                    if (!channelSchema) {
                        throw new Error(`Channel schema not found for topic ${topic.topic}`);
                    }

                    // Parse the schema
                    const parsedIDL = parse(channelSchema, { ros2: true });

                    // Return the original definition for now - you may want to modify this
                    return definition;

                } catch (error) {
                    console.error(`TypeSystemManager: Error in definition filter for topic ${topic.topic}:`, error);
                    return definition;
                }
            }
        });

        // Register available types filter
        pluginsManager.addFilter(available_types, {
            id: available_types,
            filter: async (types: string[]): Promise<string[]> => {
                try {
                    const channelsArray = Array.from(channels.values());
                    const schemas = channelsArray.map((channel) => {
                        return channel.schemaName;
                    });
                    let uniqueSchemas = Array.from(new Set(schemas));

                    // Add interfacesList to the uniqueSchemas
                    uniqueSchemas.push(...interfaceList);

                    // Remove duplicates
                    const uniqueSet = new Set(uniqueSchemas);
                    uniqueSchemas = Array.from(uniqueSet);

                    // Sort the schemas
                    uniqueSchemas.sort((a, b) => {
                        const aParts = a.split("/");
                        const bParts = b.split("/");
                        if (aParts[0]! < bParts[0]!) {
                            return -1;
                        } else if (aParts[0]! > bParts[0]!) {
                            return 1;
                        } else {
                            return a.localeCompare(b);
                        }
                    });

                    return uniqueSchemas;

                } catch (error) {
                    console.error(`TypeSystemManager: Error in available types filter:`, error);
                    return types;
                }
            },
            priority: 100,
        });

        // Mark as initialized after successful registration
        setIsInitialized(true);

        // Cleanup function
        return () => {
            setIsInitialized(false);

            // Remove only the filters this component registered
            try {
                pluginsManager.removeFilter(filterIds.definition_hook);
                pluginsManager.removeFilter(filterIds.available_types);
            } catch (error) {
                console.error(`TypeSystemManager: Error during cleanup for ${settings.id}:`, error);
            }
        };
    }, [settings.enable, settings.id, pluginsManager, client, channels, isConnected]);

    // Set up UnifiedConverter plugin manager
    useEffect(() => {
        UnifiedConverter.pluginManager = pluginsManager;
    }, [pluginsManager]);

    return <>{isInitialized ? children : null}</>;
};

export { TypeSystemManager };
export type { TypeSystemManagerProps };

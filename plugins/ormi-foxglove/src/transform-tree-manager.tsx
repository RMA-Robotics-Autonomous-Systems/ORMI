/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { usePluginsManager, PluginsHooks } from '@workspace/ormi-plugins';
import { TransformTree } from '@workspace/ormi-core/types';
import { FoxgloveDataSourceSettings } from './types';

interface TransformTreeManagerProps {
    children: ReactNode;
    settings: FoxgloveDataSourceSettings;
}

const TransformTreeManager: React.FC<TransformTreeManagerProps> = ({ children, settings }) => {
    const pluginsManager = usePluginsManager();

    // Initialization state
    const [isInitialized, setIsInitialized] = useState(false);

    // Transform tree state - use the old provider approach
    const transformsRef = useRef<Map<string, TransformTree>>(new Map());

    const datasource_id = settings.id;

    // Helper function to find a transform tree by ID in a Map of trees
    const getTransfromTreeFromTreeIdInMaps = (transformMap: Map<string, TransformTree>, id: string): TransformTree | null => {
        // First check if the ID is a direct key in the map
        if (transformMap.has(id)) {
            return transformMap.get(id)!;
        }

        // If not found as a direct key, search recursively in all trees
        for (const [_, tree] of transformMap) {
            const found = searchTreeRecursively(tree, id);
            if (found) {
                return found;
            }
        }

        return null;
    };

    // Helper function to search recursively in a tree
    const searchTreeRecursively = (tree: TransformTree, id: string): TransformTree | null => {
        if (tree.id === id) {
            return tree;
        }

        for (const [_, child] of tree.children) {
            const found = searchTreeRecursively(child, id);
            if (found) {
                return found;
            }
        }

        return null;
    };

    // Process incoming transform messages using the old provider logic
    const processTransformMessage = (message: any, timestamp: number, frameId: string) => {
        // Handle TF messages (tf2_msgs/TFMessage) using the old provider approach
        if (message && message.transforms && Array.isArray(message.transforms)) {
            for (const transform of message.transforms) {
                const transformTree: TransformTree = {
                    id: transform.child_frame_id,
                    parentId: transform.header.frame_id,
                    transform: {
                        position: {
                            x: transform.transform.translation.x,
                            y: transform.transform.translation.y,
                            z: transform.transform.translation.z,
                            w: 1,
                        },
                        rotation: {
                            x: transform.transform.rotation.x,
                            y: transform.transform.rotation.y,
                            z: transform.transform.rotation.z,
                            w: transform.transform.rotation.w,
                        }
                    },
                    children: new Map<string, TransformTree>(),
                };

                const parentTree = getTransfromTreeFromTreeIdInMaps(transformsRef.current, transformTree.parentId);
                const existingTree = getTransfromTreeFromTreeIdInMaps(transformsRef.current, transformTree.id);

                if (parentTree && !existingTree) {
                    parentTree.children.set(transformTree.id, transformTree);
                } else if (!existingTree) {
                    // create a parent tree
                    const newTree: TransformTree = {
                        id: transformTree.parentId,
                        parentId: "",
                        transform: {
                            position: {
                                x: 0,
                                y: 0,
                                z: 0,
                                w: 1,
                            },
                            rotation: {
                                x: 0,
                                y: 0,
                                z: 0,
                                w: 1,
                            }
                        },
                        children: new Map<string, TransformTree>(),
                    };
                    newTree.children.set(transformTree.id, transformTree);

                    transformsRef.current.set(newTree.id, newTree);
                } else {
                    // update the transform,
                    // if the transform is not the same, update it
                    existingTree.transform = transformTree.transform;

                    // if the existing tree hasn't the parent id, add it and add the 
                    // transform tree to the parent tree
                    if (existingTree.parentId === "") {
                        existingTree.parentId = transformTree.parentId;

                        const new_parentTree: TransformTree = {
                            id: transformTree.parentId,
                            parentId: "",
                            transform: {
                                position: {
                                    x: 0,
                                    y: 0,
                                    z: 0,
                                    w: 1,
                                },
                                rotation: {
                                    x: 0,
                                    y: 0,
                                    z: 0,
                                    w: 1,
                                }
                            },
                            children: new Map<string, TransformTree>(),
                        };
                        new_parentTree.children.set(existingTree.id, existingTree);
                        transformsRef.current.set(new_parentTree.id, new_parentTree);
                        transformsRef.current.delete(existingTree.id);
                    }
                }
            }
        }
    };    // Register plugin system hooks and message handlers
    useEffect(() => {
        if (!settings.enable) {
            return;
        }

        // Register transform tree filter
        const transformTreeFilterId = `${datasource_id}-transform-tree`;

        pluginsManager.addFilter(PluginsHooks.TRANSFORM_TREE, {
            id: transformTreeFilterId,
            filter: (transformTree: Map<string, TransformTree>): Map<string, TransformTree> => {
                // Add the keys of the transformsRef.current to the transformTree using old provider logic
                transformsRef.current.forEach((tree, key) => {
                    if (!transformTree.has(key)) {
                        transformTree.set(key, tree);
                    }
                });

                return transformTree;
            },
            priority: 100,
        });

        // Register message handlers for transform tree topics
        const actionIds: string[] = [];
        (settings.transformTreeTopics || []).forEach((topic) => {
            const messageHook = `${datasource_id}-${topic}-published`;
            const actionId = `${datasource_id}-transform-${topic}`;
            actionIds.push(actionId);

            pluginsManager.addAction(messageHook, {
                id: actionId,
                action: (message: any, timestamp: number, frameId: string) => {
                    processTransformMessage(message, timestamp, frameId);
                },
                priority: 100,
            });
        });

        // Subscribe to transform tree topics through the plugin system
        (settings.transformTreeTopics || []).forEach(async (topic) => {

            const datasourceTopic = {
                topic: topic,
                datasource_id: datasource_id,
                source: settings,
                type: "tf2_msgs/TFMessage", // Default type for transform topics
                rawType: "tf2_msgs/TFMessage"
            };

            try {
                // Use the plugin system to subscribe to the topic
                await pluginsManager.doAction(`${datasource_id}-subscribe`, datasourceTopic);
            } catch (error) {
                console.error(`TransformTreeManager: Failed to subscribe to transform topic ${topic}:`, error);
            }
        });

        // Mark as initialized after successful registration
        setIsInitialized(true);

        return () => {
            // Reset initialization state
            setIsInitialized(false);

            // Remove transform tree filter
            pluginsManager.removeFilter(transformTreeFilterId);

            // Remove message handlers
            actionIds.forEach(actionId => {
                pluginsManager.removeAction(actionId);
            });

            // Unsubscribe from transform tree topics
            (settings.transformTreeTopics || []).forEach(async (topic) => {

                const datasourceTopic = {
                    topic: topic,
                    datasource_id: datasource_id,
                    source: settings,
                    type: "tf2_msgs/TFMessage",
                    rawType: "tf2_msgs/TFMessage"
                };

                try {
                    // Use the plugin system to unsubscribe from the topic
                    await pluginsManager.doAction(`${datasource_id}-unsubscribe`, datasourceTopic, true); // ignoreCount = true for cleanup
                } catch (error) {
                    console.error(`TransformTreeManager: Failed to unsubscribe from transform topic ${topic}:`, error);
                }
            });

            // Clear transform tree data
            transformsRef.current.clear();
        };
    }, [settings.enable, settings.id, settings.transformTreeTopics, pluginsManager]);

    return <>{isInitialized ? children : null}</>;
};

export { TransformTreeManager };
export type { TransformTreeManagerProps };

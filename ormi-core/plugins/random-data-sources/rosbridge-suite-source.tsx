/*
    Provider that creates a datasets with random data

    data -> 
        [source] -> {
            label: 'current_time',
            data: [random data]    
        },
        [source] -> {
            label: 'current_time',
            data: [random data]    
        },
*/
"use client";

import React, { createContext, ReactNode, useEffect, useRef } from 'react';

import ROSLIB from 'roslib';

import PluginsManager from '@/core/plugins/plugins-manager';
import { usePluginsManager } from '@/core/plugins/components/plugins-provider';
import { PluginsHooks } from '@/core/plugins/plugins-types';

import { DatasourceProviderSettings, DatasourceTopic } from '@/core/datasources/datasource-interface';
import { toast } from '@/hooks/use-toast';

const RosBridgeSuiteSourceContext = createContext(null);

interface RosBridgeSuiteDataSourceSettings extends DatasourceProviderSettings {
    url: string;
}

interface ROSTopic {
    topic: string;
    type: string;
}

async function GetTopicType(ROS: ROSLIB.Ros, topic: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        ROS.getTopicType(topic, (type: string) => {
            resolve(type);
        }, (error: any) => {
            reject(error);
        });
    });
}


async function GetTopicsList(ROS: ROSLIB.Ros): Promise<ROSTopic[]> {
    return new Promise<ROSTopic[]>((resolve, reject) => {
        ROS.getTopics((results: { topics: string[], types: string[] }) => {

            const topics: ROSTopic[] = [];

            for (let i = 0; i < results.topics.length; i++) {
                topics.push({
                    topic: results.topics[i],
                    type: results.types[i]
                });
            }

            resolve(
                topics
            );

        }, (error: any) => {
            reject(error);
        });
    });
}

// Create a provider component
const RosBridgeSuiteSourceProvider: React.FC<{ children: ReactNode, props: RosBridgeSuiteDataSourceSettings }> = ({ children, props }) => {
    const pluginsManager = usePluginsManager() as PluginsManager;

    // const ROS = useRef<ROSLIB.Ros>(new ROSLIB.Ros({
    //     transportLibrary: 'websocket'
    // })).current;

    const datasource_id = props.id;
    const available_topics_handler = `${datasource_id}-available-topics`;
    const subscribe_hook = `${datasource_id}-subscribe`;
    const unsubscribe_hook = `${datasource_id}-unsubscribe`;
    const definition_hook = `${datasource_id}-definition`;

    useEffect(() => {

        const ROS = new ROSLIB.Ros({
            transportLibrary: 'websocket'
        });

        const connect = async () => {

            ROS.on("connection", () => {

                pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
                    id: available_topics_handler,
                    filter: async (topics: DatasourceTopic[]) => {

                        const rosTopics = await GetTopicsList(ROS);

                        for (const topic of rosTopics) {
                            topics.push({
                                topic: topic.topic,
                                source: props,
                                type: topic.type,
                            });
                        }


                        return topics;
                    },
                    priority: 100
                });

            });

            ROS.on("error", (error: any) => {
                console.log(ROS, error);
                toast({
                    title: "Error connecting to ROSBridge Suite",
                    description: `Could not connect to ROSBridge Suite at ${props.url}`,
                    variant: "destructive"
                });
            });

            ROS.on("close", () => {
                console.log("Disconnected from ROSBridge Suite");
                toast({
                    title: "Disconnected from ROSBridge Suite",
                    description: "Please check the URL and try again",
                    variant: "destructive"
                });
            });

            try {
                await ROS.connect(props.url);
            } catch (error) {
                console.error("Connection error:", error);
            }
        };

        connect();

        return () => {
            ROS.close();    // this function call the "close" event asynchronously

            pluginsManager.removeFilter(available_topics_handler);
        };
    }, [props.url]); // Added props.url as dependency

    return (
        <RosBridgeSuiteSourceContext.Provider value={null}>
            {children}
        </RosBridgeSuiteSourceContext.Provider>
    );
};

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };
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

// Create a provider component
const RosBridgeSuiteSourceProvider: React.FC<{ children: ReactNode, props: RosBridgeSuiteDataSourceSettings }> = ({ children, props }) => {

    const pluginsManager = usePluginsManager() as PluginsManager;

    const ROS = useRef<ROSLIB.Ros>(new ROSLIB.Ros({
        url: 'ws://localhost:9090'
    })).current;

    async function GetTopicsList() {

        if (!ROS.isConnected) {

            toast({
                title: "Error, not connected to ROSBridge Suite",
                description: "Please connect to ROSBridge Suite before trying to get topics",
                variant: "destructive"
            })

            return [];
        }

        return new Promise<string[]>((resolve, reject) => {
            ROS.getTopics((topics: any) => {
                console.log("Topics list", topics.topics);
                resolve(topics.topics);
            }, (error: any) => {
                reject(error);
            });
        });
    }

    useEffect(() => {
        const datasource_id = props.id;

        console.log("Connecting to ROSBridge Suite");

        ROS.on("connection", () => {
            console.log("Connected to ROSBridge Suite");
        });

        ROS.on("error", (error: any) => {

            console.log(ROS, error);
            toast({
                title: "Error connecting to ROSBridge Suite",
                description: "Please check the URL and try again",
                variant: "destructive"
            });

            // console.error("Error connecting to ROSBridge Suite", error);
        });

        ROS.on("close", () => {

            toast({
                title: "Disconnected from ROSBridge Suite",
                description: "Please check the URL and try again",
                variant: "destructive"
            });

        });

        if (!ROS.isConnected) {
            ROS.connect('ws://localhost:9090');
        }

        pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
            id: `${datasource_id}_available_topics`,
            priority: 10,
            filter: async (topics: DatasourceTopic[], type: string) => {

                const topicsList = await GetTopicsList();

                console.log("Topics list", topicsList);

                topicsList.forEach((topic: string) => {
                    topics.push({
                        topic: topic,
                        source: datasource_id,
                        type: 'topic'
                    });
                });

                return topics;
            }
        });

        return () => {

            // disconnect from the rosbridge server
            ROS.close();

            pluginsManager.removeFilter(`${datasource_id}_available_topics`);
        };
    }, []);

    return (
        <RosBridgeSuiteSourceContext.Provider value={null}>
            {children}
        </RosBridgeSuiteSourceContext.Provider>
    );
};

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };
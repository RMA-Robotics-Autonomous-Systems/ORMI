/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import React, { ReactNode, useEffect, useRef, useState } from 'react';

import { usePluginsManager } from '@workspace/ormi-plugins';
import { useFoxgloveData } from './foxglove-data-handler';
import { FoxgloveDataSourceSettings, DatasourceTopic } from './types';
import { PublisherService } from './publisher-service';

interface PublisherManagerProps {
    children: ReactNode;
    settings: FoxgloveDataSourceSettings;
}

const PublisherManager: React.FC<PublisherManagerProps> = ({ children, settings }) => {
    const { client, channels } = useFoxgloveData();
    const pluginsManager = usePluginsManager();

    const [isInitialized, setIsInitialized] = useState(false);
    const publisherServiceRef = useRef<PublisherService | null>(null);

    // Update channels in service when they change
    useEffect(() => {
        console.log("PublisherManager: channels updated", channels);
        console.log("PublisherManager: channels details:", Array.from(channels.entries()).map(([id, ch]) => ({
            id,
            schemaName: ch?.schemaName,
            hasSchema: !!ch?.schema,
            keys: Object.keys(ch || {})
        })));
        console.log("PublisherManager: service exists?", !!publisherServiceRef.current);

        if (publisherServiceRef.current) {
            publisherServiceRef.current.updateChannels(channels);
        } else {
            console.warn("PublisherManager: No service available to update channels");
        }
    }, [channels]);

    // Initialize service and register hooks (independent of channels)
    useEffect(() => {
        if (!settings.enable || !client) {
            setIsInitialized(false);
            return;
        }

        // Create service instance
        console.log(`PublisherManager: Creating service for datasource ${settings.id}`);
        publisherServiceRef.current = new PublisherService(pluginsManager, settings, client);

        const advertiseHook = `${settings.id}-advertise`;
        const unadvertiseHook = `${settings.id}-unadvertise`;

        // Register advertise filter
        pluginsManager.addFilter(advertiseHook, {
            id: advertiseHook,
            filter: async (topic: any): Promise<boolean> => {
                if (!publisherServiceRef.current) return false;
                return await publisherServiceRef.current.advertise(topic);
            },
            priority: 100,
        });

        // Register unadvertise action
        pluginsManager.addAction(unadvertiseHook, {
            id: unadvertiseHook,
            action: async (topic: DatasourceTopic, ignoreCount = false) => {
                if (!publisherServiceRef.current) return;
                await publisherServiceRef.current.unadvertise(topic, ignoreCount);
            },
            priority: 100,
        });

        setIsInitialized(true);

        // Debug: expose service state globally for debugging
        if (typeof window !== 'undefined') {
            (window as any).debugPublisherService = publisherServiceRef.current;
        }

        // Cleanup function
        return () => {
            console.log(`PublisherManager: Cleaning up for datasource ${settings.id}`);

            setIsInitialized(false);

            // Remove hooks
            pluginsManager.removeFilter(advertiseHook);
            pluginsManager.removeAction(unadvertiseHook);

            // Cleanup service
            if (publisherServiceRef.current) {
                publisherServiceRef.current.cleanup();
                publisherServiceRef.current = null;
            }
        };
    }, [settings.enable, settings.id, client, pluginsManager]);

    // Initialize service with existing channels after it's created
    useEffect(() => {
        if (publisherServiceRef.current && channels.size > 0) {
            console.log("PublisherManager: Initializing service with existing channels", channels);
            publisherServiceRef.current.updateChannels(channels);
        }
    }, [isInitialized]); // Only run when service is first initialized

    return <>{isInitialized ? children : null}</>;
};

export { PublisherManager };
export type { PublisherManagerProps };

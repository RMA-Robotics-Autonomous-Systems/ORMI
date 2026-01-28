/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, {
	ReactNode,
	useEffect,
	useRef,
	useState,
	useMemo,
	useCallback,
} from "react";

import { usePluginsManager } from "@workspace/ormi-plugins";
import { useFoxgloveData } from "./foxglove-data-handler";
import { FoxgloveDataSourceSettings, DatasourceTopic } from "./types";
import { PublisherService } from "./publisher-service";

interface PublisherManagerProps {
	children: ReactNode;
	settings: FoxgloveDataSourceSettings;
}

const PublisherManager: React.FC<PublisherManagerProps> = ({
	children,
	settings,
}) => {
	const { client, channels } = useFoxgloveData();
	const pluginsManager = usePluginsManager();

	const [isInitialized, setIsInitialized] = useState(false);
	const publisherServiceRef = useRef<PublisherService | null>(null);

	// Memoize channels to prevent unnecessary re-renders
	const memoizedChannels = useMemo(() => {
		// Create a stable reference for channels comparison
		return new Map(channels);
	}, [channels.size, Array.from(channels.keys()).join(",")]);

	// Stable callback for updating channels
	const updateChannels = useCallback((newChannels: Map<number, any>) => {
		if (publisherServiceRef.current) {
			publisherServiceRef.current.updateChannels(newChannels);
		}
	}, []);

	// Update channels in service when they change (now using stable references)
	useEffect(() => {
		if (publisherServiceRef.current) {
			updateChannels(memoizedChannels);
		} else {
			console.warn(
				"PublisherManager: No service available to update channels",
			);
		}
	}, [memoizedChannels, updateChannels]);

	// Initialize service and register hooks (independent of channels)
	useEffect(() => {
		// Only proceed if we need to initialize and have the required dependencies
		if (!settings.enable || !client || !pluginsManager) {
			return;
		}

		// Prevent re-initialization if already initialized with same settings
		if (publisherServiceRef.current) {
			return;
		}

		// Create service instance
		publisherServiceRef.current = new PublisherService(
			pluginsManager,
			settings,
			client,
		);

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
				await publisherServiceRef.current.unadvertise(
					topic,
					ignoreCount,
				);
			},
			priority: 100,
		});

		setIsInitialized(true);

		// Debug: expose service state globally for debugging
		if (typeof window !== "undefined") {
			(window as any).debugPublisherService = publisherServiceRef.current;
		}

		// Cleanup function
		return () => {
			setIsInitialized(false);

			// Remove hooks
			try {
				pluginsManager.removeFilter(advertiseHook);
				pluginsManager.removeAction(unadvertiseHook);
			} catch (error) {
				console.warn("Error removing hooks during cleanup:", error);
			}

			// Cleanup service
			if (publisherServiceRef.current) {
				publisherServiceRef.current.cleanup();
				publisherServiceRef.current = null;
			}
		};
	}, [settings.enable, settings.id, client, pluginsManager]);

	// Initialize service with existing channels after it's created
	useEffect(() => {
		if (
			isInitialized &&
			publisherServiceRef.current &&
			memoizedChannels.size > 0
		) {
			updateChannels(memoizedChannels);
		}
	}, [isInitialized, memoizedChannels, updateChannels]);

	return <>{isInitialized ? children : null}</>;
};

export { PublisherManager };
export type { PublisherManagerProps };

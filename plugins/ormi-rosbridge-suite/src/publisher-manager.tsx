"use client";

import React, { ReactNode, useEffect, useRef } from "react";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { useRosbridgeData } from "./rosbridge-data-handler";
import { RosbridgePublisherService } from "./publisher-service";
import type { RosBridgeSuiteDataSourceSettings } from "./types";
import type {
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";

interface PublisherManagerProps {
	children: ReactNode;
	settings: RosBridgeSuiteDataSourceSettings;
}

/**
 * PublisherManager registers the advertise/unadvertise filter and action hooks,
 * delegating all publisher lifecycle management to RosbridgePublisherService.
 */
const PublisherManager: React.FC<PublisherManagerProps> = ({
	children,
	settings,
}) => {
	const { ros } = useRosbridgeData();
	const pluginsManager = usePluginsManager();
	const serviceRef = useRef<RosbridgePublisherService | null>(null);

	const advertiseHook = `${settings.id}-advertise`;
	const unadvertiseHook = `${settings.id}-unadvertise`;

	useEffect(() => {
		if (serviceRef.current) {
			return;
		}

		serviceRef.current = new RosbridgePublisherService(
			ros,
			pluginsManager,
			settings,
		);

		pluginsManager.addFilter(advertiseHook, {
			id: advertiseHook,
			filter: async (topic: SelectedTopic): Promise<boolean> => {
				if (!serviceRef.current) return false;
				return await serviceRef.current.advertise(topic);
			},
			priority: 100,
		});

		pluginsManager.addAction(unadvertiseHook, {
			id: unadvertiseHook,
			action: async (topic: DatasourceTopic, ignoreCount = false) => {
				if (!serviceRef.current) return;
				await serviceRef.current.unadvertise(topic, ignoreCount);
			},
			priority: 100,
		});

		return () => {
			pluginsManager.removeFilter(advertiseHook);
			pluginsManager.removeAction(unadvertiseHook);
			serviceRef.current?.cleanup();
			serviceRef.current = null;
		};
	}, [ros, advertiseHook, unadvertiseHook, settings.id, pluginsManager]);

	return <>{children}</>;
};

export { PublisherManager };

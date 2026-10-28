"use client";

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

import React, { useEffect, useRef, useState } from "react";

import { RandomDataSourceSettings } from "./index";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { getDatasourceSubscriptionRegistry } from "@workspace/utils";
import { WorkerDatasourceHost } from "@workspace/ormi-core/datasources";

/**
 * Lifecycle component for random datasource.
 * Manages worker initialization and plugin hook registration.
 */
const RandomDataSourceProvider = (props: RandomDataSourceSettings) => {
	const pluginsManager = usePluginsManager();
	const hostRef =
		useRef<WorkerDatasourceHost<RandomDataSourceSettings> | null>(null);
	const [initialized, setInitialized] = useState(false);

	// Connection effect keys on settings content (id/enable/topics), not the props object.
	const propsRef = useRef(props);
	useEffect(() => {
		propsRef.current = props;
		// A rename does not restart the worker; the host lists the new title.
		hostRef.current?.updateSettings(props);
	});
	const settingsKey = JSON.stringify({
		id: props.id,
		enable: props.enable,
		topics: props.topics,
	});

	useEffect(() => {
		const settings = propsRef.current;
		// Registry-before-READY.
		getDatasourceSubscriptionRegistry(pluginsManager);
		let disposed = false;
		let host: WorkerDatasourceHost<RandomDataSourceSettings> | null = null;

		const worker = new Worker(
			new URL("./random-data-source.worker", import.meta.url),
			{
				type: "module",
				name: `datasource:${settings.id}`,
			},
		);

		host = new WorkerDatasourceHost({
			worker,
			datasourceId: settings.id,
			settings,
			pluginsManager,
		});

		hostRef.current = host;
		host.registerHooks();

		host.init()
			.then(() => {
				if (!disposed) {
					setInitialized(true);
					pluginsManager.doAction(
						PluginsHooks.DATASOURCE_READY,
						settings.id,
					);
				}
			})
			.catch((error) => {
				if (!disposed) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					console.error(
						"[Random Datasource] Failed to initialize worker:",
						errorMessage,
					);
					setInitialized(false);
				}
			});

		return () => {
			disposed = true;
			pluginsManager.doAction(
				PluginsHooks.DATASOURCE_DISPOSED,
				settings.id,
			);
			if (host) host.dispose();
			hostRef.current = null;
		};
	}, [pluginsManager, settingsKey]);

	return null;
};

export { RandomDataSourceProvider };

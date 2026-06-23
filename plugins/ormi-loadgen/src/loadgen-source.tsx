"use client";

import { useEffect, useRef, useState } from "react";

import { LoadgenSettings } from "./index";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { WorkerDatasourceHost } from "@workspace/ormi-core/datasources";

/**
 * Lifecycle component for the load generator datasource.
 * Manages worker initialization and plugin hook registration.
 */
const LoadgenSourceProvider = (props: LoadgenSettings) => {
	const pluginsManager = usePluginsManager();
	const hostRef = useRef<WorkerDatasourceHost<LoadgenSettings> | null>(null);
	const [, setInitialized] = useState(false);

	useEffect(() => {
		let disposed = false;
		let host: WorkerDatasourceHost<LoadgenSettings> | null = null;

		const worker = new Worker(
			new URL("./loadgen.worker", import.meta.url),
			{
				type: "module",
				name: `datasource:${props.id}`,
			},
		);

		host = new WorkerDatasourceHost({
			worker,
			datasourceId: props.id,
			settings: props,
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
						props.id,
					);
				}
			})
			.catch((error) => {
				if (!disposed) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					console.error(
						"[Loadgen Datasource] Failed to initialize worker:",
						errorMessage,
					);
					setInitialized(false);
				}
			});

		return () => {
			disposed = true;
			pluginsManager.doAction(PluginsHooks.DATASOURCE_DISPOSED, props.id);
			if (host) host.dispose();
			hostRef.current = null;
		};
	}, [
		pluginsManager,
		props.id,
		props.enable,
		props.title,
		props.generators,
		props.faults,
	]);

	return null;
};

export { LoadgenSourceProvider };

"use client";

import { useEffect, useRef, useState } from "react";

import { LoadgenSettings } from "./index";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { WorkerDatasourceHost } from "@workspace/ormi-core/datasources";
import { LoadgenMainThreadProvider } from "./loadgen-main-thread-source";

/**
 * Worker-transport lifecycle component for the load generator datasource.
 * Spins up the Web Worker (which produces + decodes off the main thread) and
 * registers its plugin hooks via {@link WorkerDatasourceHost}.
 */
const LoadgenWorkerProvider = (props: LoadgenSettings) => {
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
		props.preset,
		props.generators,
		props.faults,
	]);

	return null;
};

/**
 * Datasource entry point: a thin transport switch. Renders either the worker or
 * the main-thread provider based on `props.transport` (missing → `worker`). The
 * `key` forces a clean unmount/remount when the operator flips the transport, so
 * the old provider's hooks, timers, worker, and coalescer are fully torn down
 * before the new one registers — no dual registration, no leaked intervals. The
 * switch renders one component (never conditionally calls hooks), so the Rules
 * of Hooks hold.
 */
const LoadgenSourceProvider = (props: LoadgenSettings) => {
	return props.transport === "main-thread" ? (
		<LoadgenMainThreadProvider key="mt" {...props} />
	) : (
		<LoadgenWorkerProvider key="wk" {...props} />
	);
};

export { LoadgenSourceProvider };

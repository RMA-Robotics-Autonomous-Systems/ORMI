"use client";

import React, {
	useState,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react";
import * as ROSLIB from "roslib";

import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { toast } from "sonner";

import { RosbridgeConnection } from "./rosbridge-connection";
import { RosbridgeDataHandler } from "./rosbridge-data-handler";
import { SubscriptionManager } from "./subscription-manager";
import { PublisherManager } from "./publisher-manager";
import { TypeSystemManager } from "./type-system-manager";
import { TransformTreeManager } from "./transform-tree-manager";
import { RosbridgeWorkerHost } from "./rosbridge-worker-host";
import type { RosBridgeSuiteDataSourceSettings } from "./types";

// ---------------------------------------------------------------------------
// Routing helper
// ---------------------------------------------------------------------------

/**
 * Returns true if the URL targets localhost or loopback — these are exempt
 * from mixed-content blocking and can therefore run inside a Web Worker even
 * over plain ws://.
 */
const isLocalhostUrl = (url: string): boolean => {
	try {
		const { hostname } = new URL(url);
		return (
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname === "::1"
		);
	} catch {
		return false;
	}
};

/**
 * Returns true when the URL is an insecure (ws://) non-localhost address.
 * In that case a Web Worker would be blocked by mixed-content rules, so we
 * fall back to the main thread.
 */
const requiresMainThread = (url: string): boolean =>
	url.trim().toLowerCase().startsWith("ws://") && !isLocalhostUrl(url);

// ---------------------------------------------------------------------------
// Worker connection component
// ---------------------------------------------------------------------------

interface WorkerConnectionProps {
	settings: RosBridgeSuiteDataSourceSettings;
	onInitialized: (ready: boolean) => void;
	onConnectionStatus: (status: {
		connected: boolean;
		error?: string;
		reconnectAttempt?: number;
	}) => void;
}

const RosbridgeWorkerConnection: React.FC<WorkerConnectionProps> = ({
	settings,
	onInitialized,
	onConnectionStatus,
}) => {
	const pluginsManager = usePluginsManager();
	const onInitializedRef = useRef(onInitialized);
	const onConnectionStatusRef = useRef(onConnectionStatus);
	const transformTreeTopicsKey = settings.transformTreeTopics.join("\0");
	const workerSettings = useMemo(
		() => ({
			...settings,
			transformTreeTopics: [...settings.transformTreeTopics],
		}),
		[
			settings.enable,
			settings.id,
			settings.reconnectTimeout,
			settings.title,
			settings.toasts,
			settings.url,
			transformTreeTopicsKey,
		],
	);

	onInitializedRef.current = onInitialized;
	onConnectionStatusRef.current = onConnectionStatus;

	useEffect(() => {
		let disposed = false;
		let host: RosbridgeWorkerHost | null = null;
		let unsubscribe: (() => void) | null = null;

		const worker = new Worker(
			new URL("./rosbridge-source.worker.js", import.meta.url),
			{ type: "module", name: `rosbridge:${workerSettings.id}` },
		);

		host = new RosbridgeWorkerHost({
			worker,
			datasourceId: workerSettings.id,
			settings: workerSettings,
			pluginsManager,
		});

		host.registerHooks();

		unsubscribe = host.onConnectionStatus((status) => {
			if (disposed) return;
			onConnectionStatusRef.current(status);
			if (status.connected) {
				pluginsManager.doAction(
					PluginsHooks.DATASOURCE_READY,
					workerSettings.id,
				);
			}
		});

		host.init()
			.then(() => {
				if (!disposed) onInitializedRef.current(true);
			})
			.catch((error) => {
				if (!disposed) {
					onConnectionStatusRef.current({
						connected: false,
						error:
							error instanceof Error
								? error.message
								: String(error),
						reconnectAttempt: 0,
					});
				}
			});

		return () => {
			disposed = true;
			unsubscribe?.();
			host?.dispose();
			// host.dispose() already fires DATASOURCE_DISPOSED via the worker shutdown;
			// calling it here too would double-fire setDatasourceStatuses.
			onInitializedRef.current(false);
		};
	}, [workerSettings, pluginsManager]);

	return null;
};

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * RosBridgeSuiteSourceProvider orchestrates the ROSBridge Suite datasource.
 *
 * - Worker mode  (wss:// or ws://localhost): ROSLIB + conversions run in a Web
 *   Worker; the main thread stays responsive.
 * - Main-thread mode (ws:// on non-localhost): falls back to the original
 *   manager-component tree to avoid mixed-content Worker blocking.
 *
 * In both modes the TransformTreeManager subscribes to /tf and /tf_static via
 * the plugin hook system, so it keeps working without any additional wiring.
 */
const RosBridgeSuiteSourceProvider = (
	props: RosBridgeSuiteDataSourceSettings,
) => {
	const pluginsManager = usePluginsManager();
	const [initialized, setInitialized] = useState(false);
	const [ros, setRos] = useState<ROSLIB.Ros | null>(null);

	const useMainThread = requiresMainThread(props.url);

	const handleInitialized = useCallback(
		(ready: boolean) => {
			setInitialized(ready);
			if (!ready) {
				pluginsManager.doAction(
					PluginsHooks.DATASOURCE_DISPOSED,
					props.id,
				);
			}
		},
		[pluginsManager, props.id],
	);

	const handleConnectionStatus = useCallback(
		(status: {
			connected: boolean;
			error?: string;
			reconnectAttempt?: number;
		}) => {
			if (!props.toasts) return;
			if (status.connected) {
				toast.success("Connected to ROSBridge at " + props.url);
			} else if (status.error && (status.reconnectAttempt ?? 0) === 0) {
				toast.error(status.error);
			}
		},
		[props.toasts, props.url],
	);

	// Main-thread callbacks
	const handleConnected = useCallback((connectedRos: ROSLIB.Ros) => {
		setRos(connectedRos);
		setInitialized(true);
	}, []);
	const handleDisconnected = useCallback(() => {
		setRos(null);
		setInitialized(false);
	}, []);

	if (useMainThread) {
		// --- Original manager-component tree ---
		return (
			<>
				<RosbridgeConnection
					settings={props}
					onConnected={handleConnected}
					onDisconnected={handleDisconnected}
				/>
				{ros && (
					<RosbridgeDataHandler ros={ros}>
						<TypeSystemManager settings={props}>
							<SubscriptionManager settings={props}>
								<PublisherManager settings={props}>
									<TransformTreeManager settings={props} />
								</PublisherManager>
							</SubscriptionManager>
						</TypeSystemManager>
					</RosbridgeDataHandler>
				)}
			</>
		);
	}

	// --- Worker mode: hook registration is handled by RosbridgeWorkerHost ---
	return (
		<>
			<RosbridgeWorkerConnection
				settings={props}
				onInitialized={handleInitialized}
				onConnectionStatus={handleConnectionStatus}
			/>
			{initialized && <TransformTreeManager settings={props} />}
		</>
	);
};

export { RosBridgeSuiteSourceProvider };
export type { RosBridgeSuiteDataSourceSettings };

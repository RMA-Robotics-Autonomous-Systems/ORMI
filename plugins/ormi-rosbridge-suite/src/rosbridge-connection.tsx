/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import * as ROSLIB from "roslib";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { toast } from "sonner";
import type { RosBridgeSuiteDataSourceSettings } from "./types";

/** Delay before the first connection attempt, allowing the component tree to settle. */
const WAIT_FOR_CONNECTION = 500;

interface RosbridgeConnectionProps {
	settings: RosBridgeSuiteDataSourceSettings;
	/** Called with the live ROSLIB.Ros instance once the connection is established. */
	onConnected: (ros: ROSLIB.Ros) => void;
	/** Called when the connection is lost (before reconnect timer starts). */
	onDisconnected: () => void;
}

/**
 * RosbridgeConnection manages the ROSLIB.Ros WebSocket lifecycle:
 * connect → emit onConnected, close → emit onDisconnected → schedule reconnect.
 * Also registers the `${id}-ros-2-connection` filter so other code can obtain the live ROS instance.
 */
const RosbridgeConnection: React.FC<RosbridgeConnectionProps> = ({
	settings,
	onConnected,
	onDisconnected,
}) => {
	const pluginsManager = usePluginsManager();
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const rosRef = useRef<ROSLIB.Ros | null>(null);

	// Stable callback refs — updated on every render so closures inside the
	// effect always call the latest version without re-running the effect.
	const onConnectedRef = useRef(onConnected);
	const onDisconnectedRef = useRef(onDisconnected);
	useEffect(() => {
		onConnectedRef.current = onConnected;
		onDisconnectedRef.current = onDisconnected;
	});

	useEffect(() => {
		if (!settings.enable) return;

		let disposed = false;

		const clearReconnect = () => {
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current);
				reconnectTimerRef.current = null;
			}
		};

		const connect = () => {
			clearReconnect();
			if (disposed) return;

			const ros = new ROSLIB.Ros({ url: settings.url });
			rosRef.current = ros;

			// Expose the live ROS instance via the plugin filter system.
			pluginsManager.removeFilter(`${settings.id}-ros-2-connection`);
			pluginsManager.addFilter(`${settings.id}-ros-2-connection`, {
				id: `${settings.id}-ros-2-connection`,
				filter: () => rosRef.current,
				priority: 1,
			});

			ros.on("connection", () => {
				if (disposed) return;
				if (settings.toasts)
					toast("Connected to ROSBridge Suite at " + settings.url);
				pluginsManager.doAction(
					PluginsHooks.DATASOURCE_READY,
					settings.id,
				);
				onConnectedRef.current(ros);
			});

			ros.on("error", (error: any) => {
				if (disposed) return;
				if (settings.toasts)
					toast(
						"ROSBridge Suite error: " +
							(error?.message || String(error)),
					);
			});

			ros.on("close", () => {
				if (disposed) return;
				if (settings.toasts)
					toast("Disconnected from ROSBridge Suite: " + settings.url);
				pluginsManager.doAction(
					PluginsHooks.DATASOURCE_DISPOSED,
					settings.id,
				);
				onDisconnectedRef.current();

				if (settings.reconnectTimeout > 0) {
					reconnectTimerRef.current = setTimeout(() => {
						if (!disposed) connect();
					}, settings.reconnectTimeout * 1000);
				}
			});
		};

		const waitTimeout = setTimeout(connect, WAIT_FOR_CONNECTION);

		return () => {
			disposed = true;
			clearTimeout(waitTimeout);
			clearReconnect();
			pluginsManager.removeFilter(`${settings.id}-ros-2-connection`);
			if (rosRef.current) {
				try {
					rosRef.current.close();
				} catch {
					// ignore close errors during cleanup
				}
			}
			rosRef.current = null;
		};
	}, [
		settings.enable,
		settings.url,
		settings.id,
		settings.reconnectTimeout,
		settings.toasts,
		pluginsManager,
	]);

	return null;
};

export { RosbridgeConnection };
export type { RosbridgeConnectionProps };

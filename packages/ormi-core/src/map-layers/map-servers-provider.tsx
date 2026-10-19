"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createSafeContext } from "@workspace/utils";

import type { MapServerRecord } from "./model";
import {
	MAP_SERVERS_UNAVAILABLE,
	getMapServersState,
	setMapServersState,
} from "./map-servers-store";

/** Options of {@link MapServersRegistryValue.refresh}. */
export interface MapServersRefreshOptions {
	/**
	 * Drop the current list before reloading: the registry reads `waiting`
	 * until the load settles, and a failed load reads `failed`, never the
	 * previous list. For a reload whose old list must not be shown again
	 * (e.g. the signed-in user changed). Default `false`.
	 */
	discard?: boolean;
}

/** What {@link MapServersProvider} offers its descendants. */
export interface MapServersRegistryValue {
	/**
	 * Load the records again, e.g. after the settings page saved an edit.
	 * Resolves `true` when the registry settled on the new list. Without
	 * `discard`, a failed reload keeps a list that had already settled, so a
	 * transient error does not empty every map's layer list.
	 */
	refresh: (options?: MapServersRefreshOptions) => Promise<boolean>;
	/** Link to the app's map-server settings page, when the host has one. */
	settingsHref?: string;
}

const [
	RegistryContextProvider,
	useMapServersRegistry,
	useMapServersRegistryOptional,
] = createSafeContext<MapServersRegistryValue>("MapServersRegistry");

export { useMapServersRegistry, useMapServersRegistryOptional };

/** Props for {@link MapServersProvider}. */
export interface MapServersProviderProps {
	/**
	 * Load the current user's stored map servers, in registry order. Resolve
	 * `null` (or reject) when they could not be loaded.
	 */
	onLoad: () => Promise<MapServerRecord[] | null>;
	/** Link to the app's map-server settings page. */
	settingsHref?: string;
	/** Descendants. */
	children?: React.ReactNode;
}

/** A registry loader, see {@link createMapServersLoader}. */
export interface MapServersLoader {
	/**
	 * Load the records and publish them on `mapServersAtom`.
	 * @param onLoad - Loads the records; resolve `null` (or reject) on failure.
	 * @param options - See {@link MapServersRefreshOptions}.
	 * @returns `true` when the registry settled on the loaded list.
	 */
	load: (
		onLoad: () => Promise<MapServerRecord[] | null>,
		options?: MapServersRefreshOptions,
	) => Promise<boolean>;
	/** Drop every load still in flight: none of them writes the atom. */
	cancel: () => void;
}

/**
 * The provider's load logic, React-free: a later load supersedes an earlier
 * one still in flight, a `discard` load starts from `waiting` and never falls
 * back to the previous list, and a plain load keeps a settled list when it
 * fails.
 *
 * @returns The loader.
 */
export function createMapServersLoader(): MapServersLoader {
	let generation = 0;
	return {
		async load(onLoad, options) {
			const current = ++generation;
			const discard = options?.discard === true;
			if (discard) setMapServersState({ status: "waiting" });
			let servers: MapServerRecord[] | null;
			try {
				servers = await onLoad();
			} catch {
				servers = null;
			}
			if (current !== generation) return false;
			if (servers) {
				setMapServersState({
					status: "settled",
					servers: [...servers],
				});
				return true;
			}
			if (discard || getMapServersState().status !== "settled") {
				setMapServersState({ status: "failed" });
			}
			return false;
		},
		cancel() {
			generation++;
		},
	};
}

/**
 * Load the map-server registry once and publish it on `mapServersAtom`
 * (`appStore`), so every map and every config dialog under it reads the same
 * list. Mount it once, high enough to cover workspaces and plugin pages.
 *
 * On unmount the atom goes back to `unavailable`.
 *
 * @param props - Component props.
 * @returns The children, inside the registry context.
 */
export function MapServersProvider({
	onLoad,
	settingsHref,
	children,
}: MapServersProviderProps) {
	// Read through a ref so a new `onLoad` identity per parent render does not
	// reload. Synced in an effect, never during render.
	const onLoadRef = useRef(onLoad);
	useEffect(() => {
		onLoadRef.current = onLoad;
	}, [onLoad]);

	const [loader] = useState(createMapServersLoader);
	const refresh = useCallback(
		(options?: MapServersRefreshOptions) =>
			loader.load(onLoadRef.current, options),
		[loader],
	);

	useEffect(() => {
		// The first load starts from `waiting`, whatever an earlier mount left.
		void refresh({ discard: true });
		return () => {
			// Drops a load still in flight.
			loader.cancel();
			setMapServersState(MAP_SERVERS_UNAVAILABLE);
		};
	}, [loader, refresh]);

	const value = useMemo<MapServersRegistryValue>(
		() => ({ refresh, settingsHref }),
		[refresh, settingsHref],
	);

	return (
		<RegistryContextProvider value={value}>
			{children}
		</RegistryContextProvider>
	);
}

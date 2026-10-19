"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

import type { MapServerRecord } from "@workspace/ormi-core/map-layers/model";
import {
	MapServersProvider,
	useMapServersRegistry,
} from "@workspace/ormi-core/map-layers";

import { mapServerApi } from "@/lib/api/map-server-api";
import { MAP_SERVERS_SETTINGS_HREF } from "@/lib/map-servers/map-server-settings";

/**
 * Load the signed-in operator's map servers.
 *
 * @returns The records, or `null` when they could not be read.
 */
async function loadMapServers(): Promise<MapServerRecord[] | null> {
	const result = await mapServerApi.list();
	return result.ok ? result.data : null;
}

/**
 * Reloads the registry when the signed-in identity changes (sign in, sign
 * out, another account), so a map never shows the previous operator's
 * servers. The reload discards the list it had (`refresh({ discard: true })`),
 * so a failed load reads as failed rather than as the previous operator's
 * servers. The first settled identity is the one the provider's own mount
 * load already served, so it triggers nothing.
 */
function MapServersSessionSync() {
	const { data: session, status } = useSession();
	const { refresh } = useMapServersRegistry();
	const identity =
		status === "loading"
			? undefined
			: (session?.user?.email ?? session?.user?.name ?? "");
	const seenRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (identity === undefined) return;
		const previous = seenRef.current;
		seenRef.current = identity;
		if (previous === undefined || previous === identity) return;
		// Discard: the previous operator's list must not stay on screen while
		// (or if) the new one fails to load.
		void refresh({ discard: true });
	}, [identity, refresh]);

	return null;
}

/** Props for {@link MapServersHost}. */
interface MapServersHostProps {
	children: React.ReactNode;
}

/**
 * The app's one `MapServersProvider`, mounted by the `(home)` layout so every
 * workspace and every plugin page reads the same registry.
 *
 * @param props - Component props.
 * @returns The children inside the registry.
 */
export function MapServersHost({ children }: MapServersHostProps) {
	return (
		<MapServersProvider
			onLoad={loadMapServers}
			settingsHref={MAP_SERVERS_SETTINGS_HREF}
		>
			<MapServersSessionSync />
			{children}
		</MapServersProvider>
	);
}

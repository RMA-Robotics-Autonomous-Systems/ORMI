import { useEffect, useState } from "react";

import {
	RAINVIEWER_INDEX_URL,
	RainviewerFrames,
	parseWeatherMaps,
} from "./rainviewer";

/** Re-fetch cadence for the frame index — RainViewer publishes a new past
 * frame roughly every 10 minutes; this is the layer's "freshness" clock. */
const REFRESH_MS = 10 * 60_000;

/**
 * Fetch and keep-fresh the RainViewer radar frame index.
 *
 * Runs only while mounted (mount the consumer conditionally on the toggle).
 * Fetches the public, key-free index once on mount and then every
 * {@link REFRESH_MS}; failures degrade silently to the last good state (empty
 * until the first success), so the overlay just doesn't paint when offline.
 *
 * NOTE: pattern 9 (the shared `httpClient` wrapper) is an `apps/web` concern and
 * isn't importable from a plugin; a guarded `fetch` to this external host is the
 * correct call here. The host is HTTPS, consistent with the HTTPS deployment.
 *
 * @returns The latest parsed frames (`{ host: "", frames: [], pastCount: 0 }`
 *   until the first successful fetch).
 */
export function useRainviewerFrames(): RainviewerFrames {
	const [state, setState] = useState<RainviewerFrames>({
		host: "",
		frames: [],
		pastCount: 0,
	});

	useEffect(() => {
		let alive = true;
		const load = async () => {
			try {
				const res = await fetch(RAINVIEWER_INDEX_URL, {
					cache: "no-store",
				});
				if (!res.ok) return;
				const parsed = parseWeatherMaps(await res.json());
				if (alive && parsed) setState(parsed);
			} catch {
				/* degrade silently — keep last good frames */
			}
		};
		void load();
		const id = setInterval(() => void load(), REFRESH_MS);
		return () => {
			alive = false;
			clearInterval(id);
		};
	}, []);

	return state;
}

import { useEffect, useState } from "react";

/** The RMA / lab default center, `[lng, lat]`. */
const BRUSSELS: [number, number] = [4.3930369, 50.843941];

/**
 * Initial map center for the C2 map widget.
 *
 * COPIED-AND-TRIMMED from `ormi-std-widgets`
 * (`src/widgets/maps/hooks/useMapInitialization.ts`). Returns `[lng, lat]` — the
 * GeoJSON/MapLibre order used everywhere in this widget (the coordinate rule).
 *
 * ⚠ WHY THIS RETURNS `resolvedLocation` SEPARATELY — browser geolocation is
 * asynchronous, but `startingLocation` feeds MapLibre's `initialViewState`, which
 * is read **once, at map creation** and ignored forever after. The permission
 * prompt cannot possibly be answered before that, so the resolved position never
 * reached the map: every operator started at hard-coded Brussels regardless, and
 * `isLoading` described a wait whose outcome was discarded.
 *
 * `startingLocation` is therefore the synchronous seed (Brussels — the RMA / lab
 * default) and stays put. `resolvedLocation` is `null` until geolocation answers
 * and then carries the real position, for the caller to `flyTo` — an imperative
 * move being the only thing MapLibre accepts after creation. The caller decides
 * whether to use it: the C2 map skips the fly when it has already fitted the
 * selected map's bounds, which is more specific than "where the operator is".
 *
 * @returns The seed `[lng, lat]`, the resolved `[lng, lat]` (or null), and a
 *   one-shot loading flag that now genuinely describes an outcome in use.
 */
export function useMapInit(): {
	startingLocation: [number, number];
	resolvedLocation: [number, number] | null;
	isLoading: boolean;
} {
	// Brussels default, [lng, lat]. A module constant: stable identity, no ref.
	const startingLocation = BRUSSELS;
	const [resolvedLocation, setResolvedLocation] = useState<
		[number, number] | null
	>(null);
	const [settled, setSettled] = useState(false);
	// No geolocation API (SSR, or a browser without it) means there is nothing to
	// wait for — derived, so the effect never has to set state synchronously.
	const geolocationAvailable =
		typeof navigator !== "undefined" && !!navigator.geolocation;

	useEffect(() => {
		if (!geolocationAvailable) return;
		let cancelled = false;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				if (cancelled) return;
				setResolvedLocation([
					position.coords.longitude,
					position.coords.latitude,
				]);
				setSettled(true);
			},
			() => {
				if (!cancelled) setSettled(true);
			},
		);
		return () => {
			cancelled = true;
		};
	}, [geolocationAvailable]);

	return {
		startingLocation,
		resolvedLocation,
		isLoading: geolocationAvailable && !settled,
	};
}

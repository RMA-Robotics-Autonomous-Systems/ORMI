import { useEffect, useState } from "react";

/**
 * Initial map center for the C2 map widget (F6).
 *
 * COPIED-AND-TRIMMED from `ormi-std-widgets`
 * (`src/widgets/maps/hooks/useMapInitialization.ts`). Tries the browser
 * geolocation once for a sensible starting center, falling back to Brussels
 * (the RMA / lab default). Returns `[lng, lat]` — the GeoJSON/MapLibre order
 * used everywhere in this widget (the coordinate rule).
 *
 * @returns The starting `[lng, lat]` center and a one-shot loading flag.
 */
export function useMapInit(): {
	startingLocation: [number, number];
	isLoading: boolean;
} {
	// Brussels default, [lng, lat].
	const [startingLocation, setStartingLocation] = useState<[number, number]>([
		4.3930369, 50.843941,
	]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (typeof window !== "undefined" && navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				(position) => {
					setStartingLocation([
						position.coords.longitude,
						position.coords.latitude,
					]);
					setIsLoading(false);
				},
				() => setIsLoading(false),
			);
		} else {
			setIsLoading(false);
		}
	}, []);

	return { startingLocation, isLoading };
}

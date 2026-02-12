import { useState, useEffect } from "react";

/**
 * Manages map initialization with geolocation detection.
 * @returns Starting location and loading state.
 */
export function useMapInitialization() {
	const [startingLocation, setStartingLocation] = useState<[number, number]>([
		4.3930369, 50.843941,
	]); // Brussels default
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
				() => {
					// On error, use default location
					setIsLoading(false);
				},
			);
		} else {
			setIsLoading(false);
		}
	}, []);

	return { startingLocation, isLoading };
}

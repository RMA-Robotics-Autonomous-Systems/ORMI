import { useState, useEffect } from "react";

/**
 * Hook to handle map initialization
 * Manages loading state and geolocation detection
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
                }
            );
        } else {
            setIsLoading(false);
        }
    }, []);

    return { startingLocation, isLoading };
}

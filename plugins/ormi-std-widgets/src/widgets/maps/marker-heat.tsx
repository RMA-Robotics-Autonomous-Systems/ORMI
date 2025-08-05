"use client"

import { SelectedTopic, useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useEffect, useState } from "react";
import { Layer, Source, Popup, useMap } from "react-map-gl/maplibre";

export default function HeatMarker(props: { topic: SelectedTopic, name: string, scale?: number, numericalTopic?: SelectedTopic }) {
    const [locations, setLocations] = useState<Array<{ coords: [number, number], value: number }>>([]);
    const [hoveredPoint, setHoveredPoint] = useState<{ coords: [number, number], value: number } | null>(null);
    const { sources } = useLocalDataSource();
    const { current: map } = useMap();

    useEffect(() => {
        const loc_data = sources.get(props.topic.topic);
        const num_data = props.numericalTopic ? sources.get(props.numericalTopic.topic) : null;
        if (!loc_data) {
            return;
        }

        try {
            if (loc_data.data.length > 0) {
                // Process all location data and associate with numerical data
                const processedLocations: Array<{ coords: [number, number], value: number }> = [];

                for (let i = 0; i < loc_data.data.length; i++) {
                    const locationData = loc_data.data[i] as GeolocationPosition;
                    const locationTime = loc_data.times[i]; // Use time from the times array

                    // Skip if time is not available
                    if (locationTime === undefined) continue;

                    let associatedValue = 50; // Default value if no numerical data

                    // Find matching numerical data within 5% time accuracy
                    if (num_data && num_data.data.length > 0) {
                        let bestMatch = null;
                        let smallestTimeDiff = Infinity;
                        let bestMatchIndex = -1;

                        for (let j = 0; j < num_data.data.length; j++) {
                            const numTime = num_data.times[j]; // Use time from the times array

                            // Skip if time is not available
                            if (numTime === undefined) continue;

                            const timeDiff = Math.abs(locationTime - numTime);

                            // 5% accuracy: allow up to 5% of the timestamp value as difference
                            const maxAllowedDiff = locationTime * 0.05;

                            if (timeDiff <= maxAllowedDiff && timeDiff < smallestTimeDiff) {
                                smallestTimeDiff = timeDiff;
                                bestMatch = num_data.data[j];
                                bestMatchIndex = j;
                            }
                        }

                        if (bestMatch) {
                            // Extract numerical value (assuming it's either a direct number or has a value property)
                            associatedValue = typeof bestMatch === 'number' ? bestMatch :
                                (bestMatch?.value || bestMatch?.data || 1);
                        }
                    }

                    // Handle different coordinate formats
                    let latitude: number, longitude: number;

                    if (Array.isArray(locationData.coords)) {
                        // If coords is already an array [lat, lon]
                        latitude = locationData.coords[0];
                        longitude = locationData.coords[1];
                    } else if (locationData.coords.latitude !== undefined && locationData.coords.longitude !== undefined) {
                        // If coords is an object with latitude/longitude properties
                        latitude = locationData.coords.latitude;
                        longitude = locationData.coords.longitude;
                    } else {
                        console.warn("Unknown coordinate format:", locationData.coords);
                        continue;
                    }

                    const newLocation = {
                        coords: [latitude, longitude] as [number, number],
                        value: associatedValue
                    };


                    // Check if we should add this location (distance threshold)
                    if (processedLocations.length > 0) {
                        const lastLocation = processedLocations[processedLocations.length - 1];
                        if (lastLocation) {
                            const dist = distance(
                                latitude,
                                longitude,
                                lastLocation.coords[0],
                                lastLocation.coords[1]
                            );
                            if (dist > 1) { // 1 meter threshold
                                processedLocations.push(newLocation);
                            }
                        }
                    } else {
                        processedLocations.push(newLocation);
                    }
                }

                // Append new locations to existing ones instead of replacing
                setLocations(prevLocations => [...prevLocations, ...processedLocations]);
            }
        } catch (error) {
            console.error("Error parsing data", error, loc_data);
        }
    }, [sources]);

    // Set up hover events for the map
    useEffect(() => {
        if (!map) return;

        const handleMouseMove = (e: any) => {
            const features = map.queryRenderedFeatures(e.point, {
                layers: ['value-points-layer']
            });

            if (features.length > 0) {
                const feature = features[0];
                if (feature && feature.geometry.type === 'Point') {
                    const coords = feature.geometry.coordinates;
                    const value = feature.properties?.value;
                    if (coords && coords.length >= 2 && value !== undefined) {
                        setHoveredPoint({
                            coords: [coords[1] as number, coords[0] as number], // Convert back to [lat, lng]
                            value: value
                        });
                        map.getCanvas().style.cursor = 'pointer';
                    }
                }
            } else {
                setHoveredPoint(null);
                map.getCanvas().style.cursor = '';
            }
        };

        const handleMouseLeave = () => {
            setHoveredPoint(null);
            map.getCanvas().style.cursor = '';
        };

        map.on('mousemove', handleMouseMove);
        map.on('mouseleave', 'value-points-layer', handleMouseLeave);

        return () => {
            map.off('mousemove', handleMouseMove);
            map.off('mouseleave', 'value-points-layer', handleMouseLeave);
        };
    }, [map]);

    const distance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371e3; // Earth's radius in meters

        function radians(degrees: number) {
            return degrees * Math.PI / 180;
        }

        const lat1Rad = radians(lat1);
        const lon1Rad = radians(lon1);
        const lat2Rad = radians(lat2);
        const lon2Rad = radians(lon2);

        const dLat = lat2Rad - lat1Rad;
        const dLon = lon2Rad - lon1Rad;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.asin(Math.sqrt(a));

        return R * c;
    }

    // Calculate min and max values from the data
    const values = locations.map((loc: { coords: [number, number], value: number }) => loc.value);
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const maxValue = values.length > 0 ? Math.max(...values) : 100;

    // Ensure min and max are different for proper interpolation
    const adjustedMinValue = minValue;
    const adjustedMaxValue = maxValue === minValue ? minValue + 1 : maxValue;

    // Helper function to get color based on value with smooth HSL gradient
    const getColorForValue = (value: number): string => {
        const normalizedValue = Math.max(0, Math.min(1, (value - adjustedMinValue) / (adjustedMaxValue - adjustedMinValue)));

        // HSL gradient from blue (240°) to red (0°) through the spectrum
        // Blue (low) -> Cyan -> Green -> Yellow -> Orange -> Red (high)
        const hue = (1 - normalizedValue) * 240; // 240° (blue) to 0° (red)
        const saturation = 70 + (normalizedValue * 30); // 70% to 100% saturation
        const lightness = 30 + (normalizedValue * 40); // 30% to 70% lightness

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };

    // Create line segments between consecutive points with gradient colors
    const lineSegments: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection' as const,
        features: []
    };

    // Create individual point features for circle visualization, sorted by value (lowest first so highest render on top)
    const sortedLocations = [...locations].sort((a, b) => a.value - b.value);
    const pointFeatures: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection' as const,
        features: sortedLocations.map((loc: { coords: [number, number], value: number }) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [loc.coords[1], loc.coords[0]] // [longitude, latitude]
            },
            properties: {
                value: loc.value,
                color: getColorForValue(loc.value)
            }
        }))
    };

    // Create line segments between consecutive points
    for (let i = 0; i < locations.length - 1; i++) {
        const currentPoint = locations[i];
        const nextPoint = locations[i + 1];

        if (currentPoint && nextPoint) {
            const avgValue = (currentPoint.value + nextPoint.value) / 2;

            lineSegments.features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [currentPoint.coords[1], currentPoint.coords[0]], // [longitude, latitude]
                        [nextPoint.coords[1], nextPoint.coords[0]]
                    ]
                },
                properties: {
                    value: avgValue,
                    color: getColorForValue(avgValue)
                }
            });
        }
    }

    return (
        <>
            <Source id="value-points" type="geojson" data={pointFeatures}>
                <Layer
                    id="value-points-layer"
                    type="circle"
                    paint={{
                        'circle-color': ['get', 'color'],
                        'circle-radius': 8,
                        'circle-opacity': 0.5,
                        'circle-blur': 0.5,
                        'circle-stroke-width': 0,
                        'circle-stroke-color': '#ffffff'
                    }}
                />
            </Source>

            {/* Popup for displaying hovered value */}
            {hoveredPoint && (
                <Popup
                    longitude={hoveredPoint.coords[1]}
                    latitude={hoveredPoint.coords[0]}
                    closeButton={false}
                    closeOnClick={false}
                    anchor="bottom"
                    offset={[0, -10]}
                >
                    <div style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        color: 'white',
                        borderRadius: '4px'
                    }}>
                        Value: {hoveredPoint.value.toFixed(2)}
                    </div>
                </Popup>
            )}
        </>
    );
}
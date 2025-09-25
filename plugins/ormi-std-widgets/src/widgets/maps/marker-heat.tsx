"use client"

import { SelectedTopic, useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { EyeClosedIcon, EyeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Layer, Source, Popup, useMap } from "react-map-gl/maplibre";

export default function HeatMarker(props: { topic: SelectedTopic, name: string, scale?: number, numericalTopic?: SelectedTopic }) {
    const [locations, setLocations] = useState<Array<{ coords: [number, number], value: number }>>([]);
    const [hoveredPoint, setHoveredPoint] = useState<{ coords: [number, number], value: number } | null>(null);
    const { sources, getSource, getSourceId } = useLocalDataSource();
    const { current: map } = useMap();

    // Create unique IDs for this heat marker instance using source ID
    const uniqueTopicId = getSourceId(props.topic);
    const sourceId = `value-points-${uniqueTopicId}`;
    const layerId = `value-points-layer-${uniqueTopicId}`;

    const { setButtonItem, removeButtonItem } = useButtonHolder();
    const [show, setShow] = useState(true);

    useEffect(() => {
        const loc_data = getSource(props.topic);
        const num_data = props.numericalTopic ? getSource(props.numericalTopic) : null;
        if (!loc_data) {
            return;
        }

        if (loc_data.data.length > 0) {
            // Process the single location data point and associate with numerical data
            const locationData = loc_data.data[0] as GeolocationPosition;
            const locationTime = loc_data.times[0]; // Use time from the times array

            // Skip if time is not available
            if (locationTime === undefined) return;

            let associatedValue = 50; // Default value if no numerical data

            // Find matching numerical data within 5% time accuracy
            if (num_data && num_data.data.length > 0) {
                let bestMatch = null;
                let smallestTimeDiff = Infinity;

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
                    }
                }

                if (bestMatch) {
                    // Extract numerical value (assuming it's either a direct number or has a value property)
                    associatedValue = typeof bestMatch === 'number' ? bestMatch :
                        (bestMatch?.value || bestMatch?.data || 1);
                }
            }

            let latitude: number, longitude: number;
            latitude = locationData.coords.latitude;
            longitude = locationData.coords.longitude;

            const newLocation = {
                coords: [latitude, longitude] as [number, number],
                value: associatedValue
            };

            // Hybrid approach: value-based filtering with different zones
            if (locations.length > 0) {
                const lastLocation = locations[locations.length - 1];
                if (lastLocation) {
                    const dist = distance(
                        latitude,
                        longitude,
                        lastLocation.coords[0],
                        lastLocation.coords[1]
                    );

                    // Calculate current data range for value zones
                    const currentValues = locations.map(loc => loc.value);
                    const currentMin = Math.min(...currentValues);
                    const currentMax = Math.max(...currentValues);
                    const valueRange = currentMax - currentMin;

                    // Define value zones based on current data
                    const criticalThreshold = currentMax - (valueRange * 0.1); // Top 10%
                    const importantThreshold = currentMax - (valueRange * 0.3); // Top 30%

                    // Determine zone and corresponding distance threshold
                    let distanceThreshold: number;
                    let shouldAdd = false;

                    if (associatedValue >= criticalThreshold) {
                        // Critical zone: Always add, regardless of distance
                        shouldAdd = true;
                        distanceThreshold = 0;
                    } else if (associatedValue >= importantThreshold) {
                        // Important zone: Reduced distance threshold
                        distanceThreshold = 0.1; // 0.1 meter threshold
                        shouldAdd = dist > distanceThreshold;
                    } else {
                        // Normal zone: Standard distance threshold
                        distanceThreshold = 0.25; // 0.25 meter threshold
                        shouldAdd = dist > distanceThreshold;
                    }

                    if (shouldAdd) {
                        setLocations(prevLocations => [...prevLocations, newLocation]);
                    }
                }
            } else {
                setLocations(prevLocations => [...prevLocations, newLocation]);
            }
        }


        setButtonItem(getSourceId(props.topic),
            <Button variant={"ghost"} onClick={() => {
                setShow(!show);
            }}>
                {show ? <EyeIcon className="h-4 w-4" /> : <EyeClosedIcon className="h-4 w-4" />}
            </Button>,
            1
        );

        return () => {
            removeButtonItem(getSourceId(props.topic));
        }

    }, [sources]);

    // Set up hover events for the map
    useEffect(() => {
        if (!map) return;

        const handleMouseMove = (e: any) => {
            // Only query features if the layer is currently shown
            if (!show) {
                setHoveredPoint(null);
                map.getCanvas().style.cursor = '';
                return;
            }

            const features = map.queryRenderedFeatures(e.point, {
                layers: [layerId]
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
        map.on('mouseleave', layerId, handleMouseLeave);

        return () => {
            map.off('mousemove', handleMouseMove);
            map.off('mouseleave', layerId, handleMouseLeave);
        };
    }, [map, layerId]);
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

    if (!show) {
        return null;
    }

    return (
        <>
            <Source id={sourceId} type="geojson" data={pointFeatures}>
                <Layer
                    id={layerId}
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
                    <div className="rounded-lg shadow-md p-3 bg-white text-gray-800">
                        <h3 className="font-semibold text-sm mb-1">Data Point</h3>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-medium">Value:</span>
                            <span className="text-xs">{hoveredPoint.value.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-medium">Latitude:</span>
                            <span className="text-xs">{hoveredPoint.coords[0].toFixed(6)}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-medium">Longitude:</span>
                            <span className="text-xs">{hoveredPoint.coords[1].toFixed(6)}</span>
                        </div>
                    </div>
                </Popup>
            )}
        </>
    );
}
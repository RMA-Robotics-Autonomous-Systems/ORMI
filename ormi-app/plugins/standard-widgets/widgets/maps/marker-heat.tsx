"use client"

import { useEffect, useState } from "react";
import { SelectedTopic } from "ormi-core/datasources";
import { useLocalDataSource } from "ormi-core/datasources";
import { Layer, Source } from "react-map-gl/maplibre";

export default function HeatMarker(props: { topic: SelectedTopic, name: string, scale?: number }) {
    const [locations, setLocations] = useState<any>([]);
    const { sources } = useLocalDataSource();

    useEffect(() => {
        const data = sources.get(props.topic.topic);
        if (!data) {
            return;
        }

        try {
            if (data.data.length > 0) {
                const lastData = data.data[data.data.length - 1] as GeolocationPosition;

                if (locations.length > 0) {
                    const lastLocation = locations[locations.length - 1];
                    const dist = distance(lastData.coords.latitude, lastData.coords.longitude, lastLocation[0], lastLocation[1]);
                    if (dist > 1) {
                        setLocations([...locations, [lastData.coords.latitude, lastData.coords.longitude]]);
                    }
                } else {
                    setLocations([[lastData.coords.latitude, lastData.coords.longitude]]);
                }
            }
        } catch (error) {
            console.error("Error parsing data", error, data);
        }
    }, [sources]);

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

    const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection' as const,
        features: locations.map((loc: [number, number]) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [loc[1], loc[0]]
            }
        }))
    };

    return (
        <Source id="heatmap" type="geojson" data={geojson}>
            <Layer
                id="heatmap-layer"
                type="heatmap"
                paint={{
                    'heatmap-radius': 10,
                    'heatmap-opacity': 0.8,
                    'heatmap-weight': 1,
                    'heatmap-intensity': 1,
                    'heatmap-color': [
                        'interpolate',
                        ['linear'],
                        ['heatmap-density'],
                        0, 'rgba(33,102,172,0)',
                        0.2, 'rgb(103,169,207)',
                        0.4, 'rgb(209,229,240)',
                        0.6, 'rgb(253,219,199)',
                        0.8, 'rgb(239,138,98)',
                        1, 'rgb(178,24,43)'
                    ]
                }}
            />
        </Source>
    );
}
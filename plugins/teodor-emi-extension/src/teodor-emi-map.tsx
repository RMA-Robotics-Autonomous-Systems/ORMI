"use client"

import { SelectedTopic, useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { EyeClosedIcon, EyeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Layer, Source, Popup, useMap } from "react-map-gl/maplibre";

interface EmiSensor {
    id: number;
    gnss: {
        header: {
            stamp: {
                sec: number;
                nanosec: number;
            };
            frame_id: string;
        };
        status: {
            status: number;
            service: number;
        };
        latitude: number;
        longitude: number;
        altitude: number;
        position_covariance: Record<string, number>;
        position_covariance_type: number;
    };
    alert: boolean;
    raw1: number;
    raw2: number;
}

interface EmiMessage {
    header: {
        stamp: {
            sec: number;
            nanosec: number;
        };
        frame_id: string;
    };
    atr_threshold: number;
    emi_array: EmiSensor[];
}

interface EmiData {
    data: EmiMessage[];
    times: number[];
    referenceFrameId: string;
}

export default function TeodorEmiMap(props: {
    topic: SelectedTopic,
    name: string,
    scale?: number,
    useRaw2?: boolean // Option to use raw2 instead of raw1
}) {
    const [locations, setLocations] = useState<Array<{
        coords: [number, number],
        value: number,
        sensorId: number,
        alert: boolean,
        timestamp: number
    }>>([]);
    const [hoveredPoint, setHoveredPoint] = useState<{
        coords: [number, number],
        value: number,
        sensorId: number,
        alert: boolean
    } | null>(null);
    const { getSource } = useLocalDataSource();
    const { current: map } = useMap();

    // Create unique IDs for this EMI map instance
    const sourceId = `emi-sensors-${props.name}`;
    const layerId = `emi-sensors-layer-${props.name}`;

    const { setButtonItem, removeButtonItem } = useButtonHolder();
    const [show, setShow] = useState(true);

    useEffect(() => {
        const emi_data = getSource(props.topic);
        if (!emi_data) {
            return;
        }

        if (emi_data.data.length > 0) {
            // Process the EMI data
            const emiMessage = emi_data.data[0] as EmiMessage;
            const messageTime = emi_data.times[0];

            if (emiMessage && emiMessage.emi_array && messageTime !== undefined) {
                const newPoints = emiMessage.emi_array.map((sensor: EmiSensor) => ({
                    coords: [sensor.gnss.latitude, sensor.gnss.longitude] as [number, number],
                    value: props.useRaw2 ? sensor.raw2 : sensor.raw1,
                    sensorId: sensor.id,
                    alert: sensor.alert,
                    timestamp: messageTime
                }));

                setLocations(prevLocations => {
                    const updatedLocations = [...prevLocations];

                    // Add new points for each sensor, with distance-based filtering per sensor
                    newPoints.forEach(newPoint => {
                        // Find the last point for this specific sensor
                        const sensorHistory = updatedLocations.filter(loc => loc.sensorId === newPoint.sensorId);

                        if (sensorHistory.length > 0) {
                            const lastPoint = sensorHistory[sensorHistory.length - 1];
                            if (lastPoint) {
                                const dist = distance(
                                    newPoint.coords[0],
                                    newPoint.coords[1],
                                    lastPoint.coords[0],
                                    lastPoint.coords[1]
                                );

                                // Only add if the sensor has moved more than 0.1 meters or if it's an alert
                                if (dist > 0.1 || newPoint.alert !== lastPoint.alert) {
                                    updatedLocations.push(newPoint);
                                }
                            }
                        } else {
                            // First point for this sensor
                            updatedLocations.push(newPoint);
                        }
                    });

                    return updatedLocations;
                });
            }
        }

        setButtonItem(props.topic.topic,
            <div className="flex gap-1">
                <Button variant={"ghost"} onClick={() => {
                    setShow(!show);
                }}>
                    {show ? <EyeIcon className="h-4 w-4" /> : <EyeClosedIcon className="h-4 w-4" />}
                </Button>
                <Button variant={"ghost"} onClick={() => {
                    setLocations([]);
                }} title="Clear history">
                    Clear
                </Button>
            </div>,
            1
        );

        return () => {
            removeButtonItem(props.topic.topic);
        }

    }, [getSource, props.topic, props.useRaw2]);

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
                    const sensorId = feature.properties?.sensorId;
                    const alert = feature.properties?.alert;
                    if (coords && coords.length >= 2 && value !== undefined) {
                        setHoveredPoint({
                            coords: [coords[1] as number, coords[0] as number], // Convert back to [lat, lng]
                            value: value,
                            sensorId: sensorId,
                            alert: alert
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
    }, [map, layerId, show]);

    // Distance calculation function
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
    const values = locations.map((loc) => loc.value);
    const minValue = values.length > 0 ? Math.min(...values) : 0;
    const maxValue = values.length > 0 ? Math.max(...values) : 100;

    // Ensure min and max are different for proper interpolation
    const adjustedMinValue = minValue;
    const adjustedMaxValue = maxValue === minValue ? minValue + 1 : maxValue;

    // Helper function to get color based on value with smooth HSL gradient
    const getColorForValue = (value: number, alert: boolean): string => {
        // If alert is true, return red color
        if (alert) {
            return '#ff0000';
        }

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
        features: sortedLocations.map((loc) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [loc.coords[1], loc.coords[0]] // [longitude, latitude]
            },
            properties: {
                value: loc.value,
                sensorId: loc.sensorId,
                alert: loc.alert,
                color: getColorForValue(loc.value, loc.alert)
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
                        'circle-radius': ['case', ['get', 'alert'], 8, 4], // Larger radius for alerts
                        'circle-opacity': 0.7,
                        'circle-blur': 0.5,
                    }}
                />
            </Source>

            {/* Popup for displaying hovered sensor info */}
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
                        <h3 className="font-semibold text-sm mb-1">EMI Sensor {hoveredPoint.sensorId}</h3>
                        {hoveredPoint.alert && (
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="text-xs font-bold text-red-600">⚠️ ALERT</span>
                            </div>
                        )}
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-medium">{props.useRaw2 ? 'Raw2' : 'Raw1'}:</span>
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



/*

    MSG format:

    [
  {
    "data": [
      {
        "header": {
          "stamp": {
            "sec": 1755008070,
            "nanosec": 250031561
          },
          "frame_id": "emi_gnss_frame"
        },
        "atr_threshold": 600,
        "emi_array": [
          {
            "id": 1,
            "gnss": {
              "header": {
                "stamp": {
                  "sec": 1755008070,
                  "nanosec": 250031561
                },
                "frame_id": "coil1_link"
              },
              "status": {
                "status": 0,
                "service": 0
              },
              "latitude": 50.84397945708999,
              "longitude": 4.392218458071148,
              "altitude": 115.108,
              "position_covariance": {
                "0": 1.311025,
                "1": 0,
                "2": 0,
                "3": 0,
                "4": 1.311025,
                "5": 0,
                "6": 0,
                "7": 0,
                "8": 1.9544040000000005
              },
              "position_covariance_type": 2
            },
            "alert": false,
            "raw1": -4,
            "raw2": 8
          },
          {
            "id": 2,
            "gnss": {
              "header": {
                "stamp": {
                  "sec": 1755008070,
                  "nanosec": 250031561
                },
                "frame_id": "coil2_link"
              },
              "status": {
                "status": 0,
                "service": 0
              },
              "latitude": 50.843975875016035,
              "longitude": 4.3922180093742185,
              "altitude": 115.108,
              "position_covariance": {
                "0": 1.311025,
                "1": 0,
                "2": 0,
                "3": 0,
                "4": 1.311025,
                "5": 0,
                "6": 0,
                "7": 0,
                "8": 1.9544040000000005
              },
              "position_covariance_type": 2
            },
            "alert": false,
            "raw1": 16,
            "raw2": -20
          },
          {
            "id": 3,
            "gnss": {
              "header": {
                "stamp": {
                  "sec": 1755008070,
                  "nanosec": 250031561
                },
                "frame_id": "coil3_link"
              },
              "status": {
                "status": 0,
                "service": 0
              },
              "latitude": 50.84397229294207,
              "longitude": 4.392217560677289,
              "altitude": 115.108,
              "position_covariance": {
                "0": 1.311025,
                "1": 0,
                "2": 0,
                "3": 0,
                "4": 1.311025,
                "5": 0,
                "6": 0,
                "7": 0,
                "8": 1.9544040000000005
              },
              "position_covariance_type": 2
            },
            "alert": false,
            "raw1": -124,
            "raw2": -102
          },
          {
            "id": 4,
            "gnss": {
              "header": {
                "stamp": {
                  "sec": 1755008070,
                  "nanosec": 250031561
                },
                "frame_id": "coil4_link"
              },
              "status": {
                "status": 0,
                "service": 0
              },
              "latitude": 50.84397380065641,
              "longitude": 4.3922234579419,
              "altitude": 115.108,
              "position_covariance": {
                "0": 1.311025,
                "1": 0,
                "2": 0,
                "3": 0,
                "4": 1.311025,
                "5": 0,
                "6": 0,
                "7": 0,
                "8": 1.9544040000000005
              },
              "position_covariance_type": 2
            },
            "alert": false,
            "raw1": -22,
            "raw2": -8
          },
          {
            "id": 5,
            "gnss": {
              "header": {
                "stamp": {
                  "sec": 1755008070,
                  "nanosec": 250031561
                },
                "frame_id": "coil5_link"
              },
              "status": {
                "status": 0,
                "service": 0
              },
              "latitude": 50.84397738273037,
              "longitude": 4.3922239066388284,
              "altitude": 115.108,
              "position_covariance": {
                "0": 1.311025,
                "1": 0,
                "2": 0,
                "3": 0,
                "4": 1.311025,
                "5": 0,
                "6": 0,
                "7": 0,
                "8": 1.9544040000000005
              },
              "position_covariance_type": 2
            },
            "alert": false,
            "raw1": -76,
            "raw2": -7
          }
        ]
      }
    ],
    "times": [
      1755087754366
    ],
    "referenceFrameId": "emi_gnss_frame"
  }
]

*/
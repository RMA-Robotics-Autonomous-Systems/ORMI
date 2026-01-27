"use client";

import React, { useEffect, useRef } from "react";
import { MapRef } from "react-map-gl/maplibre";

interface MapsGridProps {
  mapRef: React.RefObject<MapRef | null>;
  showGrid: boolean;
  onGridUpdate?: (gridSizeMeters: number) => void;
}

export default function MapsGrid({
  mapRef,
  showGrid,
  onGridUpdate,
}: MapsGridProps) {
  // Function to convert meters to degrees (approximate)
  const metersToDegreesLat = (meters: number) => {
    return meters / 111320; // 1 degree latitude ≈ 111,320 meters
  };

  const metersToDegreesLng = (meters: number, latitude: number) => {
    return meters / (111320 * Math.cos((latitude * Math.PI) / 180)); // longitude varies with latitude
  };

  // Function to create grid lines with metric spacing
  const createGridLines = (
    bounds: [number, number, number, number],
    gridSizeMeters: number = 1,
  ) => {
    const [minLng, minLat, maxLng, maxLat] = bounds;
    const features = [];

    // Use center latitude for longitude conversion
    const centerLat = (minLat + maxLat) / 2;

    // Convert grid size from meters to degrees
    const gridSizeLat = metersToDegreesLat(gridSizeMeters);
    const gridSizeLng = metersToDegreesLng(gridSizeMeters, centerLat);

    // Create vertical lines (longitude)
    const startLng = Math.floor(minLng / gridSizeLng) * gridSizeLng;
    const endLng = Math.ceil(maxLng / gridSizeLng) * gridSizeLng;
    for (let lng = startLng; lng <= endLng; lng += gridSizeLng) {
      features.push({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [lng, minLat],
            [lng, maxLat],
          ],
        },
        properties: { gridSize: gridSizeMeters },
      });
    }

    // Create horizontal lines (latitude)
    const startLat = Math.floor(minLat / gridSizeLat) * gridSizeLat;
    const endLat = Math.ceil(maxLat / gridSizeLat) * gridSizeLat;
    for (let lat = startLat; lat <= endLat; lat += gridSizeLat) {
      features.push({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [minLng, lat],
            [maxLng, lat],
          ],
        },
        properties: { gridSize: gridSizeMeters },
      });
    }

    return {
      type: "FeatureCollection" as const,
      features,
    };
  };

  // Function to update grid based on current viewport
  const updateGridForViewport = () => {
    if (!mapRef.current || !showGrid) return;

    const map = mapRef.current.getMap();
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Determine grid size in meters based on zoom level
    // Higher zoom = more detail = smaller grid
    let gridSizeMeters = 1000; // Default 1km

    if (zoom >= 20)
      gridSizeMeters = 1; // 1m
    else if (zoom >= 18)
      gridSizeMeters = 10; // 10m
    else if (zoom >= 16)
      gridSizeMeters = 100; // 100m
    else if (zoom >= 14)
      gridSizeMeters = 1000; // 1km
    else if (zoom >= 12)
      gridSizeMeters = 10000; // 10km
    else gridSizeMeters = 100000; // 100km

    const gridData = createGridLines(
      [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ],
      gridSizeMeters,
    );

    const gridSource = map.getSource("grid") as any;
    if (gridSource) {
      gridSource.setData(gridData);
    }

    // Notify parent component of grid size change
    if (onGridUpdate) {
      onGridUpdate(gridSizeMeters);
    }
  };

  // Effect to update grid when showGrid changes
  useEffect(() => {
    if (mapRef.current) {
      const map = mapRef.current.getMap();
      if (map.getSource("grid")) {
        map.setPaintProperty("grid-layer", "line-opacity", showGrid ? 0.5 : 0);
      }
    }
  }, [showGrid, mapRef]);

  // Expose the update function through a custom hook or context if needed
  const gridController = {
    updateGridForViewport,
    createGridLines,
    getInitialGridData: () => createGridLines([-180, -85, 180, 85], 1000),
    getGridSource: () => ({
      type: "geojson" as const,
      data: createGridLines([-180, -85, 180, 85], 1000),
    }),
    getGridLayer: () => ({
      id: "grid-layer",
      type: "line" as const,
      source: "grid",
      layout: {
        "line-join": "round" as const,
        "line-cap": "round" as const,
      },
      paint: {
        "line-color": "#888888",
        "line-width": 1,
        "line-opacity": showGrid ? 0.5 : 0,
      },
    }),
  };

  // This component doesn't render anything, it's just for logic
  return null;
}

// Hook to use grid functionality
export const useMapGrid = (
  mapRef: React.RefObject<MapRef | null>,
  showGrid: boolean,
) => {
  const updateGridForViewport = React.useCallback(() => {
    if (!mapRef.current || !showGrid) return;

    const map = mapRef.current.getMap();
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    const gridSizeMeters = GridUtils.getGridSizeForZoom(zoom);

    const gridData = GridUtils.createGridLines(
      [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ],
      gridSizeMeters,
    );

    const gridSource = map.getSource("grid") as any;
    if (gridSource) {
      gridSource.setData(gridData);
    }

    return gridSizeMeters;
  }, [mapRef, showGrid]);

  return {
    updateGridForViewport,
  };
};

// Export utility functions for external use
export const GridUtils = {
  metersToDegreesLat: (meters: number) => meters / 111320,
  metersToDegreesLng: (meters: number, latitude: number) =>
    meters / (111320 * Math.cos((latitude * Math.PI) / 180)),
  createGridLines: (
    bounds: [number, number, number, number],
    gridSizeMeters: number = 1,
  ) => {
    const [minLng, minLat, maxLng, maxLat] = bounds;
    const features = [];

    const centerLat = (minLat + maxLat) / 2;
    const gridSizeLat = GridUtils.metersToDegreesLat(gridSizeMeters);
    const gridSizeLng = GridUtils.metersToDegreesLng(gridSizeMeters, centerLat);

    // Create vertical lines (longitude)
    const startLng = Math.floor(minLng / gridSizeLng) * gridSizeLng;
    const endLng = Math.ceil(maxLng / gridSizeLng) * gridSizeLng;
    for (let lng = startLng; lng <= endLng; lng += gridSizeLng) {
      features.push({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [lng, minLat],
            [lng, maxLat],
          ],
        },
        properties: { gridSize: gridSizeMeters },
      });
    }

    // Create horizontal lines (latitude)
    const startLat = Math.floor(minLat / gridSizeLat) * gridSizeLat;
    const endLat = Math.ceil(maxLat / gridSizeLat) * gridSizeLat;
    for (let lat = startLat; lat <= endLat; lat += gridSizeLat) {
      features.push({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [minLng, lat],
            [maxLng, lat],
          ],
        },
        properties: { gridSize: gridSizeMeters },
      });
    }

    return {
      type: "FeatureCollection" as const,
      features,
    };
  },
  getGridSizeForZoom: (zoom: number) => {
    if (zoom >= 20)
      return 1; // 1m
    else if (zoom >= 18)
      return 10; // 10m
    else if (zoom >= 16)
      return 100; // 100m
    else if (zoom >= 14)
      return 1000; // 1km
    else if (zoom >= 12)
      return 10000; // 10km
    else return 100000; // 100km
  },
};

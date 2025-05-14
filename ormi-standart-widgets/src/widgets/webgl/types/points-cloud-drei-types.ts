import { SelectedTopic } from "ormi-core/datasources";
import { Color } from "ormi-core/types";
import * as THREE from 'three';

export interface PointsCloudProps {
    title: string;
    topic: SelectedTopic;
    maxPoints?: number;
    updateRate?: number; // ms between updates
    pointSize?: number; // size of points
    decayTime?: number; // Time in ms for points to fade away completely
    rollingBuffer?: boolean; // Whether to use rolling buffer with decay
    rotation?: {
        x: number;
        y: number;
        z: number;
    };
    translation?: {
        x: number;
        y: number;
        z: number;
    };
}

// Track point with timestamp for decay calculation
export interface TimestampedPoint {
    position: THREE.Vector3;
    color?: Color;
    timestamp: number;
}

// Props for OptimizedPointsCloud component
export interface OptimizedPointsCloudProps {
    pointsArray: THREE.Vector3[];
    pointsColors?: Color[];
    pointSize?: number;
    rotation?: { x: number, y: number, z: number };
    translation?: { x: number, y: number, z: number };
}

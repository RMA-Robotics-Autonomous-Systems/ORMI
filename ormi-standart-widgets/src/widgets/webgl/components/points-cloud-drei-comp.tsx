import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls, PerspectiveCamera, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useLocalDataSource } from "ormi-core/datasources";
import { PointsCloud, Color } from 'ormi-core/types';
import { OptimizedPointsCloud } from './optimized-points-cloud';
import { PointsCloudProps, TimestampedPoint } from '../types/points-cloud-drei-types';
import { useThrottle } from '../hooks/use-throttle';

/**
 * Main component for rendering a points cloud
 */
export const PointsCloudComp = (props: PointsCloudProps) => {
    const maxPoints = props.maxPoints ?? 100;
    const updateRate = props.updateRate ?? 50; // ms between updates
    const pointSize = props.pointSize ?? 0.05;
    const decayTime = props.decayTime ?? 0; // Default: no decay
    const rollingBuffer = props.rollingBuffer ?? false;
    const theme = props.theme ?? 'Default'; // Default theme if none provided
    const useTransparency = props.useTransparency ?? false; // Default to non-transparent points
    const customColor = props.customColor ?? '#ffffff'; // Default custom color
    const rotation = props.rotation ?? { x: 0, y: 0, z: 0 };
    const translation = props.translation ?? { x: 0, y: 0, z: 0 };

    const { sources } = useLocalDataSource();
    const sources_keys = Array.from(sources.keys());
    const value = sources_keys.length > 0 ? sources.get(sources_keys[sources_keys.length - 1]) : { data: [] };
    const throttledValue = useThrottle(value, updateRate);

    // Keep track of points with timestamps for rolling buffer
    const [pointsBuffer, setPointsBuffer] = useState<TimestampedPoint[]>([]);

    // Extract points data
    const last_value: PointsCloud & { colors?: Color[] } =
        (throttledValue?.data?.[0] as PointsCloud) || { points: [] };

    useEffect(() => {
        if (last_value?.points?.length) {
            if (rollingBuffer) {
                // Create new timestamped points
                const currentTime = Date.now();
                const newPoints = last_value.points.map((p, idx) => ({
                    position: new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0),
                    color: last_value.colors ? last_value.colors[idx] : undefined,
                    timestamp: currentTime
                }));

                // Update the buffer - keeping both old and new points
                setPointsBuffer(prevBuffer => {
                    const combined = [...prevBuffer, ...newPoints];
                    // If we're over maxPoints, remove oldest points first
                    return combined.length > maxPoints
                        ? combined.slice(combined.length - maxPoints)
                        : combined;
                });
            } else {
                // Standard mode - just use the current points
                const currentTime = Date.now();
                const newPoints = last_value.points.slice(0, maxPoints).map((p, idx) => ({
                    position: new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0),
                    color: last_value.colors && last_value.colors[idx] ? last_value.colors[idx] : undefined,
                    timestamp: currentTime
                }));
                setPointsBuffer(newPoints);
            }
        }
    }, [throttledValue, rollingBuffer, maxPoints, last_value]);

    // Clean up old points if using decay time
    useEffect(() => {
        if (decayTime > 0 && rollingBuffer) {
            const cleanupInterval = setInterval(() => {
                const currentTime = Date.now();
                setPointsBuffer(prevBuffer =>
                    // Only remove points that have completely faded out (with a small buffer)
                    prevBuffer.filter(point => {
                        const age = currentTime - point.timestamp;
                        // Keep points that haven't exceeded decay time + small buffer
                        // The small buffer ensures the point has completely faded visually before removing
                        return age < (decayTime + 100);
                    })
                );
            }, Math.min(1000, decayTime / 5)); // Less frequent cleanup

            return () => clearInterval(cleanupInterval);
        }
    }, [decayTime, rollingBuffer]);

    // Extract positions and colors from buffer
    const pointsArray = pointsBuffer.map(p => p.position);
    const pointsColors = pointsBuffer.length > 0 && pointsBuffer.some(p => p.color)
        ? pointsBuffer.map(p => p.color).filter(Boolean) as Color[]
        : undefined;

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Canvas>
                <PerspectiveCamera makeDefault position={[0, 0, 5]} />
                <ambientLight intensity={1} />


                <axesHelper args={[5]} />
                <GizmoHelper
                    alignment="bottom-right"
                    margin={[80, 80]}>
                    <GizmoViewport axisColors={['red', 'green', 'blue']} labelColor="black" />
                </GizmoHelper>


                <OrbitControls makeDefault />
                <Grid infiniteGrid={true} sectionColor={THREE.Color.NAMES.lightblue} />

                {pointsArray.length > 0 && (
                    <OptimizedPointsCloud
                        pointsArray={pointsArray}
                        pointsColors={pointsColors}
                        pointSize={pointSize}
                        theme={theme}
                        useTransparency={useTransparency}
                        customColor={customColor}
                        rotation={rotation}
                        translation={translation}
                    />
                )}
            </Canvas>
        </div>
    );
};

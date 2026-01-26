import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Grid, OrbitControls, PerspectiveCamera, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { PointsCloudProps } from '../types/points-cloud-drei-types';
import { useLocalDataSource } from '@workspace/ormi-core/datasources';
import { PointsCloud, Transform, CoordinateConvention, Vector3, Color } from '@workspace/ormi-core/types';
import {
    findTransformChain,
    useTransformSource,
    createPositionConverter,
    applyTransformChain  // Use the pure math version from utils
} from '@workspace/ormi-core/transforms';
import { themeShaders } from '../utils/theme-shaders';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Get color from theme based on intensity value (0-1)
 */
/**
 * Turbo colormap - matches Foxglove's reflectivity visualization
 * Blue -> Cyan -> Green -> Yellow -> Orange -> Red
 * Provides high contrast for reflectivity values
 */
function turboColormap(t: number): { r: number; g: number; b: number } {
    // Attempt to closely replicate the "Turbo" colormap used in Foxglove
    // t should be in [0, 1]
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;
    const t6 = t5 * t;

    const r = clamp01(0.13572138 + 4.61539260 * t - 42.66032258 * t2 + 132.13108234 * t3 - 152.94239396 * t4 + 59.28637943 * t5);
    const g = clamp01(0.09140261 + 2.19418839 * t + 4.84296658 * t2 - 14.18503333 * t3 + 4.27729857 * t4 + 2.82798289 * t5);
    const b = clamp01(0.10667330 + 12.64194608 * t - 60.58204836 * t2 + 110.36276771 * t3 - 89.90310912 * t4 + 27.34824973 * t5);

    return { r, g, b };
}

function colorFromTheme(value: number, theme: string, customColor: string): { r: number; g: number; b: number } {
    const v = clamp01(value);

    switch (theme) {
        case 'Neon':
            if (v < 0.25) return { r: mix(0.3, 0.1, v * 4), g: mix(0.0, 0.2, v * 4), b: mix(0.8, 1.0, v * 4) };
            if (v < 0.5) return { r: mix(0.1, 0.0, (v - 0.25) * 4), g: mix(0.2, 1.0, (v - 0.25) * 4), b: 1.0 };
            if (v < 0.75) return { r: mix(0.0, 1.0, (v - 0.5) * 4), g: mix(1.0, 0.0, (v - 0.5) * 4), b: 1.0 };
            return { r: 1.0, g: 0.0, b: mix(1.0, 0.5, (v - 0.75) * 4) };
        case 'Plasma':
            if (v < 0.25) return { r: mix(0.0, 0.5, v * 4), g: 0.0, b: mix(0.5, 0.8, v * 4) };
            if (v < 0.5) return { r: mix(0.5, 0.9, (v - 0.25) * 4), g: 0.0, b: mix(0.8, 0.9, (v - 0.25) * 4) };
            if (v < 0.75) return { r: mix(0.9, 1.0, (v - 0.5) * 4), g: mix(0.0, 0.5, (v - 0.5) * 4), b: mix(0.9, 0.0, (v - 0.5) * 4) };
            return { r: 1.0, g: mix(0.5, 1.0, (v - 0.75) * 4), b: 0.0 };
        case 'Thermal':
            if (v < 0.25) return { r: 0.0, g: 0.0, b: mix(0.5, 1.0, v * 4) };
            if (v < 0.5) return { r: 0.0, g: mix(0.0, 1.0, (v - 0.25) * 4), b: 1.0 };
            if (v < 0.75) return { r: mix(0.0, 1.0, (v - 0.5) * 4), g: 1.0, b: 0.0 };
            return { r: 1.0, g: mix(1.0, 0.0, (v - 0.75) * 4), b: 0.0 };
        case 'Distance':
            if (v < 0.25) return { r: 0.0, g: mix(0.2, 0.5, v * 4), b: mix(0.8, 0.9, v * 4) };
            if (v < 0.5) return { r: 0.0, g: mix(0.5, 0.8, (v - 0.25) * 4), b: mix(0.9, 0.2, (v - 0.25) * 4) };
            if (v < 0.75) return { r: mix(0.0, 0.9, (v - 0.5) * 4), g: mix(0.8, 0.9, (v - 0.5) * 4), b: mix(0.2, 0.0, (v - 0.5) * 4) };
            return { r: mix(0.9, 1.0, (v - 0.75) * 4), g: mix(0.9, 0.0, (v - 0.75) * 4), b: 0.0 };
        case 'Solid': {
            const base = new THREE.Color(customColor);
            return { r: base.r, g: base.g, b: base.b };
        }
        default:
            // Default theme uses Turbo colormap for high-contrast reflectivity
            return turboColormap(v);
    }
}

interface PointEntry {
    x: number;
    y: number;
    z: number;
    r: number;
    g: number;
    b: number;
    timestamp: number;
}

interface PointsRendererProps {
    pointSize: number;
    theme: string;
    useTransparency: boolean;
    customColor: string;
    decayTime: number;
    rollingBuffer: boolean;
    colorMode: string;
    targetFrame: string;
    sourceConvention: CoordinateConvention;
}

/**
 * Inner renderer component - handles all Three.js operations
 * Uses dynamic buffer resizing - no maxPoints limit needed
 */
const PointsRenderer = ({
    pointSize,
    theme,
    useTransparency,
    customColor,
    decayTime,
    rollingBuffer,
    colorMode,
    targetFrame,
    sourceConvention
}: PointsRendererProps) => {
    const { sources } = useLocalDataSource();
    const { transformsTrees } = useTransformSource();
    const { invalidate } = useThree();

    // Settings refs - updated instantly without re-render
    const settingsRef = useRef({
        pointSize,
        theme,
        useTransparency,
        customColor,
        decayTime,
        rollingBuffer,
        colorMode,
        targetFrame,
        sourceConvention
    });

    // Update settings ref immediately when props change
    settingsRef.current = {
        pointSize,
        theme,
        useTransparency,
        customColor,
        decayTime,
        rollingBuffer,
        colorMode,
        targetFrame,
        sourceConvention
    };

    // Three.js objects refs - stable across renders
    const pointsRef = useRef<THREE.Points | null>(null);
    const geometryRef = useRef<THREE.BufferGeometry | null>(null);
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);

    // Point data storage - dynamic array
    const pointsDataRef = useRef<PointEntry[]>([]);

    // Tracking refs
    const needsUpdateRef = useRef(false);
    const dataVersionRef = useRef(0);  // Increment on each data update to track freshness

    // Initialize Three.js objects once
    useEffect(() => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
        geometryRef.current = geometry;

        const shaders = themeShaders[settingsRef.current.theme as keyof typeof themeShaders] || themeShaders.Default;
        const material = new THREE.ShaderMaterial({
            uniforms: {
                pointSize: { value: settingsRef.current.pointSize },
                useTransparency: { value: settingsRef.current.useTransparency },
                customColor: { value: new THREE.Vector3(1, 1, 1) }
            },
            vertexShader: shaders.vertexShader,
            fragmentShader: shaders.fragmentShader,
            transparent: settingsRef.current.useTransparency,
            depthWrite: !settingsRef.current.useTransparency,
            depthTest: true,
            vertexColors: true
        });
        materialRef.current = material;

        return () => {
            geometry.dispose();
            material.dispose();
        };
    }, []);

    // Process new data from sources
    const processData = useCallback(() => {
        const settings = settingsRef.current;
        const currentTime = Date.now();
        const newPoints: PointEntry[] = [];

        // Compute transform chains
        const transformChains = new Map<string, ReturnType<typeof findTransformChain>>();
        for (const [sourceId, source] of sources.entries()) {
            const refFrame = source.referenceFrameId;
            if (!settings.targetFrame || settings.targetFrame === '' || refFrame === settings.targetFrame) {
                transformChains.set(sourceId, []);
            } else {
                transformChains.set(sourceId, findTransformChain(transformsTrees, refFrame, settings.targetFrame));
            }
        }

        // Process each source
        for (const [sourceId, source] of sources.entries()) {
            const cloud = source.data[source.data.length - 1] as PointsCloud | undefined;
            if (!cloud?.points?.length) continue;

            // Hoist type checks outside the loop for performance
            const isPackedPoints =
                cloud.points instanceof Float32Array ||
                (Array.isArray(cloud.points) && typeof cloud.points[0] === 'number');
            const isPackedColors =
                cloud.colors instanceof Float32Array ||
                (Array.isArray(cloud.colors) && typeof cloud.colors[0] === 'number');

            const transformChain = transformChains.get(sourceId);
            if (settings.targetFrame && transformChain === null) continue;

            const hasTransform = transformChain && transformChain.length > 0;

            // Determine the source convention:
            // 1. Use the convention from the data if available
            // 2. Fall back to the widget's configured sourceConvention
            // 3. Default to 'ROS' for backwards compatibility
            const dataConvention = cloud.convention ?? settings.sourceConvention ?? 'ROS';

            // Create converter from source convention to Three.js
            const toThreeCoords = createPositionConverter(dataConvention, 'THREE');

            const pointCount = isPackedPoints
                ? Math.floor(cloud.points.length / 3)
                : cloud.points.length;

            // Pre-compute color mode flags
            const useReflectivity = settings.colorMode === 'reflectivity';
            const hasIntensities = !!cloud.intensities;
            const hasColors = !!cloud.colors;

            // Separate processing paths for packed vs unpacked data
            // This avoids repeated type checks in the inner loop
            if (isPackedPoints) {
                // Fast path for packed Float32Array data
                const packed = cloud.points as Float32Array | number[];
                const packedColors = isPackedColors ? (cloud.colors as Float32Array | number[]) : null;
                const intensities = cloud.intensities;

                for (let i = 0; i < pointCount; i++) {
                    const idx = i * 3;
                    let x = packed[idx] || 0;
                    let y = packed[idx + 1] || 0;
                    let z = packed[idx + 2] || 0;

                    // Apply transform chain in source coordinate space
                    if (hasTransform) {
                        const transformed = applyTransformChain({ x, y, z }, transformChain!);
                        x = transformed.x;
                        y = transformed.y;
                        z = transformed.z;
                    }

                    // Convert from source convention to Three.js coordinates for rendering
                    const pos = toThreeCoords({ x, y, z });

                    // Determine color
                    let r = 1, g = 1, b = 1;

                    if (useReflectivity && hasIntensities) {
                        const intensity = intensities![i];
                        if (intensity !== undefined && Number.isFinite(intensity)) {
                            const col = colorFromTheme(intensity, settings.theme, settings.customColor);
                            r = col.r; g = col.g; b = col.b;
                        }
                    } else if (packedColors) {
                        r = packedColors[idx] ?? r;
                        g = packedColors[idx + 1] ?? g;
                        b = packedColors[idx + 2] ?? b;
                    }

                    newPoints.push({
                        x: pos.x, y: pos.y, z: pos.z,
                        r, g, b,
                        timestamp: currentTime
                    });
                }
            } else {
                // Slower path for unpacked Vector3[] data
                const points = cloud.points as Vector3[];
                const colors = hasColors && !isPackedColors ? (cloud.colors as Color[]) : null;
                const intensities = cloud.intensities;

                for (let i = 0; i < pointCount; i++) {
                    const p = points[i];
                    if (!p) continue;

                    let x = p.x || 0;
                    let y = p.y || 0;
                    let z = p.z || 0;

                    // Apply transform chain in source coordinate space
                    if (hasTransform) {
                        const transformed = applyTransformChain({ x, y, z }, transformChain!);
                        x = transformed.x;
                        y = transformed.y;
                        z = transformed.z;
                    }

                    // Convert from source convention to Three.js coordinates for rendering
                    const pos = toThreeCoords({ x, y, z });

                    // Determine color
                    let r = 1, g = 1, b = 1;

                    if (useReflectivity && hasIntensities) {
                        const intensity = intensities![i];
                        if (intensity !== undefined && Number.isFinite(intensity)) {
                            const col = colorFromTheme(intensity, settings.theme, settings.customColor);
                            r = col.r; g = col.g; b = col.b;
                        }
                    } else if (colors) {
                        const color = colors[i];
                        if (color && typeof color === 'object') {
                            r = color.r;
                            g = color.g;
                            b = color.b;
                        }
                    }

                    newPoints.push({
                        x: pos.x, y: pos.y, z: pos.z,
                        r, g, b,
                        timestamp: currentTime
                    });
                }
            }
        }

        if (newPoints.length === 0) return;

        // Update point storage
        if (settings.rollingBuffer) {
            // Append new points
            pointsDataRef.current.push(...newPoints);
        } else {
            // Replace all points
            pointsDataRef.current = newPoints;
        }

        dataVersionRef.current++;
        needsUpdateRef.current = true;
    }, [sources, transformsTrees]);

    // Handle decay - remove old points (only for rolling buffer mode)
    const handleDecay = useCallback(() => {
        const settings = settingsRef.current;
        // Double-check settings - decay only applies to rolling buffer with decayTime > 0
        if (!settings.rollingBuffer || settings.decayTime <= 0) {
            return;
        }

        const currentTime = Date.now();
        const cutoff = currentTime - settings.decayTime;
        const before = pointsDataRef.current.length;

        pointsDataRef.current = pointsDataRef.current.filter(p => p.timestamp > cutoff);

        if (pointsDataRef.current.length !== before) {
            needsUpdateRef.current = true;
            invalidate();
        }
    }, [invalidate]);

    // Update geometry buffers
    const updateGeometry = useCallback(() => {
        if (!geometryRef.current || !needsUpdateRef.current) return;

        const points = pointsDataRef.current;
        const count = points.length;

        if (count === 0) {
            geometryRef.current.setDrawRange(0, 0);
            return;
        }

        // Create new typed arrays
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const p = points[i];
            if (!p) continue;
            const idx = i * 3;
            positions[idx] = p.x;
            positions[idx + 1] = p.y;
            positions[idx + 2] = p.z;
            colors[idx] = p.r;
            colors[idx + 1] = p.g;
            colors[idx + 2] = p.b;
        }

        // Update or replace attributes
        const posAttr = geometryRef.current.getAttribute('position');
        const colAttr = geometryRef.current.getAttribute('color');

        if (posAttr && posAttr.count === count) {
            // Same size - just update data
            (posAttr.array as Float32Array).set(positions);
            (colAttr.array as Float32Array).set(colors);
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
        } else {
            // Different size - replace attributes
            geometryRef.current.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometryRef.current.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        }

        geometryRef.current.setDrawRange(0, count);
        geometryRef.current.computeBoundingSphere();

        needsUpdateRef.current = false;
        invalidate();
    }, [invalidate]);

    // Update material settings
    const updateMaterial = useCallback(() => {
        if (!materialRef.current) return;

        const settings = settingsRef.current;
        const mat = materialRef.current;
        if (!mat.uniforms) return;

        // Update uniforms
        if (mat.uniforms.pointSize) mat.uniforms.pointSize.value = settings.pointSize;
        if (mat.uniforms.useTransparency) mat.uniforms.useTransparency.value = settings.useTransparency;

        const customCol = new THREE.Color(settings.customColor);
        if (mat.uniforms.customColor) mat.uniforms.customColor.value.set(customCol.r, customCol.g, customCol.b);

        // Update shaders if theme changed
        const shaders = themeShaders[settings.theme as keyof typeof themeShaders] || themeShaders.Default;
        if (mat.vertexShader !== shaders.vertexShader) {
            mat.vertexShader = shaders.vertexShader;
            mat.fragmentShader = shaders.fragmentShader;
            mat.needsUpdate = true;
        }

        mat.transparent = settings.useTransparency;
        mat.depthWrite = !settings.useTransparency;
    }, []);

    // Process data when sources change
    useEffect(() => {
        processData();
    }, [sources, processData]);

    // Decay timer - runs continuously but only acts when rolling buffer is enabled
    useEffect(() => {
        // Always set up interval, but handleDecay checks settings internally
        const interval = setInterval(() => {
            handleDecay();
        }, 100); // Check every 100ms

        return () => clearInterval(interval);
    }, [handleDecay]);

    // Animation frame - update geometry and material
    useFrame(() => {
        updateMaterial();
        updateGeometry();
    });

    if (!geometryRef.current || !materialRef.current) return null;

    // Use type assertions to work around Three.js/R3F type compatibility issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geometry = geometryRef.current as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const material = materialRef.current as any;

    return (
        <points
            ref={pointsRef}
            geometry={geometry}
            material={material}
        />
    );
};

/**
 * Main PointsCloud component
 */
export const PointsCloudComp = (props: PointsCloudProps) => {
    const pointSize = props.pointSize ?? 0.05;
    const decayTime = props.decayTime ?? 0;
    const rollingBuffer = props.rollingBuffer ?? false;
    const theme = props.theme ?? 'Default';
    const useTransparency = props.useTransparency ?? false;
    const customColor = props.customColor ?? '#ffffff';
    const colorMode = props.colorMode ?? 'source';
    const targetFrame = props.targetFrame ?? '';
    // Default to ROS for backwards compatibility with existing configurations
    const sourceConvention = props.sourceConvention ?? 'ROS';

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Canvas frameloop="demand">
                <PerspectiveCamera makeDefault position={[0, 5, 10]} />
                <ambientLight intensity={1} />

                <axesHelper args={[5]} />
                <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                    <GizmoViewport axisColors={['red', 'green', 'blue']} labelColor="black" />
                </GizmoHelper>

                <OrbitControls makeDefault />
                <Grid infiniteGrid={true} sectionColor="lightblue" />

                <PointsRenderer
                    pointSize={pointSize}
                    theme={theme}
                    useTransparency={useTransparency}
                    customColor={customColor}
                    decayTime={decayTime}
                    rollingBuffer={rollingBuffer}
                    colorMode={colorMode}
                    targetFrame={targetFrame}
                    sourceConvention={sourceConvention}
                />
            </Canvas>
        </div>
    );
};

import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Grid, OrbitControls, PerspectiveCamera, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { PointsCloudProps } from '../types/points-cloud-drei-types';
import { useLocalDataSource } from '@workspace/ormi-core/datasources';
import { PointsCloud, Transform, CoordinateConvention } from '@workspace/ormi-core/types';
import {
    findTransformChain,
    useTransformSource,
    convertPosition,
    convertQuaternion
} from '@workspace/ormi-core/transforms';
import { themeShaders } from '../utils/theme-shaders';

const MAX_ROLLING_POINTS = 600000;

class RingPointBuffer {
    private positions: Float32Array;
    private colors: Float32Array;
    private intensities: Float32Array;
    private timestamps: Float32Array;
    private capacity: number;
    private writeIndex: number = 0;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.positions = new Float32Array(capacity * 3);
        this.colors = new Float32Array(capacity * 3);
        this.intensities = new Float32Array(capacity);
        this.timestamps = new Float32Array(capacity);
        // Initialize all timestamps to 0 (will be invisible until written)
        this.timestamps.fill(0);
    }

    push(
        positions: Float32Array,
        colors: Float32Array,
        intensities: Float32Array,
        count: number,
        currentTime: number,
    ): void {
        // Write points at current position, wrapping around
        for (let i = 0; i < count; i++) {
            const srcIdx3 = i * 3;
            const dstIdx = this.writeIndex;
            const dstIdx3 = dstIdx * 3;

            this.positions[dstIdx3] = positions[srcIdx3]!;
            this.positions[dstIdx3 + 1] = positions[srcIdx3 + 1]!;
            this.positions[dstIdx3 + 2] = positions[srcIdx3 + 2]!;
            this.colors[dstIdx3] = colors[srcIdx3]!;
            this.colors[dstIdx3 + 1] = colors[srcIdx3 + 1]!;
            this.colors[dstIdx3 + 2] = colors[srcIdx3 + 2]!;
            this.intensities[dstIdx] = intensities[i]!;
            this.timestamps[dstIdx] = currentTime;

            this.writeIndex = (this.writeIndex + 1) % this.capacity;
        }
    }

    getData(): { positions: Float32Array; colors: Float32Array; intensities: Float32Array; timestamps: Float32Array } {
        return {
            positions: this.positions,
            colors: this.colors,
            intensities: this.intensities,
            timestamps: this.timestamps,
        };
    }

    getCapacity(): number {
        return this.capacity;
    }
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

const buildTransformMatrix = (
    transformChain: Transform[] | undefined,
    fallbackConvention: CoordinateConvention,
): THREE.Matrix4 => {
    const matrix = new THREE.Matrix4();
    matrix.identity();

    if (!transformChain || transformChain.length === 0) {
        return matrix;
    }

    for (const transform of transformChain) {
        const convention = transform.convention ?? fallbackConvention ?? "ROS";
        const position = convertPosition(
            { x: transform.position.x, y: transform.position.y, z: transform.position.z },
            convention,
            "THREE",
        );
        const rotation = convertQuaternion(transform.rotation, convention, "THREE");

        const transformMatrix = new THREE.Matrix4();
        transformMatrix.compose(
            new THREE.Vector3(position.x, position.y, position.z),
            new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
            new THREE.Vector3(1, 1, 1),
        );

        // Apply in chain order: Tn * ... * T1
        matrix.premultiply(transformMatrix);
    }

    return matrix;
};

type PointsSourceRendererProps = {
    sourceId: string;
    source: any;
    transformsTrees: any;
    settings: PointsRendererProps;
    frameTimeRef: React.MutableRefObject<number>;
};

const PointsSourceRenderer = ({ sourceId, source, transformsTrees, settings, frameTimeRef }: PointsSourceRendererProps) => {
    const { invalidate } = useThree();

    const pointsRef = useRef<THREE.Points | null>(null);
    const geometryRef = useRef<THREE.BufferGeometry | null>(null);
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);

    const dataRef = useRef<{ positions: Float32Array | null; colors: Float32Array | null; intensities: Float32Array | null; timestamps: Float32Array | null; capacity: number }>(
        { positions: null, colors: null, intensities: null, timestamps: null, capacity: 0 },
    );
    const needsUpdateRef = useRef(false);
    const transformRef = useRef(new THREE.Matrix4());
    const rollingBufferRef = useRef<RingPointBuffer | null>(null);
    const lastProcessedIndexRef = useRef(0);
    const lastProcessedTimeRef = useRef(0);
    const startTimeRef = useRef<number>(Date.now()); // Reference point for relative time

    useEffect(() => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
        geometry.setAttribute("intensity", new THREE.Float32BufferAttribute([], 1));
        geometry.setAttribute("timestamp", new THREE.Float32BufferAttribute([], 1));
        geometryRef.current = geometry;

        const shaders = themeShaders[settings.theme as keyof typeof themeShaders] || themeShaders.Default;
        const material = new THREE.ShaderMaterial({
            uniforms: {
                pointSize: { value: settings.pointSize },
                useTransparency: { value: settings.useTransparency },
                customColor: { value: new THREE.Vector3(1, 1, 1) },
                useIntensity: { value: settings.colorMode === "reflectivity" },
                pointTransform: { value: new THREE.Matrix4() },
                nowTime: { value: Date.now() },
                decayTime: { value: settings.decayTime || 0 },
            },
            vertexShader: shaders.vertexShader,
            fragmentShader: shaders.fragmentShader,
            transparent: settings.useTransparency,
            depthWrite: !settings.useTransparency,
            depthTest: true,
            vertexColors: true,
        });
        materialRef.current = material;

        return () => {
            geometry.dispose();
            material.dispose();
        };
    }, []);

    useEffect(() => {
        if (settings.rollingBuffer) {
            rollingBufferRef.current = new RingPointBuffer(MAX_ROLLING_POINTS);
            lastProcessedIndexRef.current = 0;
            lastProcessedTimeRef.current = 0;
        } else {
            rollingBufferRef.current = null;
        }
    }, [settings.rollingBuffer, sourceId]);

    const processData = useCallback(() => {
        const dataArray = source?.data ?? [];
        const timesArray = source?.times ?? [];
        if (dataArray.length === 0) return;

        // Compute transform chain -> single matrix (once per batch)
        let transformChain: ReturnType<typeof findTransformChain> | undefined = [];
        const refFrame = source.referenceFrameId;
        if (!settings.targetFrame || settings.targetFrame === "" || refFrame === settings.targetFrame) {
            transformChain = [];
        } else {
            transformChain = findTransformChain(transformsTrees, refFrame, settings.targetFrame) ?? null;
        }

        if (settings.targetFrame && transformChain === null) {
            return;
        }

        transformRef.current = buildTransformMatrix(transformChain as Transform[], settings.sourceConvention ?? "ROS");

        const getReceiveTimestamp = () => frameTimeRef.current;

        if (settings.rollingBuffer) {
            if (!rollingBufferRef.current) {
                rollingBufferRef.current = new RingPointBuffer(MAX_ROLLING_POINTS);
            }

            const startIndex = 0;
            let latestRawTime = lastProcessedTimeRef.current;
            let pushedCount = 0;

            for (let i = startIndex; i < dataArray.length; i++) {
                const cloud = dataArray[i] as PointsCloud | undefined;
                if (!cloud?.points?.length) continue;

                if (!(cloud.points instanceof Float32Array)) {
                    console.warn("PointsCloud expects packed Float32Array points. Skipping source", sourceId);
                    continue;
                }

                const pointCount = Math.floor(cloud.points.length / 3);
                if (pointCount === 0) continue;

                if (cloud.convention && cloud.convention !== "THREE") {
                    console.warn("PointsCloud convention is not THREE. Converter should output THREE coordinates.");
                    continue;
                }

                const hasColors = cloud.colors instanceof Float32Array && cloud.colors.length >= pointCount * 3;
                const hasIntensities = cloud.intensities instanceof Float32Array && cloud.intensities.length >= pointCount;

                const positions = cloud.points;
                let colors = hasColors ? cloud.colors! : null;
                let intensities = hasIntensities ? cloud.intensities! : null;

                if (!colors) {
                    colors = new Float32Array(pointCount * 3);
                    colors.fill(1);
                }

                if (!intensities) {
                    intensities = new Float32Array(pointCount);
                    intensities.fill(0);
                }

                const rawTime = Number.isFinite(timesArray[i]) ? (timesArray[i] as number) : i;
                if (rawTime === lastProcessedTimeRef.current) {
                    continue;
                }

                // Convert to relative time in seconds for float32 precision
                const receiveTime = getReceiveTimestamp();
                const messageTime = receiveTime;
                const messageTimeSeconds = (messageTime - startTimeRef.current) / 1000.0;

                rollingBufferRef.current.push(
                    positions,
                    colors,
                    intensities,
                    pointCount,
                    messageTimeSeconds, // Use seconds for float32 precision
                );

                pushedCount++;
                latestRawTime = rawTime;
            }

            lastProcessedIndexRef.current = dataArray.length;
            if (pushedCount > 0) {
                lastProcessedTimeRef.current = latestRawTime;
            }

            const data = rollingBufferRef.current.getData();
            dataRef.current = {
                positions: data.positions,
                colors: data.colors,
                intensities: data.intensities,
                timestamps: data.timestamps,
                capacity: rollingBufferRef.current.getCapacity(),
            };
        } else {
            const latestIndex = dataArray.length - 1;
            const cloud = dataArray[latestIndex] as PointsCloud | undefined;
            if (!cloud?.points?.length) return;

            if (!(cloud.points instanceof Float32Array)) {
                console.warn("PointsCloud expects packed Float32Array points. Skipping source", sourceId);
                return;
            }

            const pointCount = Math.floor(cloud.points.length / 3);
            if (pointCount === 0) return;

            if (cloud.convention && cloud.convention !== "THREE") {
                console.warn("PointsCloud convention is not THREE. Converter should output THREE coordinates.");
                return;
            }

            const hasColors = cloud.colors instanceof Float32Array && cloud.colors.length >= pointCount * 3;
            const hasIntensities = cloud.intensities instanceof Float32Array && cloud.intensities.length >= pointCount;

            const positions = cloud.points;
            let colors = hasColors ? cloud.colors! : null;
            let intensities = hasIntensities ? cloud.intensities! : null;

            if (!colors) {
                colors = new Float32Array(pointCount * 3);
                colors.fill(1);
            }

            if (!intensities) {
                intensities = new Float32Array(pointCount);
                intensities.fill(0);
            }

            dataRef.current = {
                positions,
                colors,
                intensities,
                timestamps: null,
                capacity: pointCount,
            };
        }

        needsUpdateRef.current = true;
        invalidate();
    }, [source, sourceId, settings, transformsTrees, invalidate]);

    const updateGeometry = useCallback(() => {
        if (!geometryRef.current || !needsUpdateRef.current) return;

        const data = dataRef.current;
        if (!data.positions || !data.colors || !data.intensities || data.capacity === 0) {
            geometryRef.current.setDrawRange(0, 0);
            needsUpdateRef.current = false;
            return;
        }

        const count = data.capacity;
        const positionsView = data.positions.subarray(0, count * 3);
        const colorsView = data.colors.subarray(0, count * 3);
        const intensitiesView = data.intensities.subarray(0, count);
        const timestampsView = data.timestamps
            ? data.timestamps.subarray(0, count)
            : new Float32Array(count).fill(Date.now());

        const posAttr = geometryRef.current.getAttribute("position");

        // Recreate attributes only if capacity changed
        if (!posAttr || posAttr.count !== count) {
            geometryRef.current.setAttribute("position", new THREE.Float32BufferAttribute(positionsView, 3));
            geometryRef.current.setAttribute("color", new THREE.Float32BufferAttribute(colorsView, 3));
            geometryRef.current.setAttribute("intensity", new THREE.Float32BufferAttribute(intensitiesView, 1));
            geometryRef.current.setAttribute("timestamp", new THREE.Float32BufferAttribute(timestampsView, 1));
        } else {
            // Update in-place
            const colAttr = geometryRef.current.getAttribute("color");
            const intAttr = geometryRef.current.getAttribute("intensity");
            const tsAttr = geometryRef.current.getAttribute("timestamp");

            (posAttr.array as Float32Array).set(positionsView);
            (colAttr.array as Float32Array).set(colorsView);
            (intAttr.array as Float32Array).set(intensitiesView);
            (tsAttr.array as Float32Array).set(timestampsView);
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
            intAttr.needsUpdate = true;
            tsAttr.needsUpdate = true;
        }

        geometryRef.current.setDrawRange(0, count);
        geometryRef.current.computeBoundingSphere();

        needsUpdateRef.current = false;
    }, []);

    const updateMaterial = useCallback(() => {
        if (!materialRef.current) return;

        const mat = materialRef.current;
        if (!mat.uniforms) return;

        if (mat.uniforms.pointSize) mat.uniforms.pointSize.value = settings.pointSize;
        if (mat.uniforms.useTransparency) mat.uniforms.useTransparency.value = settings.useTransparency;
        if (mat.uniforms.useIntensity) mat.uniforms.useIntensity.value = settings.colorMode === "reflectivity";

        if (mat.uniforms.pointTransform) mat.uniforms.pointTransform.value.copy(transformRef.current);
        // Convert to relative time in seconds for float32 precision
        const now = frameTimeRef.current;
        const nowSeconds = (now - startTimeRef.current) / 1000.0;
        const decaySeconds = settings.decayTime / 1000.0;
        if (mat.uniforms.nowTime) mat.uniforms.nowTime.value = nowSeconds;
        if (mat.uniforms.decayTime) mat.uniforms.decayTime.value = decaySeconds;

        const customCol = new THREE.Color(settings.customColor);
        if (mat.uniforms.customColor) mat.uniforms.customColor.value.set(customCol.r, customCol.g, customCol.b);

        const shaders = themeShaders[settings.theme as keyof typeof themeShaders] || themeShaders.Default;
        if (mat.vertexShader !== shaders.vertexShader) {
            mat.vertexShader = shaders.vertexShader;
            mat.fragmentShader = shaders.fragmentShader;
            mat.needsUpdate = true;
        }

        mat.transparent = settings.useTransparency || (settings.rollingBuffer && settings.decayTime > 0);
        mat.depthWrite = !(settings.useTransparency || (settings.rollingBuffer && settings.decayTime > 0));

        invalidate();
    }, [settings, invalidate]);

    useEffect(() => {
        processData();
    }, [processData]);

    useFrame(() => {
        updateMaterial();
        updateGeometry();
    });

    if (!geometryRef.current || !materialRef.current) return null;

    return <points ref={pointsRef} geometry={geometryRef.current as any} material={materialRef.current as any} />;
};

/**
 * Inner renderer component - handles all Three.js operations
 * Uses packed-only point cloud data and shader transforms
 */
const PointsRenderer = (props: PointsRendererProps) => {
    const { sources } = useLocalDataSource();
    const { transformsTrees } = useTransformSource();
    const sharedFrameTimeRef = useRef<number>(Date.now());

    // Update shared frame time once per frame for all sources
    useFrame(() => {
        sharedFrameTimeRef.current = Date.now();
    });

    return (
        <>
            {Array.from(sources.entries()).map(([sourceId, source]) => (
                <PointsSourceRenderer
                    key={sourceId}
                    sourceId={sourceId}
                    source={source}
                    transformsTrees={transformsTrees}
                    settings={props}
                    frameTimeRef={sharedFrameTimeRef}
                />
            ))}
        </>
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
    const enableContinuousRender = rollingBuffer && decayTime > 0;

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Canvas frameloop={enableContinuousRender ? "always" : "demand"}>
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

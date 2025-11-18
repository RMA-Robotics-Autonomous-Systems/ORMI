import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { OptimizedPointsCloudProps } from '../types/points-cloud-drei-types';
import { themeShaders } from '../utils/theme-shaders';

/**
 * Optimized points renderer using Three.js BufferGeometry
 * Rolling buffer functionality maintained, but fading effect removed for performance
 */
export const OptimizedPointsCloud = ({
    pointsArray,
    pointsColors,
    pointSize = 0.05,
    theme = 'Default',
    useTransparency = false,
    customColor = '#ffffff',
    rotation,
    translation
}: OptimizedPointsCloudProps) => {
    const pointsRef = useRef<THREE.Points>(null);
    const { invalidate } = useThree();

    // Material reference for dynamic updates
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);

    // Create and manage the points geometry
    const [geometry] = useState(() => new THREE.BufferGeometry());

    // Create a shader material that properly handles points with selected theme
    const pointsMaterial = useMemo(() => {
        // Get the selected theme's shaders or fallback to Default
        const shaders = themeShaders[theme] || themeShaders.Default;

        // Parse custom color for shader use
        const threeColor = new THREE.Color(customColor);

        const material = new THREE.ShaderMaterial({
            uniforms: {
                pointSize: { value: pointSize },
                useTransparency: { value: useTransparency },
                customColor: { value: new THREE.Vector3(threeColor.r, threeColor.g, threeColor.b) }
            },
            vertexShader: shaders.vertexShader,
            fragmentShader: shaders.fragmentShader,
            transparent: useTransparency,
            depthWrite: !useTransparency,  // Enable depth writing for non-transparent points
            depthTest: true,
            vertexColors: true
        });

        materialRef.current = material;
        return material;
    }, [pointSize, theme, useTransparency, customColor]);

    // Apply rotation and translation
    useEffect(() => {
        if (pointsRef.current) {
            // Apply translation if available
            if (translation) {
                pointsRef.current.position.x = translation.x || 0;
                pointsRef.current.position.y = translation.y || 0;
                pointsRef.current.position.z = translation.z || 0;
            }

            // Apply rotation if available
            if (rotation) {
                pointsRef.current.rotation.x = (rotation.x || 0) * Math.PI / 180;
                pointsRef.current.rotation.y = (rotation.y || 0) * Math.PI / 180;
                pointsRef.current.rotation.z = (rotation.z || 0) * Math.PI / 180;
            }

            invalidate();
        }
    }, [rotation, translation, invalidate]);

    // Update geometry when points data changes
    useEffect(() => {
        if (!pointsArray.length) return;

        // Update positions
        const positions = new Float32Array(pointsArray.length * 3);

        // Update colors
        const colors = new Float32Array(pointsArray.length * 3);
        const defaultColor = new THREE.Color('#ffffff');

        pointsArray.forEach((point, i) => {
            positions[i * 3] = point.x || 0;
            positions[i * 3 + 1] = point.y || 0;
            positions[i * 3 + 2] = point.z || 0;

            if (pointsColors && pointsColors[i]) {
                colors[i * 3] = pointsColors[i].r;
                colors[i * 3 + 1] = pointsColors[i].g;
                colors[i * 3 + 2] = pointsColors[i].b;
            } else {
                colors[i * 3] = defaultColor.r;
                colors[i * 3 + 1] = defaultColor.g;
                colors[i * 3 + 2] = defaultColor.b;
            }
        });

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        geometry.computeBoundingSphere();
        invalidate();
    }, [pointsArray, pointsColors, geometry, invalidate]);

    // Update theme or transparency settings dynamically
    useEffect(() => {
        if (materialRef.current) {
            // Get the selected theme's shaders
            const shaders = themeShaders[theme] || themeShaders.Default;

            // Update the material with new shaders
            materialRef.current.vertexShader = shaders.vertexShader;
            materialRef.current.fragmentShader = shaders.fragmentShader;
            materialRef.current.needsUpdate = true;

            // Update uniforms
            if (materialRef.current.uniforms.useTransparency) {
                materialRef.current.uniforms.useTransparency.value = useTransparency;
            }

            // Update custom color uniform
            if (materialRef.current.uniforms.customColor) {
                const threeColor = new THREE.Color(customColor);
                materialRef.current.uniforms.customColor.value.set(threeColor.r, threeColor.g, threeColor.b);
            }

            // Update transparency setting
            materialRef.current.transparent = useTransparency;
            materialRef.current.depthWrite = !useTransparency;

            invalidate();
        }
    }, [theme, useTransparency, customColor, invalidate]);

    return <points ref={pointsRef} geometry={geometry as any} material={pointsMaterial as any} />;
};

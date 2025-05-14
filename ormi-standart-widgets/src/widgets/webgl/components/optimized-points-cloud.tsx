import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { OptimizedPointsCloudProps } from '../types/points-cloud-drei-types';

/**
 * Optimized points renderer using Three.js BufferGeometry
 * Rolling buffer functionality maintained, but fading effect removed for performance
 */
export const OptimizedPointsCloud = ({
    pointsArray,
    pointsColors,
    pointSize = 0.05,
    rotation,
    translation
}: OptimizedPointsCloudProps) => {
    const pointsRef = useRef<THREE.Points>(null);
    const { invalidate } = useThree();

    // Create and manage the points geometry
    const [geometry] = useState(() => new THREE.BufferGeometry());

    // Create a shader material that properly handles points - simplified version without decay/alpha logic
    const pointsMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                pointSize: { value: pointSize }
            },
            vertexShader: `
                varying vec3 vColor;
                uniform float pointSize;

                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;

                void main() {
                    // Create circular points
                    float distance = length(gl_PointCoord - vec2(0.5));
                    if (distance > 0.5) {
                        discard;
                    }
                    
                    // Apply smooth edges for better appearance
                    float opacity = smoothstep(0.5, 0.4, distance);
                    gl_FragColor = vec4(vColor, opacity);
                }
            `,
            transparent: true,
            depthWrite: false,  // Keeping this setting for consistent rendering of overlapping points
            depthTest: true,
            vertexColors: true
        });
    }, [pointSize]);

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

    return <points ref={pointsRef} geometry={geometry} material={pointsMaterial} />;
};

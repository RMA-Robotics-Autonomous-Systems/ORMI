import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OptimizedPointsCloudProps } from '../types/points-cloud-drei-types';

/**
 * Optimized points renderer using Three.js BufferGeometry
 */
export const OptimizedPointsCloud = ({
    pointsArray,
    pointsColors,
    pointSize = 0.05,
    decayTime = 0,
    rotation,
    translation
}: OptimizedPointsCloudProps) => {
    const pointsRef = useRef<THREE.Points>(null);
    const { invalidate } = useThree();

    // Create and manage the points geometry
    const [geometry] = useState(() => new THREE.BufferGeometry());

    // Create a shader material that properly handles points
    const pointsMaterial = useMemo(() => {
        if (decayTime > 0) {
            // Custom shader material for decay effect
            return new THREE.ShaderMaterial({
                uniforms: {
                    pointSize: { value: pointSize }
                },
                vertexShader: `
                    attribute float alpha;
                    varying vec3 vColor;
                    varying float vAlpha;
                    uniform float pointSize;

                    void main() {
                        vColor = color;
                        vAlpha = alpha;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    varying vec3 vColor;
                    varying float vAlpha;

                    void main() {
                        // Create circular points
                        float distance = length(gl_PointCoord - vec2(0.5));
                        if (distance > 0.5) {
                            discard;
                        }
                        
                        // Apply smooth edges for better appearance
                        float opacity = smoothstep(0.5, 0.4, distance) * vAlpha;
                        gl_FragColor = vec4(vColor, opacity);
                    }
                `,
                transparent: true,
                depthWrite: false,  // Important to prevent z-fighting with overlapping points
                depthTest: true,
                vertexColors: true
            });
        } else {
            // Custom shader for regular points (without decay)
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
                        
                        // Apply smooth edges
                        float opacity = smoothstep(0.5, 0.4, distance);
                        gl_FragColor = vec4(vColor, opacity);
                    }
                `,
                transparent: false,  // No transparency needed for regular points
                depthWrite: true,
                vertexColors: true
            });
        }
    }, [pointSize, decayTime]);

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

        // Add alpha attribute for decay effect
        if (decayTime > 0) {
            const alpha = new Float32Array(pointsArray.length);
            for (let i = 0; i < pointsArray.length; i++) {
                alpha[i] = 1.0; // Default full opacity
            }
            geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
        }

        geometry.computeBoundingSphere();
        invalidate();
    }, [pointsArray, pointsColors, geometry, invalidate, decayTime]);

    // Apply decay effect animation if enabled
    useFrame(({ clock, invalidate }) => {
        if (decayTime > 0 && geometry.attributes.alpha) {
            const alphaAttr = geometry.attributes.alpha as THREE.BufferAttribute;
            let needsUpdate = false;

            // Calculate decay factor based on decayTime - needs to reach zero at the end of decayTime
            const decayFactor = 1.0 / (decayTime / 16.67); // 60fps decay rate

            for (let i = 0; i < alphaAttr.count; i++) {
                const currentAlpha = alphaAttr.getX(i);
                if (currentAlpha > 0.01) { // Use small threshold to avoid near-zero calculations
                    // Apply smoother, more consistent decay
                    const newAlpha = Math.max(0, currentAlpha - decayFactor);
                    alphaAttr.setX(i, newAlpha);
                    needsUpdate = true;
                } else if (currentAlpha > 0) {
                    // Just zero out any nearly invisible points
                    alphaAttr.setX(i, 0);
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                alphaAttr.needsUpdate = true;
                invalidate();
            }
        }
    });

    return <points ref={pointsRef} geometry={geometry} material={pointsMaterial} />;
};

import {
    PointCloudTheme,
    ThemeShaders,
} from "../types/points-cloud-drei-types";

/**
 * Collection of shader themes for point cloud visualization
 */
export const themeShaders: Record<PointCloudTheme, ThemeShaders> = {
    Default: {
        vertexShader: `
            varying vec3 vColor;
            varying float vFade;
            uniform float pointSize;
            uniform bool useTransparency;
            uniform bool useIntensity;
            uniform mat4 pointTransform;
            uniform float nowTime;
            uniform float decayTime;
            attribute float intensity;
            attribute float timestamp;

            vec3 turboColormap(float t) {
                float t2 = t * t;
                float t3 = t2 * t;
                float t4 = t3 * t;
                float t5 = t4 * t;
                float r = clamp(0.13572138 + 4.61539260 * t - 42.66032258 * t2 + 132.13108234 * t3 - 152.94239396 * t4 + 59.28637943 * t5, 0.0, 1.0);
                float g = clamp(0.09140261 + 2.19418839 * t + 4.84296658 * t2 - 14.18503333 * t3 + 4.27729857 * t4 + 2.82798289 * t5, 0.0, 1.0);
                float b = clamp(0.10667330 + 12.64194608 * t - 60.58204836 * t2 + 110.36276771 * t3 - 89.90310912 * t4 + 27.34824973 * t5, 0.0, 1.0);
                return vec3(r, g, b);
            }

            void main() {
                vec3 baseColor = color;
                if (useIntensity) {
                    baseColor = turboColormap(clamp(intensity, 0.0, 1.0));
                }
                vColor = baseColor;

                if (decayTime > 0.0) {
                    float age = (nowTime - timestamp) / decayTime;
                    vFade = clamp(1.0 - age, 0.0, 1.0);
                } else {
                    vFade = 1.0;
                }

                vec4 worldPos = pointTransform * vec4(position, 1.0);
                vec4 mvPosition = modelViewMatrix * worldPos;
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vFade;
            uniform bool useTransparency;

            void main() {
                // Create circular points
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Apply smooth edges or solid points based on transparency setting
                float opacity = (useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0) * vFade;
                // Use vertex color directly - colors are computed on CPU based on colorMode
                gl_FragColor = vec4(vColor, opacity);
            }
        `,
    },

    Neon: {
        vertexShader: `
            varying vec3 vColor;
            varying float vFade;
            uniform float pointSize;
            uniform bool useTransparency;
            uniform bool useIntensity;
            uniform mat4 pointTransform;
            uniform float nowTime;
            uniform float decayTime;
            attribute float intensity;
            attribute float timestamp;

            vec3 themeColor(float v) {
                v = clamp(v, 0.0, 1.0);
                if (v < 0.25) return vec3(mix(0.3, 0.1, v * 4.0), mix(0.0, 0.2, v * 4.0), mix(0.8, 1.0, v * 4.0));
                if (v < 0.5) return vec3(mix(0.1, 0.0, (v - 0.25) * 4.0), mix(0.2, 1.0, (v - 0.25) * 4.0), 1.0);
                if (v < 0.75) return vec3(mix(0.0, 1.0, (v - 0.5) * 4.0), mix(1.0, 0.0, (v - 0.5) * 4.0), 1.0);
                return vec3(1.0, 0.0, mix(1.0, 0.5, (v - 0.75) * 4.0));
            }

            void main() {
                vec3 baseColor = color;
                if (useIntensity) {
                    baseColor = themeColor(intensity);
                }
                vColor = baseColor;

                if (decayTime > 0.0) {
                    float age = (nowTime - timestamp) / decayTime;
                    vFade = clamp(1.0 - age, 0.0, 1.0);
                } else {
                    vFade = 1.0;
                }

                vec4 worldPos = pointTransform * vec4(position, 1.0);
                vec4 mvPosition = modelViewMatrix * worldPos;
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vFade;
            uniform bool useTransparency;

            void main() {
                // Create circular points
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Apply neon glow effect to the vertex color
                // Boost saturation and add bloom-like edge glow
                vec3 neonColor = vColor * 1.2; // Boost brightness
                float edgeGlow = smoothstep(0.5, 0.3, distance);
                vec3 finalColor = neonColor * (0.8 + 0.4 * edgeGlow);
                
                // Apply simple opacity based on transparency setting
                float opacity = (useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0) * vFade;
                
                gl_FragColor = vec4(finalColor, opacity);
            }
        `,
    },

    Plasma: {
        vertexShader: `
            varying vec3 vColor;
            varying float vFade;
            uniform float pointSize;
            uniform bool useTransparency;
            uniform bool useIntensity;
            uniform mat4 pointTransform;
            uniform float nowTime;
            uniform float decayTime;
            attribute float intensity;
            attribute float timestamp;
            
            vec3 themeColor(float v) {
                v = clamp(v, 0.0, 1.0);
                if (v < 0.25) return vec3(mix(0.0, 0.5, v * 4.0), 0.0, mix(0.5, 0.8, v * 4.0));
                if (v < 0.5) return vec3(mix(0.5, 0.9, (v - 0.25) * 4.0), 0.0, mix(0.8, 0.9, (v - 0.25) * 4.0));
                if (v < 0.75) return vec3(mix(0.9, 1.0, (v - 0.5) * 4.0), mix(0.0, 0.5, (v - 0.5) * 4.0), mix(0.9, 0.0, (v - 0.5) * 4.0));
                return vec3(1.0, mix(0.5, 1.0, (v - 0.75) * 4.0), 0.0);
            }

            void main() {
                vec3 baseColor = color;
                if (useIntensity) {
                    baseColor = themeColor(intensity);
                }
                vColor = baseColor;

                if (decayTime > 0.0) {
                    float age = (nowTime - timestamp) / decayTime;
                    vFade = clamp(1.0 - age, 0.0, 1.0);
                } else {
                    vFade = 1.0;
                }
                
                vec4 worldPos = pointTransform * vec4(position, 1.0);
                vec4 mvPosition = modelViewMatrix * worldPos;
                
                // Enhanced point size calculation with subtle variation
                float sizeVariation = 1.0 + 0.1 * sin(worldPos.x * 5.0 + worldPos.y * 3.0 + worldPos.z * 4.0);
                gl_PointSize = pointSize * sizeVariation * (300.0 / -mvPosition.z);
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vFade;
            uniform bool useTransparency;

            void main() {
                // Create circular points
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Apply plasma-like color enhancement
                // Add subtle color shift based on point position within the sprite
                float edgeFactor = smoothstep(0.5, 0.2, distance);
                vec3 plasmaColor = vColor * (0.9 + 0.3 * edgeFactor);
                
                // Apply simple opacity based on transparency setting
                float opacity = (useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0) * vFade;
                
                gl_FragColor = vec4(plasmaColor, opacity);
            }
        `,
    },

    Thermal: {
        vertexShader: `
            varying vec3 vColor;
            varying float vFade;
            uniform float pointSize;
            uniform bool useTransparency;
            uniform bool useIntensity;
            uniform mat4 pointTransform;
            uniform float nowTime;
            uniform float decayTime;
            attribute float intensity;
            attribute float timestamp;

            vec3 themeColor(float v) {
                v = clamp(v, 0.0, 1.0);
                if (v < 0.25) return vec3(0.0, 0.0, mix(0.5, 1.0, v * 4.0));
                if (v < 0.5) return vec3(0.0, mix(0.0, 1.0, (v - 0.25) * 4.0), 1.0);
                if (v < 0.75) return vec3(mix(0.0, 1.0, (v - 0.5) * 4.0), 1.0, 0.0);
                return vec3(1.0, mix(1.0, 0.0, (v - 0.75) * 4.0), 0.0);
            }

            void main() {
                vec3 baseColor = color;
                if (useIntensity) {
                    baseColor = themeColor(intensity);
                }
                vColor = baseColor;

                if (decayTime > 0.0) {
                    float age = (nowTime - timestamp) / decayTime;
                    vFade = clamp(1.0 - age, 0.0, 1.0);
                } else {
                    vFade = 1.0;
                }
                
                vec4 worldPos = pointTransform * vec4(position, 1.0);
                vec4 mvPosition = modelViewMatrix * worldPos;
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vFade;
            uniform bool useTransparency;

            void main() {
                // Create circular points with thermal effect
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Apply thermal-like color enhancement
                // Use vertex color directly - colors are computed on CPU based on colorMode
                vec3 thermalColor = vColor;
                
                // Apply smooth edges or solid points based on transparency setting
                float opacity = (useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0) * vFade;
                
                gl_FragColor = vec4(thermalColor, opacity);
            }
        `,
    },

    Solid: {
        vertexShader: `
            uniform float pointSize;
            uniform vec3 customColor;
            uniform mat4 pointTransform;
            uniform float nowTime;
            uniform float decayTime;
            attribute float timestamp;
            varying float vFade;

            void main() {
                if (decayTime > 0.0) {
                    float age = (nowTime - timestamp) / decayTime;
                    vFade = clamp(1.0 - age, 0.0, 1.0);
                } else {
                    vFade = 1.0;
                }
                vec4 worldPos = pointTransform * vec4(position, 1.0);
                vec4 mvPosition = modelViewMatrix * worldPos;
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 customColor;
            varying float vFade;

            void main() {
                // Create solid points (no transparency gradient)
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Use custom color - ignores vertex colors and colorMode
                gl_FragColor = vec4(customColor, vFade);
            }
        `,
    },

    Distance: {
        vertexShader: `
            uniform float pointSize;
            uniform bool useTransparency;
            uniform mat4 pointTransform;
            uniform float nowTime;
            uniform float decayTime;
            attribute float timestamp;
            varying float vDistance;
            varying float vFade;
            
            void main() {
                if (decayTime > 0.0) {
                    float age = (nowTime - timestamp) / decayTime;
                    vFade = clamp(1.0 - age, 0.0, 1.0);
                } else {
                    vFade = 1.0;
                }
                vec4 worldPos = pointTransform * vec4(position, 1.0);
                vec4 mvPosition = modelViewMatrix * worldPos;
                
                // Calculate distance from origin (0,0,0) for distance-based coloring
                vDistance = length(worldPos.xyz);
                
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vDistance;
            varying float vFade;
            uniform bool useTransparency;

            // Helper function to map distance to color
            vec3 getDistanceColor(float distance) {
                // Normalized distance (0-1 range, adjust multiplier as needed)
                float normalizedDist = clamp(distance * 0.1, 0.0, 1.0);
                
                // Near (blues)
                if (normalizedDist < 0.25) {
                    return mix(
                        vec3(0.0, 0.2, 0.8), // Light blue
                        vec3(0.0, 0.5, 0.9), // Medium blue
                        normalizedDist * 4.0
                    );
                }
                // Medium-near (greens)
                else if (normalizedDist < 0.5) {
                    return mix(
                        vec3(0.0, 0.5, 0.9), // Medium blue
                        vec3(0.0, 0.8, 0.2), // Green
                        (normalizedDist - 0.25) * 4.0
                    );
                }
                // Medium-far (yellows)
                else if (normalizedDist < 0.75) {
                    return mix(
                        vec3(0.0, 0.8, 0.2), // Green
                        vec3(0.9, 0.9, 0.0), // Yellow
                        (normalizedDist - 0.5) * 4.0
                    );
                }
                // Far (reds)
                else {
                    return mix(
                        vec3(0.9, 0.9, 0.0), // Yellow
                        vec3(1.0, 0.0, 0.0), // Red
                        (normalizedDist - 0.75) * 4.0
                    );
                }
            }
            
            void main() {
                // Create circular points with distance-based coloring
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Get color based on distance from origin
                // This theme intentionally ignores vertex colors and colorMode
                vec3 distanceColor = getDistanceColor(vDistance);
                
                // Apply smooth edges or solid points based on transparency setting
                float opacity = (useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0) * vFade;
                
                gl_FragColor = vec4(distanceColor, opacity);
            }
        `,
    },
};

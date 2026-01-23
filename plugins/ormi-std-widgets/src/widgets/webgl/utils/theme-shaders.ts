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
            uniform float pointSize;
            uniform bool useTransparency;

            void main() {
                vColor = color;
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            uniform bool useTransparency;

            void main() {
                // Create circular points
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Apply smooth edges or solid points based on transparency setting
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                // Use vertex color directly - colors are computed on CPU based on colorMode
                gl_FragColor = vec4(vColor, opacity);
            }
        `,
    },

    Neon: {
        vertexShader: `
            varying vec3 vColor;
            uniform float pointSize;
            uniform bool useTransparency;

            void main() {
                vColor = color;
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
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
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                
                gl_FragColor = vec4(finalColor, opacity);
            }
        `,
    },

    Plasma: {
        vertexShader: `
            varying vec3 vColor;
            uniform float pointSize;
            uniform bool useTransparency;
            
            void main() {
                vColor = color;
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Enhanced point size calculation with subtle variation
                float sizeVariation = 1.0 + 0.1 * sin(position.x * 5.0 + position.y * 3.0 + position.z * 4.0);
                gl_PointSize = pointSize * sizeVariation * (300.0 / -mvPosition.z);
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
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
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                
                gl_FragColor = vec4(plasmaColor, opacity);
            }
        `,
    },

    Thermal: {
        vertexShader: `
            varying vec3 vColor;
            uniform float pointSize;
            uniform bool useTransparency;

            void main() {
                vColor = color;
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
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
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                
                gl_FragColor = vec4(thermalColor, opacity);
            }
        `,
    },

    Solid: {
        vertexShader: `
            uniform float pointSize;
            uniform vec3 customColor;

            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 customColor;

            void main() {
                // Create solid points (no transparency gradient)
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Use custom color - ignores vertex colors and colorMode
                gl_FragColor = vec4(customColor, 1.0);
            }
        `,
    },

    Distance: {
        vertexShader: `
            uniform float pointSize;
            uniform bool useTransparency;
            varying float vDistance;
            
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Calculate distance from origin (0,0,0) for distance-based coloring
                vDistance = length(position);
                
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vDistance;
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
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                
                gl_FragColor = vec4(distanceColor, opacity);
            }
        `,
    },
};

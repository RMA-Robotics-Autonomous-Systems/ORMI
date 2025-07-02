import { PointCloudTheme, ThemeShaders } from '../types/points-cloud-drei-types';

/**
 * Collection of shader themes for point cloud visualization
 */
export const themeShaders: Record<PointCloudTheme, ThemeShaders> = {
    Default: {
        vertexShader: `
            varying vec3 vColor;
            uniform float pointSize;
            uniform bool useTransparency;
            varying float vDistance;

            void main() {
                vColor = color;
                // Calculate distance from origin
                vDistance = length(position);
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vDistance;
            uniform bool useTransparency;

            void main() {
                // Create circular points
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Apply smooth edges or solid points based on transparency setting
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                gl_FragColor = vec4(vColor, opacity);
            }
        `
    },
    
    Neon: {
        vertexShader: `
            varying vec3 vColor;
            uniform float pointSize;
            uniform bool useTransparency;
            varying float vDistance;

            void main() {
                vColor = color;
                // Calculate distance from origin
                vDistance = length(position);
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vDistance;
            uniform bool useTransparency;
            
            // Helper function to map values to neon colors
            vec3 getNeonColor(float value) {
                // Neon color mapping based on distance
                value = clamp(value, 0.0, 1.0);
                
                // Cool neon (blue/purple)
                if (value < 0.25) {
                    return mix(
                        vec3(0.3, 0.0, 0.8), // Deep purple
                        vec3(0.1, 0.2, 1.0), // Electric blue
                        value * 4.0
                    );
                }
                // Mid-cool neon (blue/cyan)
                else if (value < 0.5) {
                    return mix(
                        vec3(0.1, 0.2, 1.0), // Electric blue
                        vec3(0.0, 1.0, 1.0), // Cyan
                        (value - 0.25) * 4.0
                    );
                }
                // Mid-warm neon (cyan/magenta)
                else if (value < 0.75) {
                    return mix(
                        vec3(0.0, 1.0, 1.0), // Cyan
                        vec3(1.0, 0.0, 1.0), // Magenta
                        (value - 0.5) * 4.0
                    );
                }
                // Hot neon (magenta/hot pink)
                else {
                    return mix(
                        vec3(1.0, 0.0, 1.0), // Magenta
                        vec3(1.0, 0.0, 0.5), // Hot pink
                        (value - 0.75) * 4.0
                    );
                }
            }

            void main() {
                // Create circular points
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Normalize distance and apply neon color mapping
                float normalizedDistance = clamp(vDistance * 0.1, 0.0, 1.0);
                vec3 neonColor = getNeonColor(normalizedDistance);
                
                // Mix with original color for custom neon effect
                vec3 finalColor = mix(vColor, neonColor, 0.8);
                
                // Apply simple opacity based on transparency setting
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                
                gl_FragColor = vec4(finalColor, opacity);
            }
        `
    },

    Plasma: {
        vertexShader: `
            varying vec3 vColor;
            uniform float pointSize;
            uniform bool useTransparency;
            varying float vDistance;
            
            void main() {
                vColor = color;
                // Calculate distance from origin
                vDistance = length(position);
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Enhanced point size calculation with subtle variation
                float sizeVariation = 1.0 + 0.1 * sin(position.x * 5.0 + position.y * 3.0 + position.z * 4.0);
                gl_PointSize = pointSize * sizeVariation * (300.0 / -mvPosition.z);
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vDistance;
            uniform bool useTransparency;
            
            // Helper function to map values to plasma colors
            vec3 getPlasmaColor(float value) {
                // Plasma color mapping based on distance
                value = clamp(value, 0.0, 1.0);
                
                // Cool plasma (dark blues to purples)
                if (value < 0.25) {
                    return mix(
                        vec3(0.0, 0.0, 0.5), // Deep blue
                        vec3(0.5, 0.0, 0.8), // Purple
                        value * 4.0
                    );
                }
                // Mid-cool plasma (purples to magentas)
                else if (value < 0.5) {
                    return mix(
                        vec3(0.5, 0.0, 0.8), // Purple
                        vec3(0.9, 0.0, 0.9), // Magenta
                        (value - 0.25) * 4.0
                    );
                }
                // Mid-warm plasma (magentas to oranges)
                else if (value < 0.75) {
                    return mix(
                        vec3(0.9, 0.0, 0.9), // Magenta
                        vec3(1.0, 0.5, 0.0), // Orange
                        (value - 0.5) * 4.0
                    );
                }
                // Hot plasma (oranges to yellows)
                else {
                    return mix(
                        vec3(1.0, 0.5, 0.0), // Orange
                        vec3(1.0, 1.0, 0.0), // Yellow
                        (value - 0.75) * 4.0
                    );
                }
            }

            void main() {
                // Create circular points
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Normalize distance and apply plasma color mapping
                float normalizedDistance = clamp(vDistance * 0.1, 0.0, 1.0);
                vec3 plasmaColor = getPlasmaColor(normalizedDistance);
                
                // Mix with original color for custom plasma effect
                vec3 finalColor = mix(vColor, plasmaColor, 0.8);
                
                // Apply simple opacity based on transparency setting
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                
                gl_FragColor = vec4(finalColor, opacity);
            }
        `
    },

    Thermal: {
        vertexShader: `
            varying vec3 vColor;
            varying float vDistance;
            uniform float pointSize;
            uniform bool useTransparency;

            void main() {
                vColor = color;
                
                // Calculate distance from origin
                vDistance = length(position);
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vDistance;
            uniform bool useTransparency;

            // Helper function to map values to thermal colors
            vec3 getThermalColor(float value) {
                // Thermal color mapping - blue to red spectrum
                value = clamp(value, 0.0, 1.0);
                
                // Cold (blue/purple)
                if (value < 0.25) {
                    return mix(
                        vec3(0.0, 0.0, 0.5), // Dark blue
                        vec3(0.0, 0.0, 1.0), // Blue
                        value * 4.0
                    );
                }
                // Cool (blue/green)
                else if (value < 0.5) {
                    return mix(
                        vec3(0.0, 0.0, 1.0), // Blue
                        vec3(0.0, 1.0, 0.0), // Green
                        (value - 0.25) * 4.0
                    );
                }
                // Warm (green/yellow)
                else if (value < 0.75) {
                    return mix(
                        vec3(0.0, 1.0, 0.0), // Green
                        vec3(1.0, 1.0, 0.0), // Yellow
                        (value - 0.5) * 4.0
                    );
                }
                // Hot (yellow/red)
                else {
                    return mix(
                        vec3(1.0, 1.0, 0.0), // Yellow
                        vec3(1.0, 0.0, 0.0), // Red
                        (value - 0.75) * 4.0
                    );
                }
            }

            void main() {
                // Create circular points with thermal effect
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Normalize distance and apply thermal color mapping
                float normalizedDistance = clamp(vDistance * 0.1, 0.0, 1.0);
                vec3 thermalColor = getThermalColor(normalizedDistance);
                
                // Mix with original color for custom thermal effect
                vec3 finalColor = mix(vColor, thermalColor, 0.8);
                
                // Apply smooth edges or solid points based on transparency setting
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                
                gl_FragColor = vec4(finalColor, opacity);
            }
        `
    },

    Solid: {
        vertexShader: `
            varying vec3 vColor;
            uniform float pointSize;
            uniform vec3 customColor;
            varying float vDistance;

            void main() {
                // Use original vertex color but allow for custom color override
                vColor = color;
                // Calculate distance from origin
                vDistance = length(position);
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vDistance;
            uniform vec3 customColor;

            void main() {
                // Create solid points (no transparency gradient)
                float distance = length(gl_PointCoord - vec2(0.5));
                if (distance > 0.5) {
                    discard;
                }
                
                // Use custom color instead of vertex color
                vec3 finalColor = customColor;
                
                // Solid, uniform color with no transparency
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    },
    
    Distance: {
        vertexShader: `
            varying vec3 vColor;
            uniform float pointSize;
            uniform bool useTransparency;
            varying float vDistance;
            
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Calculate distance from origin (0,0,0)
                vDistance = length(position);
                
                gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vDistance;
            uniform bool useTransparency;

            // Helper function to map distance to color
            vec3 getDistanceColor(float distance) {
                // Mapping distance to a color gradient
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
                vec3 distanceColor = getDistanceColor(vDistance);
                
                // Mix distance color with original color (80% distance-based, 20% original)
                vec3 finalColor = mix(vColor, distanceColor, 0.8);
                
                // Apply smooth edges or solid points based on transparency setting
                float opacity = useTransparency ? smoothstep(0.5, 0.4, distance) : 1.0;
                
                gl_FragColor = vec4(finalColor, opacity);
            }
        `
    }
};

/**
 * WebGL shaders for map / occupancy grid rendering.
 *
 * The texture is a RED (R8) single-channel DataTexture whose normalised value
 * encodes canonical occupancy:
 *   raw byte 0   (0.000) = free space
 *   raw byte 1–253       = cost gradient (low → high)
 *   raw byte 254 (0.996) = lethal / max-cost / occupied
 *   raw byte 255 (1.000) = unknown / no information
 *
 * The fragment shader accepts a `colorMode` uniform:
 *   0 = costmap  (green → yellow → red, unknown = grey)
 *   1 = grayscale (bright free → dark occupied, unknown = mid-grey)
 *   2 = heatmap  (plasma-inspired perceptual gradient)
 */

export const mapGridVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const mapGridFragmentShader = /* glsl */ `
  uniform sampler2D mapTexture;
  uniform float opacity;
  uniform int colorMode;   // 0=costmap 1=grayscale 2=heatmap
  uniform bool showUnknown;

  varying vec2 vUv;

  // ---------------------------------------------------------------------------
  // Plasma colormap (approximation – matches matplotlib "plasma")
  // ---------------------------------------------------------------------------
  vec3 plasma(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.050383, 0.029803, 0.527975);
    vec3 c1 = vec3(0.494877, 0.011990, 0.657865);
    vec3 c2 = vec3(0.798216, 0.280197, 0.469538);
    vec3 c3 = vec3(0.973381, 0.585395, 0.253154);
    vec3 c4 = vec3(0.940015, 0.975158, 0.131326);
    float t4 = t * 4.0;
    if (t4 < 1.0) return mix(c0, c1, t4);
    if (t4 < 2.0) return mix(c1, c2, t4 - 1.0);
    if (t4 < 3.0) return mix(c2, c3, t4 - 2.0);
    return mix(c3, c4, t4 - 3.0);
  }

  // ---------------------------------------------------------------------------
  // Costmap colour: green (free) → yellow → orange → red (lethal)
  // ---------------------------------------------------------------------------
  vec3 costmapColor(float t) {
    t = clamp(t, 0.0, 1.0);
    // t=0 → vivid green, t=0.5 → yellow, t=1 → red
    if (t < 0.5) {
      return mix(vec3(0.05, 0.72, 0.15), vec3(1.0, 0.88, 0.0), t * 2.0);
    }
    return mix(vec3(1.0, 0.88, 0.0), vec3(0.9, 0.05, 0.05), (t - 0.5) * 2.0);
  }

  void main() {
    // r is in [0,1] – multiply by 255 to recover the byte value
    float raw = texture2D(mapTexture, vUv).r * 255.0;

    // -------- unknown cells (byte 255) --------
    if (raw > 254.4) {
      if (!showUnknown) discard;
      gl_FragColor = vec4(0.45, 0.45, 0.45, opacity * 0.45);
      return;
    }

    // -------- free space (byte 0) --------
    if (raw < 0.5) {
      if (colorMode == 1) {
			// grayscale: free = white, more visible
			gl_FragColor = vec4(0.95, 0.95, 0.95, opacity * 0.6);
		} else {
			// costmap / heatmap: render free as light green (more visible in 3D)
			gl_FragColor = vec4(0.7, 0.95, 0.7, opacity * 0.4);

    // -------- cost / obstacle cells (bytes 1–254) --------
    float t = (raw - 1.0) / 253.0; // normalise to [0,1]

    vec3 color;
    if (colorMode == 1) {
      // Grayscale: cost 1 = light grey, cost 254 = black
      float g = 1.0 - t * 0.92;
      color = vec3(g, g, g);
    } else if (colorMode == 2) {
      color = plasma(t);
    } else {
      // default: costmap colourmap
      color = costmapColor(t);
    }

    gl_FragColor = vec4(color, opacity);
  }
`;

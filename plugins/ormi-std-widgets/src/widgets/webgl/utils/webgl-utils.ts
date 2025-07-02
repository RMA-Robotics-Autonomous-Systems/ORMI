
/**
 * Compiles a shader from source
 */
export function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

/**
 * Get vertex shader source code
 */
export function getVertexShaderSource(hasColors: boolean): string {
    return hasColors ? `
        attribute vec3 a_position;
        attribute vec3 a_color;
        uniform mat4 u_projection;
        uniform mat4 u_view;
        uniform float u_pointSize;
        // varying float vDepth;
        varying vec3 vColor;
        void main() {
            vec4 viewPos = u_view * vec4(a_position, 1.0);
            // vDepth = -viewPos.z;
            gl_PointSize = u_pointSize;
            gl_Position = u_projection * viewPos;
            vColor = a_color;
        }
    ` : `
        attribute vec3 a_position;
        uniform mat4 u_projection;
        uniform mat4 u_view;
        uniform float u_pointSize;
        // varying float vDepth;
        void main() {
            vec4 viewPos = u_view * vec4(a_position, 1.0);
            // vDepth = -viewPos.z;
            gl_PointSize = u_pointSize;
            gl_Position = u_projection * viewPos;
        }
    `;
}

/**
 * Get fragment shader source code
 */
export function getFragmentShaderSource(hasColors: boolean): string {
    return hasColors ? `
        precision mediump float;
        // varying float vDepth;
        varying vec3 vColor;
        void main() {
            // float factor = clamp(vDepth / 100.0, 0.0, 1.0);
            gl_FragColor = vec4(vColor , 1.0);
        }
    ` : `
        precision mediump float;
        uniform vec4 u_color;
        // varying float vDepth;
        void main() {
            // float factor = clamp(vDepth / 100.0, 0.0, 1.0);
            gl_FragColor = vec4(u_color.rgb, u_color.a);
        }
    `;
}

/**
 * Creates grid vertices for reference grid
 */
export function createGridVertices(gridSize: number, divisions: number): number[] {
    const gridVertices = [];
    for (let i = -divisions; i <= divisions; i++) {
        const p = i * (gridSize / divisions);
        gridVertices.push(p, 0, -gridSize, p, 0, gridSize);
        gridVertices.push(-gridSize, 0, p, gridSize, 0, p);
    }
    return gridVertices;
}

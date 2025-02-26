
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
 * Creates a perspective matrix
 */
export function perspective(fovy: number, aspect: number, near: number, far: number): number[] {
    const f = 1.0 / Math.tan(fovy / 2);
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0
    ];
}

/**
 * Creates a look-at view matrix
 */
export function lookAt(eye: number[], center: number[], up: number[]): number[] {
    const [ex, ey, ez] = eye;
    const [cx, cy, cz] = center;
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    const zLen = Math.hypot(zx, zy, zz);
    zx /= zLen; zy /= zLen; zz /= zLen;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    const xLen = Math.hypot(xx, xy, xz);
    xx /= xLen; xy /= xLen; xz /= xLen;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    return [
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * ex + xy * ey + xz * ez),
        -(yx * ex + yy * ey + yz * ez),
        -(zx * ex + zy * ey + zz * ez),
        1
    ];
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
        varying float vDepth;
        varying vec3 vColor;
        void main() {
            vec4 viewPos = u_view * vec4(a_position, 1.0);
            vDepth = -viewPos.z;
            gl_PointSize = u_pointSize;
            gl_Position = u_projection * viewPos;
            vColor = a_color;
        }
    ` : `
        attribute vec3 a_position;
        uniform mat4 u_projection;
        uniform mat4 u_view;
        uniform float u_pointSize;
        varying float vDepth;
        void main() {
            vec4 viewPos = u_view * vec4(a_position, 1.0);
            vDepth = -viewPos.z;
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
        varying float vDepth;
        varying vec3 vColor;
        void main() {
            float factor = clamp(vDepth / 100.0, 0.0, 1.0);
            gl_FragColor = vec4(vColor * (1.0 - factor * 0.5), 1.0);
        }
    ` : `
        precision mediump float;
        uniform vec4 u_color;
        varying float vDepth;
        void main() {
            float factor = clamp(vDepth / 100.0, 0.0, 1.0);
            gl_FragColor = vec4(u_color.rgb * (1.0 - factor * 0.5), u_color.a);
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

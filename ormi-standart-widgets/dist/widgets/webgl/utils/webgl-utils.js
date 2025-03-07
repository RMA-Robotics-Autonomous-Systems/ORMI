/**
 * Compiles a shader from source
 */
export function compileShader(gl, source, type) {
    var shader = gl.createShader(type);
    if (!shader)
        return null;
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
export function perspective(fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2);
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
export function lookAt(eye, center, up) {
    var ex = eye[0], ey = eye[1], ez = eye[2];
    var cx = center[0], cy = center[1], cz = center[2];
    var zx = ex - cx, zy = ey - cy, zz = ez - cz;
    var zLen = Math.hypot(zx, zy, zz);
    zx /= zLen;
    zy /= zLen;
    zz /= zLen;
    var xx = up[1] * zz - up[2] * zy;
    var xy = up[2] * zx - up[0] * zz;
    var xz = up[0] * zy - up[1] * zx;
    var xLen = Math.hypot(xx, xy, xz);
    xx /= xLen;
    xy /= xLen;
    xz /= xLen;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
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
export function getVertexShaderSource(hasColors) {
    return hasColors ? "\n        attribute vec3 a_position;\n        attribute vec3 a_color;\n        uniform mat4 u_projection;\n        uniform mat4 u_view;\n        uniform float u_pointSize;\n        // varying float vDepth;\n        varying vec3 vColor;\n        void main() {\n            vec4 viewPos = u_view * vec4(a_position, 1.0);\n            // vDepth = -viewPos.z;\n            gl_PointSize = u_pointSize;\n            gl_Position = u_projection * viewPos;\n            vColor = a_color;\n        }\n    " : "\n        attribute vec3 a_position;\n        uniform mat4 u_projection;\n        uniform mat4 u_view;\n        uniform float u_pointSize;\n        // varying float vDepth;\n        void main() {\n            vec4 viewPos = u_view * vec4(a_position, 1.0);\n            // vDepth = -viewPos.z;\n            gl_PointSize = u_pointSize;\n            gl_Position = u_projection * viewPos;\n        }\n    ";
}
/**
 * Get fragment shader source code
 */
export function getFragmentShaderSource(hasColors) {
    return hasColors ? "\n        precision mediump float;\n        // varying float vDepth;\n        varying vec3 vColor;\n        void main() {\n            // float factor = clamp(vDepth / 100.0, 0.0, 1.0);\n            gl_FragColor = vec4(vColor , 1.0);\n        }\n    " : "\n        precision mediump float;\n        uniform vec4 u_color;\n        // varying float vDepth;\n        void main() {\n            // float factor = clamp(vDepth / 100.0, 0.0, 1.0);\n            gl_FragColor = vec4(u_color.rgb, u_color.a);\n        }\n    ";
}
/**
 * Creates grid vertices for reference grid
 */
export function createGridVertices(gridSize, divisions) {
    var gridVertices = [];
    for (var i = -divisions; i <= divisions; i++) {
        var p = i * (gridSize / divisions);
        gridVertices.push(p, 0, -gridSize, p, 0, gridSize);
        gridVertices.push(-gridSize, 0, p, gridSize, 0, p);
    }
    return gridVertices;
}

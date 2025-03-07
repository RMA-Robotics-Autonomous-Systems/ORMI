/**
 * Compiles a shader from source
 */
export declare function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null;
/**
 * Creates a perspective matrix
 */
export declare function perspective(fovy: number, aspect: number, near: number, far: number): number[];
/**
 * Creates a look-at view matrix
 */
export declare function lookAt(eye: number[], center: number[], up: number[]): number[];
/**
 * Get vertex shader source code
 */
export declare function getVertexShaderSource(hasColors: boolean): string;
/**
 * Get fragment shader source code
 */
export declare function getFragmentShaderSource(hasColors: boolean): string;
/**
 * Creates grid vertices for reference grid
 */
export declare function createGridVertices(gridSize: number, divisions: number): number[];

import React, { useRef, useEffect } from 'react';
import {
    RotationState,
    WebGLRefs
} from '../types/points-cloud-types';
import {
    compileShader,
    perspective,
    lookAt,
    getVertexShaderSource,
    getFragmentShaderSource,
    createGridVertices
} from '../utils/webgl-utils';
import { PointsCloud } from '@/core/types/common';

const POINTS_SIZE = 5.0;

export default function PointsCloudWebGL({ points, colors }: PointsCloud) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rotationRef = useRef<RotationState>({ angleX: 0, angleY: 0, dragging: false, lastX: 0, lastY: 0, distance: 5 });
    const animationFrameRef = useRef<number | null>(null);
    const glRef = useRef<WebGLRefs>({
        gl: null,
        program: null,
        positionBuffer: null,
        colorBuffer: null,
        gridBuffer: null
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl');
        if (!gl) return;
        glRef.current.gl = gl;

        const resizeCanvas = () => {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const hasColors = colors && colors.length >= points.length || false;

        const vertexShaderSource = getVertexShaderSource(hasColors);
        const fragmentShaderSource = getFragmentShaderSource(hasColors);

        const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
        if (!vertexShader || !fragmentShader) return;

        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return;
        }
        glRef.current.program = program;

        gl.useProgram(program);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.flatMap(pt => [pt.x, pt.y, pt.z])), gl.STATIC_DRAW);
        glRef.current.positionBuffer = positionBuffer;

        const gridVertices = createGridVertices(10, 10);
        const gridBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridVertices), gl.STATIC_DRAW);
        glRef.current.gridBuffer = gridBuffer;

        const aPositionLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(aPositionLoc);
        gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);

        const uProjectionLoc = gl.getUniformLocation(program, 'u_projection');
        const uViewLoc = gl.getUniformLocation(program, 'u_view');
        const uPointSizeLoc = gl.getUniformLocation(program, 'u_pointSize');
        const uColorLoc = gl.getUniformLocation(program, 'u_color');

        canvas.tabIndex = 0;

        const onPointerDown = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            rotationRef.current.dragging = true;
            rotationRef.current.lastX = e.clientX - rect.left;
            rotationRef.current.lastY = e.clientY - rect.top;
        };

        const onPointerMove = (e: PointerEvent) => {
            if (!rotationRef.current.dragging) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const deltaX = x - rotationRef.current.lastX;
            const deltaY = y - rotationRef.current.lastY;
            rotationRef.current.angleY -= deltaX * 0.005;
            rotationRef.current.angleX += deltaY * 0.005;
            rotationRef.current.lastX = x;
            rotationRef.current.lastY = y;
        };

        const endDragging = () => { rotationRef.current.dragging = false; };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', endDragging);
        canvas.addEventListener('pointercancel', endDragging);

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            rotationRef.current.distance = Math.max(1, rotationRef.current.distance + e.deltaY * 0.01);
        };
        canvas.addEventListener('wheel', onWheel);

        let colorBuffer: WebGLBuffer | null = null;
        if (hasColors) {
            colorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            const flattenedColors = new Float32Array(colors!.flatMap(c => [c.r, c.g, c.b]));
            gl.bufferData(gl.ARRAY_BUFFER, flattenedColors, gl.STATIC_DRAW);
            glRef.current.colorBuffer = colorBuffer;
        }

        function render() {
            if (!canvas || !gl) return;

            gl.viewport(0, 0, canvas.width, canvas.height);
            const aspect = canvas.width / canvas.height;
            const proj = perspective((75 * Math.PI) / 180, aspect, 0.1, 100);
            const camDistance = rotationRef.current.distance;
            const eye = [
                camDistance * Math.sin(rotationRef.current.angleY) * Math.cos(rotationRef.current.angleX),
                camDistance * Math.sin(rotationRef.current.angleX),
                camDistance * Math.cos(rotationRef.current.angleY) * Math.cos(rotationRef.current.angleX)
            ];
            const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);

            if (uProjectionLoc) {
                gl.uniformMatrix4fv(uProjectionLoc, false, new Float32Array(proj));
            }
            if (uViewLoc) {
                gl.uniformMatrix4fv(uViewLoc, false, new Float32Array(view));
            }

            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);

            if (hasColors) {
                const aColorLoc = gl.getAttribLocation(program, 'a_color');
                gl.disableVertexAttribArray(aColorLoc);
                gl.vertexAttrib3f(aColorLoc, 0.5, 0.5, 0.5);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, glRef.current.gridBuffer);
            gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
            if (uPointSizeLoc) { gl.uniform1f(uPointSizeLoc, 1.0); }
            if (uColorLoc) { gl.uniform4f(uColorLoc, 0.5, 0.5, 0.5, 1.0); }
            gl.drawArrays(gl.LINES, 0, gridVertices.length / 3);

            if (hasColors) {
                const aColorLoc = gl.getAttribLocation(program, 'a_color');
                gl.enableVertexAttribArray(aColorLoc);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, glRef.current.positionBuffer);
            gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
            if (hasColors && glRef.current.colorBuffer) {
                const aColorLoc = gl.getAttribLocation(program, 'a_color');
                gl.bindBuffer(gl.ARRAY_BUFFER, glRef.current.colorBuffer);
                gl.enableVertexAttribArray(aColorLoc);
                gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 0, 0);
            }
            if (uPointSizeLoc) {
                gl.uniform1f(uPointSizeLoc, POINTS_SIZE);
            }
            if (!hasColors && uColorLoc) {
                gl.uniform4f(uColorLoc, 1.0, 1.0, 1.0, 1.0);
            }
            gl.drawArrays(gl.POINTS, 0, points.length);

            animationFrameRef.current = requestAnimationFrame(render);
        }
        animationFrameRef.current = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', endDragging);
            canvas.removeEventListener('pointercancel', endDragging);
            canvas.removeEventListener('wheel', onWheel);

            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }

            if (glRef.current.colorBuffer) {
                gl.deleteBuffer(glRef.current.colorBuffer);
            }
            if (glRef.current.positionBuffer) {
                gl.deleteBuffer(glRef.current.positionBuffer);
            }
            if (glRef.current.gridBuffer) {
                gl.deleteBuffer(glRef.current.gridBuffer);
            }
            if (glRef.current.program) {
                gl.deleteProgram(glRef.current.program);
            }
            if (vertexShader) {
                gl.deleteShader(vertexShader);
            }
            if (fragmentShader) {
                gl.deleteShader(fragmentShader);
            }
        };
    }, [colors, points]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

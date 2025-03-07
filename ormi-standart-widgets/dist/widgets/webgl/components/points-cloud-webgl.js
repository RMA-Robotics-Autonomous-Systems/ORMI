import { jsx as _jsx } from "react/jsx-runtime";
import { useRef, useEffect } from 'react';
import { compileShader, perspective, lookAt, getVertexShaderSource, getFragmentShaderSource, createGridVertices } from '../utils/webgl-utils';
var POINTS_SIZE = 5.0;
export default function PointsCloudWebGL(_a) {
    var points = _a.points, colors = _a.colors;
    var canvasRef = useRef(null);
    var rotationRef = useRef({ angleX: 0, angleY: 0, dragging: false, lastX: 0, lastY: 0, distance: 5 });
    var animationFrameRef = useRef(null);
    var glRef = useRef({
        gl: null,
        program: null,
        positionBuffer: null,
        colorBuffer: null,
        gridBuffer: null
    });
    useEffect(function () {
        var canvas = canvasRef.current;
        if (!canvas)
            return;
        var gl = canvas.getContext('webgl');
        if (!gl)
            return;
        glRef.current.gl = gl;
        var resizeCanvas = function () {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        var hasColors = colors && colors.length >= points.length || false;
        var vertexShaderSource = getVertexShaderSource(hasColors);
        var fragmentShaderSource = getFragmentShaderSource(hasColors);
        var vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
        var fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
        if (!vertexShader || !fragmentShader)
            return;
        var program = gl.createProgram();
        if (!program)
            return;
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return;
        }
        glRef.current.program = program;
        gl.useProgram(program);
        var positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.flatMap(function (pt) { return [pt.x, pt.y, pt.z]; })), gl.STATIC_DRAW);
        glRef.current.positionBuffer = positionBuffer;
        var gridVertices = createGridVertices(10, 10);
        var gridBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridVertices), gl.STATIC_DRAW);
        glRef.current.gridBuffer = gridBuffer;
        var aPositionLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(aPositionLoc);
        gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
        var uProjectionLoc = gl.getUniformLocation(program, 'u_projection');
        var uViewLoc = gl.getUniformLocation(program, 'u_view');
        var uPointSizeLoc = gl.getUniformLocation(program, 'u_pointSize');
        var uColorLoc = gl.getUniformLocation(program, 'u_color');
        canvas.tabIndex = 0;
        var onPointerDown = function (e) {
            var rect = canvas.getBoundingClientRect();
            rotationRef.current.dragging = true;
            rotationRef.current.lastX = e.clientX - rect.left;
            rotationRef.current.lastY = e.clientY - rect.top;
        };
        var onPointerMove = function (e) {
            if (!rotationRef.current.dragging)
                return;
            var rect = canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var deltaX = x - rotationRef.current.lastX;
            var deltaY = y - rotationRef.current.lastY;
            rotationRef.current.angleY -= deltaX * 0.005;
            rotationRef.current.angleX += deltaY * 0.005;
            rotationRef.current.lastX = x;
            rotationRef.current.lastY = y;
        };
        var endDragging = function () { rotationRef.current.dragging = false; };
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', endDragging);
        canvas.addEventListener('pointercancel', endDragging);
        var onWheel = function (e) {
            e.preventDefault();
            rotationRef.current.distance = Math.max(1, rotationRef.current.distance + e.deltaY * 0.01);
        };
        canvas.addEventListener('wheel', onWheel);
        var colorBuffer = null;
        if (hasColors) {
            colorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            var flattenedColors = new Float32Array(colors.flatMap(function (c) { return [c.r, c.g, c.b]; }));
            gl.bufferData(gl.ARRAY_BUFFER, flattenedColors, gl.STATIC_DRAW);
            glRef.current.colorBuffer = colorBuffer;
        }
        function render() {
            if (!canvas || !gl)
                return;
            gl.viewport(0, 0, canvas.width, canvas.height);
            var aspect = canvas.width / canvas.height;
            var proj = perspective((75 * Math.PI) / 180, aspect, 0.1, 100);
            var camDistance = rotationRef.current.distance;
            var eye = [
                camDistance * Math.sin(rotationRef.current.angleY) * Math.cos(rotationRef.current.angleX),
                camDistance * Math.sin(rotationRef.current.angleX),
                camDistance * Math.cos(rotationRef.current.angleY) * Math.cos(rotationRef.current.angleX)
            ];
            var view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
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
                var aColorLoc = gl.getAttribLocation(program, 'a_color');
                gl.disableVertexAttribArray(aColorLoc);
                gl.vertexAttrib3f(aColorLoc, 0.5, 0.5, 0.5);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, glRef.current.gridBuffer);
            gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
            if (uPointSizeLoc) {
                gl.uniform1f(uPointSizeLoc, 1.0);
            }
            if (uColorLoc) {
                gl.uniform4f(uColorLoc, 0.5, 0.5, 0.5, 1.0);
            }
            gl.drawArrays(gl.LINES, 0, gridVertices.length / 3);
            if (hasColors) {
                var aColorLoc = gl.getAttribLocation(program, 'a_color');
                gl.enableVertexAttribArray(aColorLoc);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, glRef.current.positionBuffer);
            gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
            if (hasColors && glRef.current.colorBuffer) {
                var aColorLoc = gl.getAttribLocation(program, 'a_color');
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
        return function () {
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
    return _jsx("canvas", { ref: canvasRef, style: { width: '100%', height: '100%' } });
}

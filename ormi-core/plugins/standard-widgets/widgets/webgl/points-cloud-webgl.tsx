import React, { useRef, useEffect } from 'react';
import { LocalDataSourcesProvider, useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";
import { DatasourceTopic, DatasourceTopicFilter, SelectedTopic } from "@/core/datasources/datasource-interface";
import { AsyncTopicControlType } from "@/core/jsonforms/controls/topic-selector/topic-selector";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { Color, PointsCloud } from "@/core/types/common";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { CircleAlertIcon } from "lucide-react";

interface PointsCloudProps {
    title: string;
    topic: SelectedTopic;
    maxPoints?: number;
}

function PointsCloudWebGL({ pointsArray, colors }: { pointsArray: { x: number; y: number; z: number }[]; colors?: Color[] }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rotationRef = useRef({ angleX: 0, angleY: 0, dragging: false, lastX: 0, lastY: 0, distance: 5 });
    const animationFrameRef = useRef<number | null>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const positionBufferRef = useRef<WebGLBuffer | null>(null);
    const colorBufferRef = useRef<WebGLBuffer | null>(null);
    const gridBufferRef = useRef<WebGLBuffer | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl');
        if (!gl) return;
        glRef.current = gl;

        const resizeCanvas = () => {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const hasColors = colors && colors.length >= pointsArray.length;

        const vertexShaderSource = hasColors ? `
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

        const fragmentShaderSource = hasColors ? `
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

        function compileShader(source: string, type: number) {
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

        const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
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
        programRef.current = program;

        gl.useProgram(program);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pointsArray.flatMap(pt => [pt.x, pt.y, pt.z])), gl.STATIC_DRAW);
        positionBufferRef.current = positionBuffer;

        const gridSize = 10;
        const divisions = 10;
        const gridVertices = [];
        for (let i = -divisions; i <= divisions; i++) {
            const p = i * (gridSize / divisions);
            gridVertices.push(p, 0, -gridSize, p, 0, gridSize);
            gridVertices.push(-gridSize, 0, p, gridSize, 0, p);
        }
        const gridBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridVertices), gl.STATIC_DRAW);
        gridBufferRef.current = gridBuffer;

        const aPositionLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(aPositionLoc);
        gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);

        const uProjectionLoc = gl.getUniformLocation(program, 'u_projection');
        const uViewLoc = gl.getUniformLocation(program, 'u_view');
        const uPointSizeLoc = gl.getUniformLocation(program, 'u_pointSize');
        const uColorLoc = gl.getUniformLocation(program, 'u_color');

        function perspective(fovy: number, aspect: number, near: number, far: number): number[] {
            const f = 1.0 / Math.tan(fovy / 2);
            return [
                f / aspect, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (far + near) / (near - far), -1,
                0, 0, (2 * far * near) / (near - far), 0
            ];
        }
        function lookAt(eye: number[], center: number[], up: number[]): number[] {
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
            colorBufferRef.current = colorBuffer;
        }

        function render() {
            if (!canvas) return;
            if (!gl) return;

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
            gl.bindBuffer(gl.ARRAY_BUFFER, gridBufferRef.current);
            gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
            if (uPointSizeLoc) { gl.uniform1f(uPointSizeLoc, 1.0); }
            if (uColorLoc) { gl.uniform4f(uColorLoc, 0.5, 0.5, 0.5, 1.0); }
            gl.drawArrays(gl.LINES, 0, gridVertices.length / 3);
            if (hasColors) {
                const aColorLoc = gl.getAttribLocation(program, 'a_color');
                gl.enableVertexAttribArray(aColorLoc);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
            gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
            if (hasColors && colorBufferRef.current) {
                const aColorLoc = gl.getAttribLocation(program, 'a_color');
                gl.bindBuffer(gl.ARRAY_BUFFER, colorBufferRef.current);
                gl.enableVertexAttribArray(aColorLoc);
                gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 0, 0);
            }
            const baseSize = 1.0;
            const computedPointSize = baseSize * (5.0 / rotationRef.current.distance);
            if (uPointSizeLoc) {
                gl.uniform1f(uPointSizeLoc, computedPointSize);
            }
            if (!hasColors && uColorLoc) {
                gl.uniform4f(uColorLoc, 1.0, 1.0, 1.0, 1.0);
            }
            gl.drawArrays(gl.POINTS, 0, pointsArray.length);

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

            if (colorBufferRef.current) {
                gl.deleteBuffer(colorBufferRef.current);
            }
            if (positionBufferRef.current) {
                gl.deleteBuffer(positionBufferRef.current);
            }
            if (gridBufferRef.current) {
                gl.deleteBuffer(gridBufferRef.current);
            }
            if (programRef.current) {
                gl.deleteProgram(programRef.current);
            }
            if (vertexShader) {
                gl.deleteShader(vertexShader);
            }
            if (fragmentShader) {
                gl.deleteShader(fragmentShader);
            }
        };
    }, [colors, pointsArray]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

function PointsCloudCompWebGL(props: PointsCloudProps) {
    const maxPoints = props.maxPoints ?? 100;
    const { sources } = useLocalDataSource();
    const sources_keys = Array.from(sources.keys());
    const value = sources_keys.length > 0 ? sources.get(sources_keys[sources_keys.length - 1]) : { data: [] };
    const last_value: PointsCloud & { colors?: Color[] } = (value?.data?.[0] as PointsCloud) || { points: [] };

    const rawPoints = (last_value.points && last_value.points.length)
        ? last_value.points
        : [];
    const pointsArray = rawPoints.slice(0, maxPoints);
    const pointsColors = last_value.colors && last_value.colors.length >= pointsArray.length
        ? last_value.colors.slice(0, pointsArray.length)
        : undefined;

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <PointsCloudWebGL pointsArray={pointsArray} colors={pointsColors} />
        </div>
    );
}

export function PointsCloudDefinition() {
    const pluginsManager = usePluginsManager();
    return {
        id: 'std-points-cloud-webgl',
        name: 'Points Cloud WebGL',
        description: 'Display a points cloud using raw WebGL',
        titleProp: 'title',
        icon: <CircleAlertIcon />,
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', title: 'Title' },
                topic: { type: 'object', title: 'Topic' },
                maxPoints: { type: 'number', title: 'Max Points', minimum: 0 }
            },
            required: ['title']
        },
        uischema: {
            type: "VerticalLayout",
            elements: [
                { type: "Control", scope: "#/properties/title" } as ControlElement,
                {
                    type: "TopicSelect", scope: "#/properties/topic", options: {
                        asyncFunction: async () => {
                            return await pluginsManager.applyFilterAsync<DatasourceTopic[]>(
                                PluginsHooks.AVAILABLE_TOPICS,
                                [],
                                new DatasourceTopicFilter({ type: /PointsCloud/ })
                            );
                        },
                        buffer: 1
                    }
                } as AsyncTopicControlType,
                { type: "Control", scope: "#/properties/maxPoints" } as ControlElement
            ]
        } as VerticalLayout,
        data: {
            title: 'Status',
            use3D: false,
            maxPoints: 100
        },
        Component: (data: PointsCloudProps) => (
            <LocalDataSourcesProvider SelectedTopics={[data.topic]} buffersSize={1}>
                <PointsCloudCompWebGL {...data} />
            </LocalDataSourcesProvider>
        )
    };
}

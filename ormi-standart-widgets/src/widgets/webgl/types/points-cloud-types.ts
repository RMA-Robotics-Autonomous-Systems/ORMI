import { SelectedTopic } from "ormi-core/datasources";

export interface PointsCloudProps {
    title: string;
    topic: SelectedTopic;
    maxPoints?: number;
}

export interface RotationState {
    angleX: number;
    angleY: number;
    dragging: boolean;
    lastX: number;
    lastY: number;
    distance: number;
}

export interface WebGLRefs {
    gl: WebGLRenderingContext | null;
    program: WebGLProgram | null;
    positionBuffer: WebGLBuffer | null;
    colorBuffer: WebGLBuffer | null;
    gridBuffer: WebGLBuffer | null;
}

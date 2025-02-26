import { SelectedTopic } from "@/core/datasources/datasource-interface";

export interface PointsCloudProps {
    title: string;
    topic: SelectedTopic;
    maxPoints?: number;
}

export interface Point3D {
    x: number;
    y: number;
    z: number;
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

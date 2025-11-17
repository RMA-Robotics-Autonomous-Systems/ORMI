import { ta } from "date-fns/locale";

export type Vector2 = {
    x: number;
    y: number;
};

export type Vector3 = Vector2 & {
    z: number;
};

export type Vector4 = Vector3 & {
    w: number;
};

export type Quaternion = {
    x: number;
    y: number;
    z: number;
    w: number;
};

export type Transform = {
    position: Vector4;
    rotation: Quaternion;
};

export type TransformTree = {
    id: string;
    parentId: string;
    transform: Transform;
    children: Map<string, TransformTree>;
};

export type Color = {
    r: number;
    g: number;
    b: number;
    a: number;
};

export type PointsCloud = {
    points: Vector3[];
    colors?: Color[];
};

export type Image = {
    width: number;
    height: number;
    data: ImageData;
};

export type Pose = {
    position: Vector3;
    orientation: Quaternion;
};

export type PoseStamped = Pose & {
    timestamp: number; // in seconds
};

export type Path = {
    poses: PoseStamped[];
    timestamp: number; // path timestamp in seconds
};

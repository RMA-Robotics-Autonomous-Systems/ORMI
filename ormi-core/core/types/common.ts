export type Vector2 = {
    x: number;
    y: number;
}

export type Vector3 = Vector2 & {
    z: number;
}

export type Quaternion = {
    x: number;
    y: number;
    z: number;
    w: number;
}

export type Transform = {
    position: Vector3;
    rotation: Quaternion;
}

export type Color = {
    r: number;
    g: number;
    b: number;
    a: number;
}


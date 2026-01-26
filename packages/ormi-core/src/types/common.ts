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

/**
 * Coordinate system convention identifiers
 *
 * - ROS: ROS REP-103: X forward, Y left, Z up (right-handed)
 * - THREE: Three.js: X right, Y up, Z towards viewer (right-handed)
 * - ENU: East-North-Up: X east, Y north, Z up (right-handed)
 * - NED: North-East-Down: X north, Y east, Z down (right-handed)
 * - NWU: North-West-Up: X north, Y west, Z up (right-handed)
 * - CUSTOM: User-defined custom convention
 */
export type CoordinateConvention =
    | "ROS"
    | "THREE"
    | "ENU"
    | "NED"
    | "NWU"
    | "CUSTOM";

/**
 * Transform between coordinate frames
 *
 * @property position - Translation vector (x, y, z, w where w is typically 1 for points, 0 for directions)
 * @property rotation - Rotation quaternion
 * @property convention - The coordinate system convention this transform is expressed in (defaults to 'ROS' for backwards compatibility)
 */
export type Transform = {
    position: Vector4;
    rotation: Quaternion;
    /**
     * Coordinate convention this transform is expressed in.
     * Defaults to 'ROS' for backwards compatibility with existing data.
     */
    convention?: CoordinateConvention;
};

/**
 * Transform tree node representing a coordinate frame hierarchy
 *
 * @property id - Unique identifier for this frame (e.g., "base_link", "camera")
 * @property parentId - ID of the parent frame (empty string for root frames)
 * @property transform - Transform from parent frame to this frame
 * @property children - Child frames in the hierarchy
 * @property convention - Coordinate convention for the entire tree (inherited by children if not specified)
 */
export type TransformTree = {
    id: string;
    parentId: string;
    transform: Transform;
    children: Map<string, TransformTree>;
    /**
     * Default coordinate convention for this tree.
     * Individual transforms can override this with their own convention field.
     */
    convention?: CoordinateConvention;
};

export type Color = {
    r: number;
    g: number;
    b: number;
    a: number;
};

export type PointsCloud = {
    points: Vector3[] | Float32Array | number[];
    colors?: Color[] | Float32Array | number[];
    intensities?: number[] | Float32Array;
    /** Coordinate convention the points are expressed in */
    convention?: CoordinateConvention;
};

export type Image = {
    width: number;
    height: number;
    data: ImageData;
};

export type Pose = {
    position: Vector3;
    orientation: Quaternion;
    /** Coordinate convention this pose is expressed in */
    convention?: CoordinateConvention;
};

export type PoseStamped = Pose & {
    timestamp: number; // in seconds
};

export type Path = {
    poses: PoseStamped[];
    timestamp: number; // path timestamp in seconds
    /** Coordinate convention the path is expressed in */
    convention?: CoordinateConvention;
};

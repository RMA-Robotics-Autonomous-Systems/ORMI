/** 2D vector with x and y components. */
export type Vector2 = {
	x: number;
	y: number;
};

/** 3D vector with x, y, and z components. */
export type Vector3 = Vector2 & {
	z: number;
};

/** 4D vector with x, y, z, and w components. */
export type Vector4 = Vector3 & {
	w: number;
};

/** Quaternion rotation. */
export type Quaternion = {
	x: number;
	y: number;
	z: number;
	w: number;
};

/**
 * Supported coordinate system conventions.
 *
 * ROS: REP-103, THREE: Three.js, ENU/NED/NWU: navigation frames, CUSTOM: user-defined.
 */
export type CoordinateConvention =
	| "ROS"
	| "THREE"
	| "ENU"
	| "NED"
	| "NWU"
	| "CUSTOM";

/**
 * Transform between coordinate frames.
 */
export type Transform = {
	/** Translation vector (x, y, z, w where w is typically 1 for points, 0 for directions). */
	position: Vector4;
	/** Rotation quaternion. */
	rotation: Quaternion;
	/**
	 * Coordinate convention this transform is expressed in.
	 * Defaults to "THREE".
	 */
	convention?: CoordinateConvention;
};

/**
 * Transform tree node representing a coordinate frame hierarchy.
 */
export type TransformTree = {
	/** Unique identifier for this frame (e.g., "base_link", "camera"). */
	id: string;
	/** ID of the parent frame (empty string for root frames). */
	parentId: string;
	/** Transform from parent frame to this frame. */
	transform: Transform;
	/** Child frames in the hierarchy. */
	children: Map<string, TransformTree>;
	/**
	 * Default coordinate convention for this tree.
	 * Individual transforms can override this with their own convention field.
	 */
	convention?: CoordinateConvention;
};

/** RGBA color with components in 0..1 range. */
export type Color = {
	r: number;
	g: number;
	b: number;
	a: number;
};

/** Point cloud payload with packed buffers. */
export type PointsCloud = {
	/** Packed positions: [x0, y0, z0, x1, y1, z1, ...] */
	points: Float32Array;
	/** Packed colors: [r0, g0, b0, r1, g1, b1, ...] */
	colors?: Float32Array;
	/** Per-point intensity values (0..1) */
	intensities?: Float32Array;
	/** Coordinate convention the points are expressed in */
	convention?: CoordinateConvention;
};

/** Image payload backed by ImageBitmap. */
export type Image = ImageBitmap;

/** Pose with position and orientation. */
export type Pose = {
	position: Vector3;
	orientation: Quaternion;
	/** Coordinate convention this pose is expressed in */
	convention?: CoordinateConvention;
};

/** Pose with timestamp in seconds. */
export type PoseStamped = Pose & {
	/** Timestamp in seconds. */
	timestamp: number;
};

/** Path of poses with timestamp. */
export type Path = {
	poses: PoseStamped[];
	/** Path timestamp in seconds. */
	timestamp: number;
	/** Coordinate convention the path is expressed in */
	convention?: CoordinateConvention;
};

/**
 * Map / occupancy grid payload.
 *
 * Unified representation for `nav_msgs/msg/OccupancyGrid` and `nav2_msgs/msg/Costmap`.
 * The origin pose points to cell (0,0), which is the bottom-left corner of the grid
 * (row-major storage, rows along Y, columns along X).
 *
 * Cell value encoding (canonical):
 * - 0   = free space
 * - 1–253 = cost gradient (1 = low cost, 253 = near-lethal)
 * - 254 = lethal / fully occupied / maximum cost
 * - 255 = unknown / no information
 */
export type MapGrid = {
	/** Number of columns (cells along the grid's local +X axis). */
	width: number;
	/** Number of rows (cells along the grid's local +Y axis). */
	height: number;
	/** Physical size of one cell in metres. */
	resolution: number;
	/**
	 * Pose of cell (0,0) — the bottom-left corner — expressed in `frameId`.
	 * The orientation describes the grid's own axes relative to the source frame.
	 */
	origin: Pose;
	/**
	 * Flat, row-major cell values: row 0 is the bottom row (Y=0),
	 * within each row columns run in the +X direction.
	 * Values are encoded as described in the type-level documentation.
	 */
	data: Uint8Array;
	/** Coordinate frame identifier from the source message header (e.g. `"map"`). */
	frameId: string;
	/** Message timestamp in seconds. */
	timestamp: number;
	/** Coordinate convention of the origin pose. Defaults to `"ROS"`. */
	convention?: CoordinateConvention;
};

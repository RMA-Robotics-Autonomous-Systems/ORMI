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

/** Timestamp in seconds (float), derived from a message `header.stamp` `{sec, nsec}`. */
export type TransformStamp = number;

/**
 * A single coordinate-frame edge: a child frame expressed in its parent.
 *
 * This is the authoritative unit of transform state — the transform table is a flat map of
 * these edges, keyed by namespaced child frame id.
 */
export type TransformEdge = {
	/** Namespaced child frame id (`${source}::${rawFrameId}`) — the key in a {@link TransformTable}. */
	frameId: string;
	/** Raw frame id exactly as published (for display). */
	rawFrameId: string;
	/** Parent frame id. */
	parentId: string;
	/** Datasource id that published this edge. */
	source: string;
	/** Child-in-parent transform, already converted to THREE at the datasource boundary. */
	transform: Transform;
	/** Last header stamp in seconds; `undefined` if the source omits stamps. */
	stamp?: TransformStamp;
	/** Monotonic clock (ms) when last received — drives staleness UI. */
	receivedAt: number;
	/** From `/tf_static` vs `/tf`. Static edges never go stale. */
	isStatic: boolean;
	/** True iff this edge's parent was itself observed as a child edge somewhere. */
	parentObserved: boolean;
};

/**
 * Authoritative flat transform state: a map from a namespaced (child) frame id to its edge.
 * Higher-level views (world poses, chains, diagnostics) are derived from this at read time.
 */
export type TransformTable = Map<string, TransformEdge>;

/**
 * A frame resolved to world space, for rendering.
 *
 * Positions/rotations are plain math types (THREE-free) — consumers that need THREE objects
 * construct them at the boundary.
 */
export type WorldFrame = {
	/** Table key (child frame id). */
	frameId: string;
	/** Frame id as published (for display). */
	rawFrameId: string;
	/** Accumulated world-space position of the frame origin. */
	worldPosition: Vector3;
	/** Accumulated world-space orientation. */
	worldRotation: Quaternion;
	/** World position of the parent frame, or `null` for a root. */
	parentWorldPosition: Vector3 | null;
	/** Depth from the resolved root (0 at the root, +1 per hop). */
	depth: number;
	/** Whether this frame is stale (no recent update; static frames are never stale). */
	stale: boolean;
	/**
	 * True for a virtual root frame — a frame only ever observed as a parent (e.g. a fixed
	 * `map`), emitted at the tree origin with an assumed identity pose. Real edges are never
	 * inferred.
	 */
	inferred: boolean;
};

/** Per-frame diagnostic info for the transform-tree UI. */
export type FrameDiagnostic = {
	frameId: string;
	rawFrameId: string;
	parentId: string;
	/** Datasource that published the frame. */
	source: string;
	/** Depth from the resolved root. */
	depth: number;
	stale: boolean;
	inferred: boolean;
	isStatic: boolean;
	/** Last header stamp in seconds, if provided. */
	stamp?: TransformStamp;
	/** Monotonic clock (ms) when last received. */
	receivedAt: number;
	/** Milliseconds since last received (`now - receivedAt`). */
	ageMs: number;
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

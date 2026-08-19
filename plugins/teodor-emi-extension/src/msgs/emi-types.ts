/**
 * Decoded shapes of the EMI messages.
 *
 * These are the *raw* ROS 2 shapes, not converted webapp types. That is
 * deliberate and it is what makes a recording and a live robot interchangeable:
 * `emi_msgs/*` has no entry in the foxglove converter registry, so the live
 * datasource falls through to the raw parsed message — which is why the
 * existing map marker reads `emi_array[i].gnss.latitude` directly. The replay
 * datasource publishes the same shape, so nothing downstream can tell them
 * apart.
 */

/** `builtin_interfaces/Time`. */
export interface RosTime {
	sec: number;
	nanosec: number;
}

/** `std_msgs/Header`. */
export interface RosHeader {
	stamp: RosTime;
	frame_id: string;
}

/** `sensor_msgs/NavSatFix`. */
export interface NavSatFix {
	header: RosHeader;
	status: { status: number; service: number };
	latitude: number;
	longitude: number;
	altitude: number;
	/** Row-major 3×3; `[0]` is the east variance, so sigma is its square root. */
	position_covariance: Float64Array | number[];
	position_covariance_type: number;
}

/** `geometry_msgs/Vector3`. */
export interface Vector3 {
	x: number;
	y: number;
	z: number;
}

/** `geometry_msgs/Quaternion`. */
export interface Quaternion {
	x: number;
	y: number;
	z: number;
	w: number;
}

/** `geometry_msgs/Transform`. */
export interface Transform {
	translation: Vector3;
	rotation: Quaternion;
}

/** `geometry_msgs/QuaternionStamped`. */
export interface QuaternionStamped {
	header: RosHeader;
	quaternion: Quaternion;
}

/** `emi_msgs/EMICoil` — a coil on the raw topics, carrying its own geometry. */
export interface EMICoil {
	id: number;
	static_transform: Transform;
	alert: boolean;
	raw1: number;
	raw2: number;
}

/** `emi_msgs/msg/EMI`. */
export interface EMIMessage {
	header: RosHeader;
	rtk_pose: NavSatFix;
	atr_threshold: number;
	emi_array: EMICoil[];
}

/** `emi_msgs/EMICoilGnss` — a coil on the georeferenced topics. */
export interface EMICoilGnss {
	id: number;
	gnss: NavSatFix;
	alert: boolean;
	raw1: number;
	raw2: number;
	/**
	 * Robot heading in ENU radians when this coil was placed — the same rotation
	 * the georeference node applied to the coil offset before turning it into a
	 * lat/lon.
	 *
	 * Optional because the recordings predate it; see the two layouts in
	 * `schemas.ts`. When present it is the authoritative heading for chain
	 * association, since it is the one that actually produced these positions.
	 *
	 * Caveat inherited from the robot: this yaw is the orientation most recently
	 * received at RELEASE time, while the position beside it is the fix
	 * interpolated at PEAK time. Driving straight that is centimetres; through a
	 * turn it is more.
	 */
	yaw?: number;
}

/** `emi_msgs/msg/EMIGnss`. */
export interface EMIGnssMessage {
	header: RosHeader;
	atr_threshold: number;
	emi_array: EMICoilGnss[];
}

/** `emi_msgs/msg/EMITarget`. */
export interface EMITargetMessage {
	id: number;
	gnss: NavSatFix;
	centroid_latitude: number;
	centroid_longitude: number;
	best_amplitude: number;
	best_coil: number;
	atr_threshold: number;
	first_seen: RosTime;
	last_seen: RosTime;
	n_detections: number;
	coils: Uint8Array | number[];
	spread: number;
	/** `"fixed+gate"` or `"fixed+chain"` — which tracker wrote this. */
	source: string;
	gate_used: number;
	sigma_at_creation: number;
	degraded_fix: boolean;
}

/** `emi_msgs/msg/EMITargetList`. */
export interface EMITargetListMessage {
	header: RosHeader;
	n_targets: number;
	targets: EMITargetMessage[];
}

/** Seconds from a ROS stamp. */
export function stampSeconds(stamp: RosTime): number {
	return stamp.sec + stamp.nanosec * 1e-9;
}

/**
 * Horizontal sigma of a fix, metres.
 *
 * `sqrt(position_covariance[0])`, matching what the tracker gates on and what
 * `extract_bag.py` reads. Returns NaN only when the covariance is absent or
 * negative — `position_covariance_type` is deliberately NOT consulted, because
 * the reference does not consult it either. The consequence is worth knowing:
 * an UNKNOWN covariance that is zero-filled reads as sigma 0, which `gateFor`
 * treats as a perfect fix and hands the full gate.
 *
 * @param fix - The fix.
 * @returns Horizontal sigma in metres, or NaN.
 */
export function fixSigma(fix: NavSatFix): number {
	const cov = fix.position_covariance;
	if (!cov || cov.length < 1) return NaN;
	const v = cov[0]!;
	return v >= 0 ? Math.sqrt(v) : NaN;
}

/**
 * Yaw in radians from a quaternion, discarding roll and pitch.
 *
 * The live georeference node rotates by yaw alone, so this deliberately throws
 * the other two away rather than silently disagreeing with the robot.
 *
 * @param q - The orientation.
 * @returns Yaw in radians.
 */
export function yawFromQuaternion(q: Quaternion): number {
	const siny = 2 * (q.w * q.z + q.x * q.y);
	const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
	return Math.atan2(siny, cosy);
}

/** ROS type names this plugin treats as EMI topics. */
export const EMI_TYPES = {
	emi: "emi_msgs/msg/EMI",
	emiGnss: "emi_msgs/msg/EMIGnss",
	targetList: "emi_msgs/msg/EMITargetList",
	target: "emi_msgs/msg/EMITarget",
} as const;

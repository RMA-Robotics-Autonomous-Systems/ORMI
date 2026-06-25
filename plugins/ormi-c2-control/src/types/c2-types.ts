import { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";

/**
 * S1 — C2 type definitions and lifecycle enums.
 *
 * Ground truth: the RMA Multi-Agent Framework C2 source
 * (`c2_msgs/json/Enums.hpp`, `MissionConfig.hpp`, `MissionFeedback.hpp`).
 */

// ============================================================================
// Lifecycle enums (confirmed against c2_msgs/json/Enums.hpp)
// ============================================================================

/** Operator-issued command (the `requested_state` sent to :5001/change_status). */
export enum MissionStatusRequest {
	INIT = 0,
	APPROVE = 1,
	START = 2,
	PAUSE = 3,
	STOP = 4,
	DELETE = 5,
}

/** Mission state reported in the `mission_feedback` JSON `status` field. */
export enum MissionStatus {
	NONE = 0,
	PLANNED = 1,
	PLANNED_ALTERNATIVE = 2,
	PLANNED_FAILED = 3,
	ACCEPTED = 4,
	STARTED = 5,
	PAUSED = 6,
	FAILED = 7,
	STOPPED = 8,
	DELETED = 9,
	COMPLETED = 10,
}

/** Mission-level intent. */
export enum MissionBehavior {
	NAVIGATE = 0,
	COVERAGE = 1,
	NAVIGATE_NO_PLANNING = 2,
}

// ============================================================================
// Mission definition (the payload submitted to :5001 initialize)
// ============================================================================

/** Vehicle formation (C2 `Formation` enum). */
export enum VehicleFormation {
	NONE = 0,
	COLUMN = 1,
	LINE = 2,
	WEDGE = 3,
	VEE = 4,
	LEFT_FLANK = 5,
	RIGHT_FLANK = 6,
}

/**
 * A point/window in time. When present in a config, all three fields are
 * required ISO-8601 date-time strings (the validator enforces this; C2 crashes
 * on a partial block).
 */
export interface MissionTime {
	earliest?: string;
	latest?: string;
	target?: string;
}

/** A GeoJSON-like geometry, or a reference to a stored MapDB feature. */
export interface MissionGeometry {
	geometry?: {
		coordinates: unknown;
		geometry_type?: string;
	};
	/** Reference an existing MapDB feature instead of inline geometry. */
	feature_id?: string;
}

/**
 * Per-vehicle kinematic constraints (C2 `VehicleDesiredConstraints`). All fields
 * are optional numbers in the C2 contract; the validator additionally requires
 * `max_speed > 0` and accel/decel/jerk ≥ 0 when present.
 */
export interface VehicleDesiredConstraints {
	max_speed?: number;
	max_acceleration?: number;
	max_jerk?: number;
	max_deceleration?: number;
	max_straight_slope?: number;
	max_side_slope?: number;
}

/** Transit-leg optimization weights (C2 `MissionOptimalization`). */
export interface MissionOptimalization {
	visibility?: number;
	energy?: number;
	/** Must be within 0..100 when present. */
	road_usage?: number;
}

/** Mission objective (C2 `MissionObjective`). */
export interface MissionObjective {
	geometries: MissionGeometry[];
	arrival_time?: MissionTime;
	minimum_distance?: number;
	maximum_distance?: number;
	vehicle_formation?: VehicleFormation;
	vehicle_formation_distance?: number;
	/** At least [yaw, pitch, roll]. */
	vehicle_orientation?: number[];
	/**
	 * ⚠ C2 mishandles this field (known upstream bug); the validator warns when
	 * it is used at all.
	 */
	vehicle_orientation_origin?: unknown;
	vehicle_order?: boolean;
	line_of_sight?: MissionGeometry;
	line_of_sight_propagation?: boolean;
	maximize_coverage?: boolean;
	maximize_coverage_distances?: number[];
}

/** Mission start conditions (C2 `MissionStart`). */
export interface MissionStart {
	geometry: MissionGeometry;
	tolerance_distance?: number;
	vehicle_formation?: VehicleFormation;
	vehicle_formation_distances?: number;
	vehicle_orientation?: number[];
	maximize_coverage?: boolean;
	start_time?: MissionTime;
}

/** Mission transit-leg config (C2 `MissionTransit`). */
export interface MissionTransit {
	/** Required when a transit block is present (C2 crashes otherwise). */
	desired_vehicle_constraints?: VehicleDesiredConstraints;
	geofence?: MissionGeometry;
	geofence_maximum_coverage?: boolean;
	vehicle_formation?: VehicleFormation;
	vehicle_formation_distance?: number;
	optimalization?: MissionOptimalization;
}

/** Mission configuration object (serialized to a JSON string when submitted). */
export interface MissionConfig {
	/** Optional; if present must be a string (C2 crashes on a non-string). */
	mission_id?: string;
	/** Display name (ORMI-side; not part of the C2 planner contract). */
	name?: string;
	behavior: MissionBehavior;
	objective: MissionObjective;
	/** Agent ids allocated to the mission (non-empty list of strings). */
	vehicles: string[];
	start?: MissionStart;
	transit?: MissionTransit;
}

// ============================================================================
// CRUD entities
// ============================================================================

/** A stored map feature (MapDB), GeoJSON Feature shape. */
export interface C2Feature {
	type?: "Feature";
	properties?: {
		feature_type?: string;
		name?: string;
		feature_id?: string;
		[k: string]: unknown;
	};
	geometry?: { type?: string; coordinates?: unknown };
	[k: string]: unknown;
}

/** A registered vehicle (VehicleDB). */
export interface C2Vehicle {
	agent_id: string;
	[k: string]: unknown;
}

// ============================================================================
// Datasource settings
// ============================================================================

/**
 * C2 Control datasource settings.
 *
 * `missionControlUrl` → the C++ REST service (commands, default :5001).
 * `dbUrl`             → the Mongo Express REST service (CRUD, default :5000).
 *
 * Live telemetry does NOT flow through this datasource — it rides ORMI's own
 * rosbridge/foxglove datasource pointed at the same ROS graph (D2).
 */
export interface C2ControlSettings extends DatasourceProviderSettings {
	missionControlUrl: string;
	dbUrl: string;
}

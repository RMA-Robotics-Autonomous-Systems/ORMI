import { MissionBehavior } from "./c2-types";

/**
 * S1 — Mission-config validator (defensive frontend guard for the C2 planner).
 *
 * The C2 planner ingests a "MissionConfig" JSON (sent via `c2.mission.init` and
 * stored via `c2.missions.save`). C2's own parser (`MissionConfig.hpp`) reads
 * many fields with **unguarded** `.get<>()` calls that hard-crash the C2 process
 * on a wrong type, and several "optional" blocks crash if half-provided. This
 * module is the real guard: it validates a candidate config against the full C2
 * contract **plus** planner-practical rules and returns a flat list of
 * human-readable issues.
 *
 * `error`   — blocks submission/save (would crash or be rejected by C2).
 * `warning` — advisory (allowed, but surfaced — operator-error or upstream bug).
 *
 * This is a pure function: no React, no fetch, no side effects. It is shared
 * infrastructure — the Phase-4 mission editor (F5) reuses it.
 */

/** Severity of a validation issue. */
export type IssueSeverity = "error" | "warning";

/** A single, operator-facing validation issue with a precise JSON path. */
export interface MissionConfigIssue {
	/** Dotted JSON path, e.g. `transit.desired_vehicle_constraints.max_speed`. */
	path: string;
	/** Human-readable, operator-facing description. */
	message: string;
	severity: IssueSeverity;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Mutable issue accumulator passed through the recursive validators. */
class IssueList {
	readonly issues: MissionConfigIssue[] = [];

	error(path: string, message: string): void {
		this.issues.push({ path, message, severity: "error" });
	}

	warning(path: string, message: string): void {
		this.issues.push({ path, message, severity: "warning" });
	}
}

/** A plain JSON object (non-null, non-array). */
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** Valid `MissionBehavior` enum values (NAVIGATE, COVERAGE, NAVIGATE_NO_PLANNING). */
const VALID_BEHAVIORS = new Set<number>([
	MissionBehavior.NAVIGATE,
	MissionBehavior.COVERAGE,
	MissionBehavior.NAVIGATE_NO_PLANNING,
]);

/** Vehicle-formation enum range (0=NONE … 6=RIGHT_FLANK). */
const FORMATION_MIN = 0;
const FORMATION_MAX = 6;

/** Loose ISO-8601 date-time shape (date, optional time, optional offset/Z). */
const ISO8601 =
	/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Validate an optional numeric field: absent/undefined is fine; present means it
 * MUST be a finite number (C2 hard-crashes on a non-number `.get<double>()`).
 */
function checkOptionalNumber(
	issues: IssueList,
	parent: JsonObject,
	key: string,
	path: string,
	label: string,
): void {
	if (!(key in parent) || parent[key] === undefined) return;
	if (!isNumber(parent[key])) {
		issues.error(path, `${label} must be a number.`);
	}
}

/** Validate an optional boolean field (present-but-wrong-type → error). */
function checkOptionalBoolean(
	issues: IssueList,
	parent: JsonObject,
	key: string,
	path: string,
	label: string,
): void {
	if (!(key in parent) || parent[key] === undefined) return;
	if (typeof parent[key] !== "boolean") {
		issues.error(path, `${label} must be true or false.`);
	}
}

/** Validate an optional vehicle-formation enum (number in 0..6). */
function checkOptionalFormation(
	issues: IssueList,
	parent: JsonObject,
	key: string,
	path: string,
): void {
	if (!(key in parent) || parent[key] === undefined) return;
	const value = parent[key];
	if (!isNumber(value)) {
		issues.error(path, "Vehicle formation must be a number (0–6).");
		return;
	}
	if (
		value < FORMATION_MIN ||
		value > FORMATION_MAX ||
		!Number.isInteger(value)
	) {
		issues.error(
			path,
			`Vehicle formation must be one of 0–6 (NONE, COLUMN, LINE, WEDGE, VEE, LEFT_FLANK, RIGHT_FLANK); got ${String(value)}.`,
		);
	}
}

/** Validate an optional array-of-numbers field. */
function checkOptionalNumberArray(
	issues: IssueList,
	parent: JsonObject,
	key: string,
	path: string,
	label: string,
): void {
	if (!(key in parent) || parent[key] === undefined) return;
	const value = parent[key];
	if (!Array.isArray(value)) {
		issues.error(path, `${label} must be an array of numbers.`);
		return;
	}
	value.forEach((entry, index) => {
		if (!isNumber(entry)) {
			issues.error(
				`${path}[${index}]`,
				`${label} entries must all be numbers.`,
			);
		}
	});
}

/**
 * Validate a single `[lon, lat]` coordinate pair: array of ≥2 numbers, lon/lat
 * numeric (error), and within geographic range (warning — likely lat/lng swap).
 */
function checkCoordinatePair(
	issues: IssueList,
	pair: unknown,
	path: string,
): void {
	if (!Array.isArray(pair)) {
		issues.error(path, "Coordinate must be an array like [lon, lat].");
		return;
	}
	if (pair.length < 2) {
		issues.error(
			path,
			"Coordinate must have at least 2 numbers [lon, lat].",
		);
		return;
	}
	const [lon, lat] = pair;
	if (!isNumber(lon) || !isNumber(lat)) {
		issues.error(
			path,
			"Coordinate longitude and latitude must be numbers.",
		);
		return;
	}
	if (lon < -180 || lon > 180) {
		issues.warning(
			`${path}[0]`,
			`Longitude ${lon} is outside [-180, 180] — coordinates may be swapped (expected [lon, lat]).`,
		);
	}
	if (lat < -90 || lat > 90) {
		issues.warning(
			`${path}[1]`,
			`Latitude ${lat} is outside [-90, 90] — coordinates may be swapped (expected [lon, lat]).`,
		);
	}
}

/**
 * Validate a `MissionGeometry`: either `feature_id` (string) OR an inline
 * `geometry` object with required `coordinates`. Used at `objective.geometries[]`,
 * `objective.line_of_sight`, `start.geometry`, and `transit.geofence`.
 */
function checkGeometry(issues: IssueList, value: unknown, path: string): void {
	if (!isObject(value)) {
		issues.error(path, "Geometry must be an object.");
		return;
	}

	const hasFeatureId =
		"feature_id" in value && value.feature_id !== undefined;
	const hasGeometry = "geometry" in value && value.geometry !== undefined;

	if (hasFeatureId && typeof value.feature_id !== "string") {
		issues.error(`${path}.feature_id`, "feature_id must be a string.");
	}

	if (!hasFeatureId && !hasGeometry) {
		issues.error(
			path,
			"Geometry must have a feature_id or a geometry object.",
		);
		return;
	}

	if (!hasGeometry) return;

	const geometry = value.geometry;
	if (!isObject(geometry)) {
		issues.error(`${path}.geometry`, "geometry must be an object.");
		return;
	}

	if (
		"geometry_type" in geometry &&
		geometry.geometry_type !== undefined &&
		typeof geometry.geometry_type !== "string"
	) {
		issues.error(
			`${path}.geometry.geometry_type`,
			"geometry_type must be a string.",
		);
	}

	if (!("coordinates" in geometry) || geometry.coordinates === undefined) {
		issues.error(
			`${path}.geometry.coordinates`,
			"coordinates are required when an inline geometry is provided.",
		);
		return;
	}

	const coordinates = geometry.coordinates;
	if (!Array.isArray(coordinates)) {
		issues.error(
			`${path}.geometry.coordinates`,
			"coordinates must be a coordinate pair or an array of coordinate pairs.",
		);
		return;
	}

	// Single pair `[lon, lat]` vs. array-of-pairs `[[lon,lat], ...]`.
	const isArrayOfPairs =
		coordinates.length > 0 && Array.isArray(coordinates[0]);
	if (isArrayOfPairs) {
		coordinates.forEach((pair, index) => {
			checkCoordinatePair(
				issues,
				pair,
				`${path}.geometry.coordinates[${index}]`,
			);
		});
	} else {
		checkCoordinatePair(
			issues,
			coordinates,
			`${path}.geometry.coordinates`,
		);
	}
}

/**
 * Validate a `MissionTime` block. If the object is present, `latest`, `target`
 * and `earliest` are each REQUIRED ISO-8601 date-time strings.
 */
function checkMissionTime(
	issues: IssueList,
	value: unknown,
	path: string,
): void {
	if (!isObject(value)) {
		issues.error(path, "Time block must be an object.");
		return;
	}
	for (const key of ["latest", "target", "earliest"] as const) {
		const entry = value[key];
		if (entry === undefined) {
			issues.error(
				`${path}.${key}`,
				`${key} is required and must be an ISO-8601 date-time string.`,
			);
			continue;
		}
		if (typeof entry !== "string" || !ISO8601.test(entry)) {
			issues.error(
				`${path}.${key}`,
				`${key} must be an ISO-8601 date-time string (e.g. 2026-06-24T12:00:00Z).`,
			);
		}
	}
}

/** Validate `objective.vehicle_orientation_origin` — C2 mishandles this field. */
function checkOrientationOrigin(
	issues: IssueList,
	value: unknown,
	path: string,
): void {
	if (value === undefined) return;
	// C2 has two bugs here (a missing-negation that rejects valid geometry_type,
	// and a `coodinates` typo) that make this block crash or always fail.
	issues.warning(
		path,
		"C2 mishandles vehicle_orientation_origin (known upstream bug); avoid using it until fixed upstream.",
	);
}

/**
 * Validate `transit.desired_vehicle_constraints` (`VehicleDesiredConstraints`).
 * All fields are optional numbers (present-but-non-number → error). Planner rules:
 * `max_speed` (if present) > 0; accel/decel/jerk (if present) ≥ 0.
 */
function checkVehicleConstraints(
	issues: IssueList,
	value: unknown,
	path: string,
): void {
	if (!isObject(value)) {
		issues.error(
			path,
			"desired_vehicle_constraints must be an object (C2 crashes if transit is set without it).",
		);
		return;
	}

	const numericFields: ReadonlyArray<[key: string, label: string]> = [
		["max_speed", "Max speed"],
		["max_acceleration", "Max acceleration"],
		["max_jerk", "Max jerk"],
		["max_deceleration", "Max deceleration"],
		["max_straight_slope", "Max straight slope"],
		["max_side_slope", "Max side slope"],
	];
	for (const [key, label] of numericFields) {
		checkOptionalNumber(issues, value, key, `${path}.${key}`, label);
	}

	// Planner-practical rules.
	if ("max_speed" in value && value.max_speed !== undefined) {
		const speed = value.max_speed;
		if (isNumber(speed) && speed <= 0) {
			issues.error(
				`${path}.max_speed`,
				"Max speed must be greater than 0.",
			);
		}
	} else {
		issues.warning(
			`${path}.max_speed`,
			"No max_speed set; the planner will fall back to its default — set one explicitly.",
		);
	}

	for (const [key, label] of [
		["max_acceleration", "Max acceleration"],
		["max_jerk", "Max jerk"],
		["max_deceleration", "Max deceleration"],
	] as const) {
		const entry = value[key];
		if (isNumber(entry) && entry < 0) {
			issues.error(`${path}.${key}`, `${label} must be 0 or greater.`);
		}
	}
}

/** Validate `transit.optimalization` (`MissionOptimalization`). */
function checkOptimalization(
	issues: IssueList,
	value: unknown,
	path: string,
): void {
	if (!isObject(value)) {
		issues.error(path, "optimalization must be an object.");
		return;
	}
	checkOptionalNumber(
		issues,
		value,
		"visibility",
		`${path}.visibility`,
		"Visibility",
	);
	checkOptionalNumber(issues, value, "energy", `${path}.energy`, "Energy");

	if ("road_usage" in value && value.road_usage !== undefined) {
		const usage = value.road_usage;
		if (!isNumber(usage)) {
			issues.error(
				`${path}.road_usage`,
				"Road usage must be a number (0–100).",
			);
		} else if (usage < 0 || usage > 100) {
			issues.error(
				`${path}.road_usage`,
				`Road usage must be between 0 and 100; got ${usage}.`,
			);
		}
	}
}

/** Validate the `objective` (`MissionObjective`) block. */
function checkObjective(issues: IssueList, value: unknown, path: string): void {
	if (!isObject(value)) {
		issues.error(path, "objective is required and must be an object.");
		return;
	}

	// geometries — required, non-empty array of geometry objects.
	const geometries = value.geometries;
	if (!Array.isArray(geometries)) {
		issues.error(
			`${path}.geometries`,
			"objective.geometries is required and must be an array.",
		);
	} else if (geometries.length === 0) {
		issues.error(
			`${path}.geometries`,
			"objective.geometries must contain at least one geometry.",
		);
	} else {
		geometries.forEach((geometry, index) => {
			checkGeometry(issues, geometry, `${path}.geometries[${index}]`);
		});
	}

	if ("arrival_time" in value && value.arrival_time !== undefined) {
		checkMissionTime(issues, value.arrival_time, `${path}.arrival_time`);
	}

	checkOptionalNumber(
		issues,
		value,
		"minimum_distance",
		`${path}.minimum_distance`,
		"Minimum distance",
	);
	checkOptionalNumber(
		issues,
		value,
		"maximum_distance",
		`${path}.maximum_distance`,
		"Maximum distance",
	);
	checkOptionalFormation(
		issues,
		value,
		"vehicle_formation",
		`${path}.vehicle_formation`,
	);
	checkOptionalNumber(
		issues,
		value,
		"vehicle_formation_distance",
		`${path}.vehicle_formation_distance`,
		"Vehicle formation distance",
	);

	if (
		"vehicle_orientation" in value &&
		value.vehicle_orientation !== undefined
	) {
		const orientation = value.vehicle_orientation;
		if (!Array.isArray(orientation)) {
			issues.error(
				`${path}.vehicle_orientation`,
				"vehicle_orientation must be an array of numbers (yaw, pitch, roll).",
			);
		} else {
			if (orientation.length < 3) {
				issues.error(
					`${path}.vehicle_orientation`,
					"vehicle_orientation must have at least 3 numbers (yaw, pitch, roll).",
				);
			}
			orientation.forEach((entry, index) => {
				if (!isNumber(entry)) {
					issues.error(
						`${path}.vehicle_orientation[${index}]`,
						"vehicle_orientation entries must all be numbers.",
					);
				}
			});
		}
	}

	checkOrientationOrigin(
		issues,
		value.vehicle_orientation_origin,
		`${path}.vehicle_orientation_origin`,
	);
	checkOptionalBoolean(
		issues,
		value,
		"vehicle_order",
		`${path}.vehicle_order`,
		"vehicle_order",
	);

	if ("line_of_sight" in value && value.line_of_sight !== undefined) {
		checkGeometry(issues, value.line_of_sight, `${path}.line_of_sight`);
	}

	checkOptionalBoolean(
		issues,
		value,
		"line_of_sight_propagation",
		`${path}.line_of_sight_propagation`,
		"line_of_sight_propagation",
	);
	checkOptionalBoolean(
		issues,
		value,
		"maximize_coverage",
		`${path}.maximize_coverage`,
		"maximize_coverage",
	);
	checkOptionalNumberArray(
		issues,
		value,
		"maximize_coverage_distances",
		`${path}.maximize_coverage_distances`,
		"maximize_coverage_distances",
	);
}

/** Validate the `start` (`MissionStart`) block (optional top-level). */
function checkStart(issues: IssueList, value: unknown, path: string): void {
	if (!isObject(value)) {
		issues.error(path, "start must be an object.");
		return;
	}

	if (!("geometry" in value) || value.geometry === undefined) {
		issues.error(`${path}.geometry`, "start.geometry is required.");
	} else {
		checkGeometry(issues, value.geometry, `${path}.geometry`);
	}

	checkOptionalNumber(
		issues,
		value,
		"tolerance_distance",
		`${path}.tolerance_distance`,
		"Tolerance distance",
	);
	checkOptionalFormation(
		issues,
		value,
		"vehicle_formation",
		`${path}.vehicle_formation`,
	);
	checkOptionalNumber(
		issues,
		value,
		"vehicle_formation_distances",
		`${path}.vehicle_formation_distances`,
		"Vehicle formation distances",
	);
	checkOptionalNumberArray(
		issues,
		value,
		"vehicle_orientation",
		`${path}.vehicle_orientation`,
		"vehicle_orientation",
	);
	checkOptionalBoolean(
		issues,
		value,
		"maximize_coverage",
		`${path}.maximize_coverage`,
		"maximize_coverage",
	);

	if ("start_time" in value && value.start_time !== undefined) {
		checkMissionTime(issues, value.start_time, `${path}.start_time`);
	}
}

/** Validate the `transit` (`MissionTransit`) block (optional top-level). */
function checkTransit(issues: IssueList, value: unknown, path: string): void {
	if (!isObject(value)) {
		issues.error(path, "transit must be an object.");
		return;
	}

	// C2 crashes if `transit` is present but `desired_vehicle_constraints` is missing.
	if (
		!("desired_vehicle_constraints" in value) ||
		value.desired_vehicle_constraints === undefined
	) {
		issues.error(
			`${path}.desired_vehicle_constraints`,
			"transit.desired_vehicle_constraints is required when a transit block is present (C2 crashes otherwise).",
		);
	} else {
		checkVehicleConstraints(
			issues,
			value.desired_vehicle_constraints,
			`${path}.desired_vehicle_constraints`,
		);
	}

	if ("geofence" in value && value.geofence !== undefined) {
		checkGeometry(issues, value.geofence, `${path}.geofence`);
	}
	checkOptionalBoolean(
		issues,
		value,
		"geofence_maximum_coverage",
		`${path}.geofence_maximum_coverage`,
		"geofence_maximum_coverage",
	);
	checkOptionalFormation(
		issues,
		value,
		"vehicle_formation",
		`${path}.vehicle_formation`,
	);
	checkOptionalNumber(
		issues,
		value,
		"vehicle_formation_distance",
		`${path}.vehicle_formation_distance`,
		"Vehicle formation distance",
	);

	if ("optimalization" in value && value.optimalization !== undefined) {
		checkOptimalization(
			issues,
			value.optimalization,
			`${path}.optimalization`,
		);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a mission config object against the full C2 contract plus
 * planner-practical rules.
 *
 * @param config - The candidate mission config (untrusted; any shape).
 * @returns A flat list of issues; empty means fully valid. `error`-severity
 *   issues must block submission/save; `warning`-severity issues are advisory.
 */
export function validateMissionConfig(config: unknown): MissionConfigIssue[] {
	const issues = new IssueList();

	if (!isObject(config)) {
		issues.error("", "Mission config must be a JSON object.");
		return issues.issues;
	}

	// mission_id — optional; if present MUST be a string (C2 crashes otherwise).
	if ("mission_id" in config && config.mission_id !== undefined) {
		if (typeof config.mission_id !== "string") {
			issues.error(
				"mission_id",
				"mission_id must be a string when present.",
			);
		}
	}

	// behavior — effectively required number enum (null/missing → C2 crash).
	if (
		!("behavior" in config) ||
		config.behavior === undefined ||
		config.behavior === null
	) {
		issues.error(
			"behavior",
			"behavior is required: 0 = NAVIGATE, 1 = COVERAGE, 2 = NAVIGATE_NO_PLANNING.",
		);
	} else if (
		!isNumber(config.behavior) ||
		!VALID_BEHAVIORS.has(config.behavior)
	) {
		issues.error(
			"behavior",
			`behavior must be 0 (NAVIGATE), 1 (COVERAGE) or 2 (NAVIGATE_NO_PLANNING); got ${JSON.stringify(config.behavior)}.`,
		);
	}

	// vehicles — required, non-empty array of strings.
	if (!("vehicles" in config) || config.vehicles === undefined) {
		issues.error(
			"vehicles",
			"vehicles is required (a non-empty list of vehicle ids).",
		);
	} else if (!Array.isArray(config.vehicles)) {
		issues.error(
			"vehicles",
			"vehicles must be an array of vehicle id strings.",
		);
	} else if (config.vehicles.length === 0) {
		issues.error(
			"vehicles",
			"At least one vehicle must be assigned to the mission.",
		);
	} else {
		config.vehicles.forEach((vehicle, index) => {
			if (typeof vehicle !== "string") {
				issues.error(
					`vehicles[${index}]`,
					"Each vehicle id must be a string.",
				);
			}
		});
	}

	// objective — required object.
	checkObjective(issues, config.objective, "objective");

	// start — optional.
	if ("start" in config && config.start !== undefined) {
		checkStart(issues, config.start, "start");
	}

	// transit — optional.
	if ("transit" in config && config.transit !== undefined) {
		checkTransit(issues, config.transit, "transit");
	}

	return issues.issues;
}

/**
 * Convenience predicate: `true` when the config has zero `error`-severity issues
 * (warnings do not block submission).
 *
 * @param config - The candidate mission config.
 * @returns Whether the config is safe to submit/save.
 */
export function isMissionConfigSubmittable(config: unknown): boolean {
	return !validateMissionConfig(config).some(
		(issue) => issue.severity === "error",
	);
}

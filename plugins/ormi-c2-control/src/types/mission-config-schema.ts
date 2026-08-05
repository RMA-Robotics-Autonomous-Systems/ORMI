import type { JsonSchema7, UISchemaElement } from "@jsonforms/core";

/**
 * F5 — JSON Schema + UI schema for the DEEP OPTIONAL portion of a mission
 * config, rendered with embedded JSON-Forms inside the mission editor.
 *
 * Scope: the blocks the custom React form does NOT handle directly —
 * `transit` (desired vehicle constraints + optimization), `start`, and
 * `objective.arrival_time`. Name / behavior / vehicle allocation / objective
 * geometries are bespoke React in the editor; everything here is the optional
 * "advanced" tail.
 *
 * Derived from the `MissionConfig` / `MissionObjective` / `MissionTransit` TS
 * types in `c2-types.ts` (NOT from `c2.mission.init`'s requestSchema, which
 * treats `mission_config` as an opaque object). Field semantics and the
 * planner-crash constraints are enforced separately by
 * `mission-config-validation.ts` — this schema is purely for form rendering, so
 * it keeps fields optional and leans on the validator for the hard rules.
 *
 * ⚠ COORDINATE RULE — none of these blocks carry coordinates directly (geometry
 * authoring is the map widget's job, `[lng, lat]`); the geometry sub-objects in
 * `start`/`transit.geofence` are referenced/authored elsewhere, so they are not
 * surfaced in this advanced form.
 */

/**
 * Shared schema for a `MissionTime` block. `format: "date-time"` makes
 * JSON-Forms render a date+time picker (ShadcnDateTimeControl, which emits a
 * full ISO-8601 string via `toISOString()`) instead of a raw text field — the
 * operator never types ISO-8601 by hand.
 */
const missionTimeSchema: JsonSchema7 = {
	type: "object",
	properties: {
		earliest: {
			type: "string",
			format: "date-time",
			title: "Earliest",
			description: "Earliest acceptable time — do not act before this.",
		},
		target: {
			type: "string",
			format: "date-time",
			title: "Target",
			description: "Desired time to aim for.",
		},
		latest: {
			type: "string",
			format: "date-time",
			title: "Latest",
			description: "Deadline — must not be later than this.",
		},
	},
};

/** Shared schema for `VehicleDesiredConstraints`. */
const vehicleConstraintsSchema: JsonSchema7 = {
	type: "object",
	properties: {
		max_speed: {
			type: "number",
			title: "Max speed (m/s)",
			description:
				"Top speed the planner may command. Must be greater than 0.",
		},
		max_acceleration: {
			type: "number",
			title: "Max acceleration (m/s²)",
			description: "Hardest the vehicle may speed up.",
		},
		max_jerk: {
			type: "number",
			title: "Max jerk (m/s³)",
			description:
				"Maximum rate of change of acceleration (ride/mechanical smoothness limit).",
		},
		max_deceleration: {
			type: "number",
			title: "Max deceleration (m/s²)",
			description: "Hardest the vehicle may brake.",
		},
		max_straight_slope: {
			type: "number",
			title: "Max straight slope",
			description: "Steepest head-on incline the vehicle may climb.",
		},
		max_side_slope: {
			type: "number",
			title: "Max side slope",
			description:
				"Steepest sideways tilt allowed on a cross-slope (tip-over limit).",
		},
	},
};

/** Shared schema for `MissionOptimalization`. */
const optimalizationSchema: JsonSchema7 = {
	type: "object",
	properties: {
		visibility: {
			type: "number",
			title: "Visibility weight",
			description:
				"Route-planning weight for visibility / line-of-sight exposure.",
		},
		energy: {
			type: "number",
			title: "Energy weight",
			description: "Route-planning weight for energy efficiency.",
		},
		road_usage: {
			type: "number",
			title: "Road usage (0–100)",
			description:
				"Preference for staying on roads vs going off-road (0 = ignore roads, 100 = stay on roads).",
			minimum: 0,
			maximum: 100,
		},
	},
};

/** Vehicle-formation enum, shared by start/objective/transit blocks. */
const formationSchema: JsonSchema7 = {
	type: "integer",
	title: "Vehicle formation",
	description: "Geometric pattern the vehicles hold together.",
	oneOf: [
		{ const: 0, title: "None" },
		{ const: 1, title: "Column" },
		{ const: 2, title: "Line" },
		{ const: 3, title: "Wedge" },
		{ const: 4, title: "Vee" },
		{ const: 5, title: "Left flank" },
		{ const: 6, title: "Right flank" },
	],
};

/**
 * JSON Schema for the advanced (deep-optional) mission-config blocks.
 *
 * The editor binds a SUBSET of the draft to this — `{ arrival_time, transit,
 * start }` — and writes changes back via `patchDraft` / objective merge.
 */
export const missionAdvancedSchema: JsonSchema7 = {
	type: "object",
	properties: {
		arrival_time: {
			...missionTimeSchema,
			title: "Objective arrival time",
		},
		transit: {
			type: "object",
			title: "Transit leg",
			properties: {
				desired_vehicle_constraints: {
					...vehicleConstraintsSchema,
					title: "Desired vehicle constraints",
				},
				vehicle_formation: formationSchema,
				vehicle_formation_distance: {
					type: "number",
					title: "Formation distance (m)",
					description:
						"Spacing between vehicles while holding the transit formation.",
				},
				geofence_maximum_coverage: {
					type: "boolean",
					title: "Geofence maximum coverage",
					description:
						"Maximize coverage within the geofence instead of taking the most direct route.",
				},
				optimalization: {
					...optimalizationSchema,
					title: "Optimization weights",
				},
			},
		},
		start: {
			type: "object",
			title: "Start conditions",
			properties: {
				tolerance_distance: {
					type: "number",
					title: "Tolerance distance (m)",
					description:
						"How far from the defined start point a vehicle may begin and still be accepted.",
				},
				vehicle_formation: formationSchema,
				vehicle_formation_distances: {
					type: "number",
					title: "Formation distances (m)",
					description:
						"Spacing between vehicles in the start formation.",
				},
				maximize_coverage: {
					type: "boolean",
					title: "Maximize coverage",
					description: "Maximize coverage during the start phase.",
				},
				start_time: { ...missionTimeSchema, title: "Start time" },
			},
		},
	},
};

/**
 * UI schema for {@link missionAdvancedSchema}.
 *
 * Controls must target **leaf scalar** scopes — `shadcnRenderer` has no
 * object-control renderer, so a `Control` on an object scope (e.g.
 * `#/properties/transit`) renders "No applicable renderer found". Every Control
 * below therefore points at a concrete scalar, grouped for readability.
 */
const control = (scope: string) => ({ type: "Control", scope });

export const missionAdvancedUiSchema: UISchemaElement = {
	type: "VerticalLayout",
	elements: [
		{
			type: "Group",
			label: "Arrival time",
			elements: [
				control("#/properties/arrival_time/properties/earliest"),
				control("#/properties/arrival_time/properties/target"),
				control("#/properties/arrival_time/properties/latest"),
			],
		},
		{
			type: "Group",
			label: "Transit — desired vehicle constraints",
			elements: [
				control(
					"#/properties/transit/properties/desired_vehicle_constraints/properties/max_speed",
				),
				control(
					"#/properties/transit/properties/desired_vehicle_constraints/properties/max_acceleration",
				),
				control(
					"#/properties/transit/properties/desired_vehicle_constraints/properties/max_jerk",
				),
				control(
					"#/properties/transit/properties/desired_vehicle_constraints/properties/max_deceleration",
				),
				control(
					"#/properties/transit/properties/desired_vehicle_constraints/properties/max_straight_slope",
				),
				control(
					"#/properties/transit/properties/desired_vehicle_constraints/properties/max_side_slope",
				),
			],
		},
		{
			type: "Group",
			label: "Transit — formation & optimization",
			elements: [
				control("#/properties/transit/properties/vehicle_formation"),
				control(
					"#/properties/transit/properties/vehicle_formation_distance",
				),
				control(
					"#/properties/transit/properties/geofence_maximum_coverage",
				),
				control(
					"#/properties/transit/properties/optimalization/properties/visibility",
				),
				control(
					"#/properties/transit/properties/optimalization/properties/energy",
				),
				control(
					"#/properties/transit/properties/optimalization/properties/road_usage",
				),
			],
		},
		{
			type: "Group",
			label: "Start conditions",
			elements: [
				control("#/properties/start/properties/tolerance_distance"),
				control("#/properties/start/properties/vehicle_formation"),
				control(
					"#/properties/start/properties/vehicle_formation_distances",
				),
				control("#/properties/start/properties/maximize_coverage"),
				control(
					"#/properties/start/properties/start_time/properties/earliest",
				),
				control(
					"#/properties/start/properties/start_time/properties/target",
				),
				control(
					"#/properties/start/properties/start_time/properties/latest",
				),
			],
		},
	],
} as unknown as UISchemaElement;

/** The slice of a mission draft fed to the advanced JSON-Forms editor. */
export interface MissionAdvancedData {
	arrival_time?: unknown;
	transit?: unknown;
	start?: unknown;
}

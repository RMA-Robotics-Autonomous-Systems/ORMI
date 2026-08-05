import { describe, expect, it } from "bun:test";

import {
	isMissionConfigSubmittable,
	MissionConfigIssue,
	validateMissionConfig,
} from "./mission-config-validation";

/** Issues whose path matches (or starts the path with) `path` and are errors. */
function errorsAt(issues: MissionConfigIssue[], path: string) {
	return issues.filter(
		(i) =>
			i.severity === "error" &&
			(i.path === path ||
				i.path.startsWith(`${path}[`) ||
				i.path.startsWith(`${path}.`)),
	);
}

function warningsAt(issues: MissionConfigIssue[], path: string) {
	return issues.filter(
		(i) =>
			i.severity === "warning" &&
			(i.path === path ||
				i.path.startsWith(`${path}[`) ||
				i.path.startsWith(`${path}.`)),
	);
}

function errorCount(issues: MissionConfigIssue[]) {
	return issues.filter((i) => i.severity === "error").length;
}

/** A minimal valid config: vehicles + behavior + one geometry with valid coord. */
function minimalValid() {
	return {
		behavior: 0,
		vehicles: ["robot-1"],
		objective: {
			geometries: [{ geometry: { coordinates: [4.35, 50.85] } }],
		},
	};
}

describe("validateMissionConfig — valid configs", () => {
	it("a minimal valid config has zero errors", () => {
		const issues = validateMissionConfig(minimalValid());
		expect(errorCount(issues)).toBe(0);
		expect(isMissionConfigSubmittable(minimalValid())).toBe(true);
	});

	it("accepts a feature_id geometry instead of inline geometry", () => {
		const config = {
			behavior: 1,
			vehicles: ["a", "b"],
			objective: { geometries: [{ feature_id: "feat-123" }] },
		};
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});

	it("accepts an array of coordinate pairs", () => {
		const config = minimalValid();
		config.objective.geometries = [
			{
				geometry: {
					coordinates: [
						[4.35, 50.85],
						[4.36, 50.86],
					],
				},
			},
		] as never;
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});

	it("accepts a valid 2-level Point ([[lon, lat]] single-vertex list)", () => {
		const config = minimalValid();
		config.objective.geometries = [
			{
				geometry: {
					geometry_type: "Point",
					coordinates: [[4.35, 50.85]],
				},
			},
		] as never;
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});

	it("rejects a bare 1-level Point ([lon, lat]) — the C2 reads coordinates[0] as a number", () => {
		const config = minimalValid();
		config.objective.geometries = [
			{
				geometry: {
					geometry_type: "Point",
					coordinates: [4.35, 50.85],
				},
			},
		] as never;
		const errs = errorsAt(
			validateMissionConfig(config),
			"objective.geometries[0].geometry.coordinates",
		);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.message).toContain("[[lon, lat]]");
	});

	it("accepts a valid LineString", () => {
		const config = minimalValid();
		config.objective.geometries = [
			{
				geometry: {
					geometry_type: "LineString",
					coordinates: [
						[4.35, 50.85],
						[4.36, 50.86],
						[4.37, 50.87],
					],
				},
			},
		] as never;
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});

	it("accepts a valid flat Polygon ring (2-level — the C2 contract)", () => {
		const config = minimalValid();
		config.objective.geometries = [
			{
				geometry: {
					geometry_type: "Polygon",
					coordinates: [
						[4.35, 50.85],
						[4.36, 50.85],
						[4.36, 50.86],
						[4.35, 50.85],
					],
				},
			},
		] as never;
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});

	it("rejects an un-flattened GeoJSON Polygon (3-level nesting)", () => {
		const config = minimalValid();
		config.objective.geometries = [
			{
				geometry: {
					geometry_type: "Polygon",
					coordinates: [
						[
							[4.35, 50.85],
							[4.36, 50.85],
							[4.36, 50.86],
							[4.35, 50.85],
						],
					],
				},
			},
		] as never;
		const errs = errorsAt(
			validateMissionConfig(config),
			"objective.geometries[0].geometry.coordinates",
		);
		expect(errs).not.toHaveLength(0);
		expect(errs[0]?.message).toContain("flat list of [lon, lat]");
	});

	it("accepts a feature_id reference carrying a materialized empty geometry (Mongo round-trip)", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: {
				geometries: [
					{ feature_id: "abc", geometry: { coordinates: [] } },
				],
			},
		};
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});
});

describe("validateMissionConfig — top-level", () => {
	it("rejects a non-object config", () => {
		expect(errorCount(validateMissionConfig(null))).toBeGreaterThan(0);
		expect(errorCount(validateMissionConfig("x"))).toBeGreaterThan(0);
		expect(errorCount(validateMissionConfig([]))).toBeGreaterThan(0);
	});

	it("allows a string mission_id but rejects a non-string", () => {
		const ok = { ...minimalValid(), mission_id: "m-1" };
		expect(errorsAt(validateMissionConfig(ok), "mission_id")).toHaveLength(
			0,
		);
		const bad = { ...minimalValid(), mission_id: 42 };
		expect(errorsAt(validateMissionConfig(bad), "mission_id")).toHaveLength(
			1,
		);
	});

	it("errors on missing vehicles", () => {
		const config = { behavior: 0, objective: minimalValid().objective };
		expect(
			errorsAt(validateMissionConfig(config), "vehicles"),
		).toHaveLength(1);
	});

	it("errors on empty vehicles array", () => {
		const config = { ...minimalValid(), vehicles: [] };
		expect(
			errorsAt(validateMissionConfig(config), "vehicles"),
		).toHaveLength(1);
	});

	it("errors on a non-string vehicle element", () => {
		const config = { ...minimalValid(), vehicles: ["ok", 5] };
		expect(
			errorsAt(validateMissionConfig(config), "vehicles[1]"),
		).toHaveLength(1);
	});

	it("errors on missing behavior", () => {
		const config = { vehicles: ["a"], objective: minimalValid().objective };
		expect(
			errorsAt(validateMissionConfig(config), "behavior"),
		).toHaveLength(1);
	});

	it("errors on out-of-range behavior (99)", () => {
		const config = { ...minimalValid(), behavior: 99 };
		expect(
			errorsAt(validateMissionConfig(config), "behavior"),
		).toHaveLength(1);
	});

	it("errors on a string behavior ('navigate')", () => {
		const config = { ...minimalValid(), behavior: "navigate" };
		expect(
			errorsAt(validateMissionConfig(config), "behavior"),
		).toHaveLength(1);
	});
});

describe("validateMissionConfig — objective + geometries", () => {
	it("errors on missing objective", () => {
		const config = { behavior: 0, vehicles: ["a"] };
		expect(
			errorsAt(validateMissionConfig(config), "objective"),
		).toHaveLength(1);
	});

	it("errors on missing geometries", () => {
		const config = { behavior: 0, vehicles: ["a"], objective: {} };
		expect(
			errorsAt(validateMissionConfig(config), "objective.geometries"),
		).toHaveLength(1);
	});

	it("errors on empty geometries", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: { geometries: [] },
		};
		expect(
			errorsAt(validateMissionConfig(config), "objective.geometries"),
		).toHaveLength(1);
	});

	it("errors on a geometry with neither feature_id nor geometry", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: { geometries: [{}] },
		};
		const errs = errorsAt(
			validateMissionConfig(config),
			"objective.geometries[0]",
		);
		expect(errs.length).toBeGreaterThan(0);
		expect(errs[0]?.message).toContain("feature_id or a geometry");
	});

	it("errors on a geometry coordinate of the wrong shape", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: { geometries: [{ geometry: { coordinates: "nope" } }] },
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"objective.geometries[0].geometry.coordinates",
			),
		).not.toHaveLength(0);
	});

	it("errors on a non-number lon/lat", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: {
				geometries: [{ geometry: { coordinates: ["x", "y"] } }],
			},
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"objective.geometries[0].geometry.coordinates",
			),
		).not.toHaveLength(0);
	});

	it("warns on out-of-range lon/lat (likely swapped)", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: {
				geometries: [{ geometry: { coordinates: [200, 99] } }],
			},
		};
		const issues = validateMissionConfig(config);
		expect(
			warningsAt(issues, "objective.geometries[0].geometry.coordinates"),
		).not.toHaveLength(0);
		expect(errorCount(issues)).toBe(0);
	});

	it("errors when inline geometry omits coordinates", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: {
				geometries: [{ geometry: { geometry_type: "MultiPoint" } }],
			},
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"objective.geometries[0].geometry.coordinates",
			),
		).toHaveLength(1);
	});

	it("errors with a clear message on empty coordinates []", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: { geometries: [{ geometry: { coordinates: [] } }] },
		};
		const errs = errorsAt(
			validateMissionConfig(config),
			"objective.geometries[0].geometry.coordinates",
		);
		expect(errs).toHaveLength(1);
		expect(errs[0]?.message).toContain("no coordinates");
	});

	it("errors on a degenerate empty ring [[]]", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: { geometries: [{ geometry: { coordinates: [[]] } }] },
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"objective.geometries[0].geometry.coordinates",
			),
		).not.toHaveLength(0);
	});

	it("errors on a single-number coordinate [5]", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: { geometries: [{ geometry: { coordinates: [5] } }] },
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"objective.geometries[0].geometry.coordinates",
			),
		).not.toHaveLength(0);
	});

	it("warns on a swapped/out-of-range pair inside a flat polygon ring (lon=200)", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: {
				geometries: [
					{
						geometry: {
							geometry_type: "Polygon",
							coordinates: [
								[200, 50.85],
								[4.36, 50.85],
								[4.36, 50.86],
								[200, 50.85],
							],
						},
					},
				],
			},
		};
		const issues = validateMissionConfig(config);
		expect(
			warningsAt(issues, "objective.geometries[0].geometry.coordinates"),
		).not.toHaveLength(0);
		expect(errorCount(issues)).toBe(0);
	});

	it("warns when vehicle_orientation_origin is present", () => {
		const config = {
			...minimalValid(),
			objective: {
				...minimalValid().objective,
				vehicle_orientation_origin: { feature_id: "f1" },
			},
		};
		const issues = validateMissionConfig(config);
		expect(
			warningsAt(issues, "objective.vehicle_orientation_origin"),
		).toHaveLength(1);
	});
});

describe("validateMissionConfig — transit", () => {
	it("errors when transit present but desired_vehicle_constraints missing (the crash case)", () => {
		const config = { ...minimalValid(), transit: {} };
		expect(
			errorsAt(
				validateMissionConfig(config),
				"transit.desired_vehicle_constraints",
			),
		).toHaveLength(1);
	});

	it("accepts transit with valid constraints", () => {
		const config = {
			...minimalValid(),
			transit: { desired_vehicle_constraints: { max_speed: 5 } },
		};
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});

	it("errors on max_speed = 0", () => {
		const config = {
			...minimalValid(),
			transit: { desired_vehicle_constraints: { max_speed: 0 } },
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"transit.desired_vehicle_constraints.max_speed",
			),
		).toHaveLength(1);
	});

	it("errors on negative max_speed", () => {
		const config = {
			...minimalValid(),
			transit: { desired_vehicle_constraints: { max_speed: -3 } },
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"transit.desired_vehicle_constraints.max_speed",
			),
		).toHaveLength(1);
	});

	it("errors on a non-number max_speed ('fast')", () => {
		const config = {
			...minimalValid(),
			transit: { desired_vehicle_constraints: { max_speed: "fast" } },
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"transit.desired_vehicle_constraints.max_speed",
			),
		).not.toHaveLength(0);
	});

	it("warns when max_speed is absent in a present constraints block", () => {
		const config = {
			...minimalValid(),
			transit: { desired_vehicle_constraints: { max_acceleration: 1 } },
		};
		const issues = validateMissionConfig(config);
		expect(
			warningsAt(issues, "transit.desired_vehicle_constraints.max_speed"),
		).toHaveLength(1);
		expect(errorCount(issues)).toBe(0);
	});

	it("errors on negative acceleration", () => {
		const config = {
			...minimalValid(),
			transit: {
				desired_vehicle_constraints: {
					max_speed: 5,
					max_acceleration: -1,
				},
			},
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"transit.desired_vehicle_constraints.max_acceleration",
			),
		).toHaveLength(1);
	});

	it("errors on road_usage = 150", () => {
		const config = {
			...minimalValid(),
			transit: {
				desired_vehicle_constraints: { max_speed: 5 },
				optimalization: { road_usage: 150 },
			},
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"transit.optimalization.road_usage",
			),
		).toHaveLength(1);
	});

	it("accepts road_usage = 50", () => {
		const config = {
			...minimalValid(),
			transit: {
				desired_vehicle_constraints: { max_speed: 5 },
				optimalization: { road_usage: 50 },
			},
		};
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});

	it("validates the geofence geometry inside transit", () => {
		const config = {
			...minimalValid(),
			transit: {
				desired_vehicle_constraints: { max_speed: 5 },
				geofence: {},
			},
		};
		expect(
			errorsAt(validateMissionConfig(config), "transit.geofence"),
		).not.toHaveLength(0);
	});
});

describe("validateMissionConfig — MissionTime", () => {
	it("errors when arrival_time is present but missing latest", () => {
		const config = {
			...minimalValid(),
			objective: {
				...minimalValid().objective,
				arrival_time: {
					earliest: "2026-06-24T10:00:00Z",
					target: "2026-06-24T11:00:00Z",
				},
			},
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"objective.arrival_time.latest",
			),
		).toHaveLength(1);
	});

	it("errors on a non-ISO8601 target", () => {
		const config = {
			...minimalValid(),
			objective: {
				...minimalValid().objective,
				arrival_time: {
					earliest: "2026-06-24T10:00:00Z",
					latest: "2026-06-24T12:00:00Z",
					target: "not-a-date",
				},
			},
		};
		expect(
			errorsAt(
				validateMissionConfig(config),
				"objective.arrival_time.target",
			),
		).toHaveLength(1);
	});

	it("accepts a fully-specified ISO8601 arrival_time", () => {
		const config = {
			...minimalValid(),
			objective: {
				...minimalValid().objective,
				arrival_time: {
					earliest: "2026-06-24T10:00:00Z",
					latest: "2026-06-24T12:00:00Z",
					target: "2026-06-24T11:00:00Z",
				},
			},
		};
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});
});

describe("validateMissionConfig — start", () => {
	it("errors when start is present but geometry missing", () => {
		const config = { ...minimalValid(), start: {} };
		expect(
			errorsAt(validateMissionConfig(config), "start.geometry"),
		).toHaveLength(1);
	});

	it("accepts a valid start block", () => {
		const config = {
			...minimalValid(),
			start: { geometry: { feature_id: "start-zone" } },
		};
		expect(errorCount(validateMissionConfig(config))).toBe(0);
	});

	it("errors on an out-of-range vehicle_formation", () => {
		const config = {
			...minimalValid(),
			start: { geometry: { feature_id: "z" }, vehicle_formation: 9 },
		};
		expect(
			errorsAt(validateMissionConfig(config), "start.vehicle_formation"),
		).toHaveLength(1);
	});
});

describe("validateMissionConfig — NAVIGATE advisory warnings", () => {
	/** A 2-level Point objective geometry (the C2 contract). */
	function pointGeom(lon: number, lat: number) {
		return {
			geometry: { geometry_type: "Point", coordinates: [[lon, lat]] },
		};
	}

	/** A flat 2-level LineString objective geometry. */
	function lineGeom() {
		return {
			geometry: {
				geometry_type: "LineString",
				coordinates: [
					[4.35, 50.85],
					[4.36, 50.86],
				],
			},
		};
	}

	/** A flat 2-level Polygon ring objective geometry. */
	function polygonGeom() {
		return {
			geometry: {
				geometry_type: "Polygon",
				coordinates: [
					[4.35, 50.85],
					[4.36, 50.85],
					[4.36, 50.86],
					[4.35, 50.85],
				],
			},
		};
	}

	it("warns when a NAVIGATE objective uses a LineString (coverage region)", () => {
		const config = {
			behavior: 0,
			vehicles: ["a", "b"],
			objective: { geometries: [lineGeom()] },
		};
		const issues = validateMissionConfig(config);
		const warns = warningsAt(issues, "objective.geometries");
		expect(warns.some((w) => w.message.includes("coverage region"))).toBe(
			true,
		);
		expect(errorCount(issues)).toBe(0);
		expect(isMissionConfigSubmittable(config)).toBe(true);
	});

	it("warns when a NAVIGATE objective uses a Polygon (coverage region)", () => {
		const config = {
			behavior: 0,
			vehicles: ["a", "b"],
			objective: { geometries: [polygonGeom()] },
		};
		const warns = warningsAt(
			validateMissionConfig(config),
			"objective.geometries",
		);
		expect(warns.some((w) => w.message.includes("coverage region"))).toBe(
			true,
		);
	});

	it("warns when objective count exceeds the assigned vehicle count", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: {
				geometries: [pointGeom(4.35, 50.85), pointGeom(4.36, 50.86)],
			},
		};
		const issues = validateMissionConfig(config);
		const warns = warningsAt(issues, "objective.geometries");
		expect(warns.some((w) => w.message.includes("left unplanned"))).toBe(
			true,
		);
		expect(errorCount(issues)).toBe(0);
	});

	it("warns when a NAVIGATE objective mixes Point with line/area geometries", () => {
		const config = {
			behavior: 0,
			vehicles: ["a", "b", "c"],
			objective: { geometries: [pointGeom(4.35, 50.85), lineGeom()] },
		};
		const warns = warningsAt(
			validateMissionConfig(config),
			"objective.geometries",
		);
		expect(warns.some((w) => w.message.includes("starve"))).toBe(true);
	});

	it("emits no NAVIGATE advisory for a single Point with enough vehicles", () => {
		const config = {
			behavior: 0,
			vehicles: ["a", "b"],
			objective: { geometries: [pointGeom(4.35, 50.85)] },
		};
		expect(
			warningsAt(validateMissionConfig(config), "objective.geometries"),
		).toHaveLength(0);
	});

	it("does not emit NAVIGATE advisories for COVERAGE behavior", () => {
		const config = {
			behavior: 1,
			vehicles: ["a"],
			objective: { geometries: [polygonGeom(), lineGeom()] },
		};
		expect(
			warningsAt(validateMissionConfig(config), "objective.geometries"),
		).toHaveLength(0);
	});

	it("advisory warnings never block submission", () => {
		const config = {
			behavior: 0,
			vehicles: ["a"],
			objective: { geometries: [lineGeom(), polygonGeom()] },
		};
		const issues = validateMissionConfig(config);
		expect(issues.some((i) => i.severity === "warning")).toBe(true);
		expect(issues.every((i) => i.severity === "warning")).toBe(true);
		expect(isMissionConfigSubmittable(config)).toBe(true);
	});
});

describe("isMissionConfigSubmittable", () => {
	it("is false when there are errors", () => {
		expect(isMissionConfigSubmittable({})).toBe(false);
	});
	it("is true when only warnings exist", () => {
		const config = {
			...minimalValid(),
			objective: {
				...minimalValid().objective,
				vehicle_orientation_origin: { feature_id: "f" },
			},
		};
		expect(isMissionConfigSubmittable(config)).toBe(true);
		expect(
			validateMissionConfig(config).some((i) => i.severity === "warning"),
		).toBe(true);
	});
});

import { afterEach, describe, expect, it } from "bun:test";

import { MissionBehavior } from "../types/c2-types";
import {
	compileMissionGraph,
	MISSION_GRAPH_VERSION,
} from "../widgets/mission-graph";

import {
	__resetMapFeatures,
	getFeatureName,
	getMapAssetFeatures,
	getMapFeatures,
	getMapFeatureTypes,
	getMissionName,
	hasMapFeatures,
	isAssetFeatureType,
	publishFeatureNames,
	publishMapFeatures,
	publishMissionNames,
	shortId,
	subscribe,
} from "./c2-catalog-store";

/**
 * Pure-logic tests for the C2 catalog store (no React). The store is
 * module-level; cases use distinct ids so they don't collide across tests, and
 * publishing the same name again is a documented no-op anyway.
 */

describe("c2-catalog-store", () => {
	describe("shortId", () => {
		it("returns '' for empty/null/undefined", () => {
			expect(shortId("")).toBe("");
			expect(shortId(null)).toBe("");
			expect(shortId(undefined)).toBe("");
		});

		it("returns a short string verbatim", () => {
			expect(shortId("abc")).toBe("abc");
			expect(shortId("12345678")).toBe("12345678");
		});

		it("truncates a long id to the first 8 chars + …", () => {
			expect(shortId("0123456789abcdef")).toBe("01234567…");
		});
	});

	describe("mission names", () => {
		it("publishes then resolves the name", () => {
			publishMissionNames([{ mission_id: "m-alpha", name: "Alpha" }]);
			expect(getMissionName("m-alpha")).toBe("Alpha");
		});

		it("falls back to shortId for an unknown id", () => {
			expect(getMissionName("0123456789-unknown")).toBe("01234567…");
		});

		it("resolves '' for empty/null id", () => {
			expect(getMissionName("")).toBe("");
			expect(getMissionName(null)).toBe("");
			expect(getMissionName(undefined)).toBe("");
		});

		it("ignores rows without a usable name (keeps the prior name)", () => {
			publishMissionNames([{ mission_id: "m-beta", name: "Beta" }]);
			publishMissionNames([{ mission_id: "m-beta" }]);
			expect(getMissionName("m-beta")).toBe("Beta");
		});

		it("is a no-op (no notify) when names are unchanged", () => {
			publishMissionNames([{ mission_id: "m-gamma", name: "Gamma" }]);
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			publishMissionNames([{ mission_id: "m-gamma", name: "Gamma" }]);
			unsubscribe();
			expect(notified).toBe(0);
			expect(getMissionName("m-gamma")).toBe("Gamma");
		});

		it("notifies on a real change", () => {
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			publishMissionNames([{ mission_id: "m-delta", name: "Delta" }]);
			unsubscribe();
			expect(notified).toBe(1);
		});
	});

	describe("feature names", () => {
		it("publishes then resolves the name", () => {
			publishFeatureNames([{ feature_id: "f-alpha", name: "Fence A" }]);
			expect(getFeatureName("f-alpha")).toBe("Fence A");
		});

		it("falls back to shortId for an unknown id", () => {
			expect(getFeatureName("fedcba9876-unknown")).toBe("fedcba98…");
		});

		it("is a no-op (no notify) when names are unchanged", () => {
			publishFeatureNames([{ feature_id: "f-beta", name: "Road B" }]);
			let notified = 0;
			const unsubscribe = subscribe(() => {
				notified += 1;
			});
			publishFeatureNames([{ feature_id: "f-beta", name: "Road B" }]);
			unsubscribe();
			expect(notified).toBe(0);
		});
	});

	describe("independence", () => {
		it("feature and mission maps do not cross-resolve", () => {
			publishMissionNames([{ mission_id: "shared-id", name: "Mission" }]);
			publishFeatureNames([{ feature_id: "shared-id", name: "Feature" }]);
			expect(getMissionName("shared-id")).toBe("Mission");
			expect(getFeatureName("shared-id")).toBe("Feature");
		});

		it("a mission id unknown to features falls back to shortId", () => {
			publishMissionNames([
				{ mission_id: "01234567mission", name: "Only Mission" },
			]);
			expect(getFeatureName("01234567mission")).toBe("01234567…");
		});
	});
});

/**
 * The per-map feature catalogue. The semantics that matter here are
 * REPLACE-PER-MAP and the identity stability the `useSyncExternalStore` hooks
 * depend on — both fail silently, and both fail in the operator's hands.
 */
describe("c2-catalog-store map features", () => {
	afterEach(() => {
		__resetMapFeatures();
	});

	it("reports an unpublished map as absent, with stable empty results", () => {
		expect(hasMapFeatures("nowhere")).toBe(false);
		expect(getMapFeatures("nowhere")).toEqual([]);
		// Identity-stable: a fresh [] per call makes useSyncExternalStore loop.
		expect(getMapFeatures("nowhere")).toBe(getMapFeatures("elsewhere"));
		expect(getMapFeatureTypes(null)).toBe(getMapFeatureTypes(undefined));
	});

	it("stores a map's features and its derived views", () => {
		publishMapFeatures("alpha", [
			{ feature_id: "f-zone", name: "North", feature_type: "zone" },
			{ feature_id: "f-road", name: "Route 9", feature_type: "road" },
			{ feature_id: "f-wp", name: "Rally", feature_type: "waypoint" },
		]);
		expect(hasMapFeatures("alpha")).toBe(true);
		expect(getMapFeatures("alpha")).toHaveLength(3);
		// A road is map furniture, never a mission objective.
		expect(getMapAssetFeatures("alpha").map((f) => f.feature_id)).toEqual([
			"f-zone",
			"f-wp",
		]);
		expect(getMapFeatureTypes("alpha")).toEqual({
			"f-zone": "zone",
			"f-road": "road",
			"f-wp": "waypoint",
		});
	});

	it("REPLACES a map's catalogue rather than merging into it", () => {
		publishMapFeatures("alpha", [
			{ feature_id: "f-1", name: "Old zone", feature_type: "zone" },
			{ feature_id: "f-2", name: "Kept", feature_type: "zone" },
		]);
		// The operator deleted f-1 on the map; the refetch must lose it, or it
		// stays offerable forever.
		publishMapFeatures("alpha", [
			{ feature_id: "f-2", name: "Kept", feature_type: "zone" },
		]);
		expect(getMapAssetFeatures("alpha").map((f) => f.feature_id)).toEqual([
			"f-2",
		]);
		expect(getMapFeatureTypes("alpha")["f-1"]).toBeUndefined();
	});

	it("scopes each map separately — map B never shows map A's zones", () => {
		publishMapFeatures("alpha", [
			{ feature_id: "a-1", name: "Alpha zone", feature_type: "zone" },
		]);
		publishMapFeatures("beta", [
			{ feature_id: "b-1", name: "Beta zone", feature_type: "zone" },
		]);
		expect(getMapAssetFeatures("beta").map((f) => f.feature_id)).toEqual([
			"b-1",
		]);
		expect(getMapAssetFeatures("alpha").map((f) => f.feature_id)).toEqual([
			"a-1",
		]);
	});

	it("keeps the NAME catalogue additive across maps", () => {
		// `useFeatureName` is used by widgets that know nothing about maps, so
		// names must survive a publish for another map.
		publishMapFeatures("alpha", [
			{ feature_id: "n-1", name: "Alpha zone", feature_type: "zone" },
		]);
		publishMapFeatures("beta", [
			{ feature_id: "n-2", name: "Beta zone", feature_type: "zone" },
		]);
		expect(getFeatureName("n-1")).toBe("Alpha zone");
		expect(getFeatureName("n-2")).toBe("Beta zone");
	});

	it("is a no-op — no notification, stable identity — for an identical republish", () => {
		const rows = [
			{ feature_id: "s-1", name: "Same", feature_type: "zone" },
		];
		publishMapFeatures("gamma", rows);
		const before = getMapAssetFeatures("gamma");
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified++;
		});
		publishMapFeatures("gamma", rows);
		expect(notified).toBe(0);
		expect(getMapAssetFeatures("gamma")).toBe(before);
		unsubscribe();
	});

	it("notifies when a map's catalogue really changes", () => {
		publishMapFeatures("delta", [
			{ feature_id: "d-1", feature_type: "zone" },
		]);
		let notified = 0;
		const unsubscribe = subscribe(() => {
			notified++;
		});
		publishMapFeatures("delta", [
			{ feature_id: "d-1", feature_type: "zone" },
			{ feature_id: "d-2", feature_type: "cue" },
		]);
		expect(notified).toBe(1);
		expect(getMapAssetFeatures("delta")).toHaveLength(2);
		unsubscribe();
	});

	it("ignores a publish with no map name — a feature with no map is unscopeable", () => {
		publishMapFeatures("", [{ feature_id: "x-1", feature_type: "zone" }]);
		expect(hasMapFeatures("")).toBe(false);
	});

	it("skips rows with no feature_id", () => {
		publishMapFeatures("epsilon", [
			{ feature_id: "", name: "Nameless", feature_type: "zone" },
			{ feature_id: "e-1", feature_type: "zone" },
		]);
		expect(getMapFeatures("epsilon").map((f) => f.feature_id)).toEqual([
			"e-1",
		]);
	});

	it("names the three asset types and nothing else", () => {
		expect(isAssetFeatureType("waypoint")).toBe(true);
		expect(isAssetFeatureType("zone")).toBe(true);
		expect(isAssetFeatureType("cue")).toBe(true);
		expect(isAssetFeatureType("road")).toBe(false);
		expect(isAssetFeatureType("geofence")).toBe(false);
		expect(isAssetFeatureType(undefined)).toBe(false);
	});
});

/**
 * The seam the whole "asset list tracks the map" change exists for: what the
 * mission map publishes is exactly what the graph compiler needs to CHECK a
 * COVERAGE action against the asset it sweeps.
 *
 * ⚠ This used to assert that a published zone derived `behavior: COVERAGE`.
 * It no longer does, and the inversion is deliberate: NAVIGATE and COVERAGE
 * are ACTION NODES, so behaviour is read off the graph's intent, never
 * inferred from the geometry a node happens to reference. The published types
 * are still load-bearing here — they are what turns "this COVERAGE action
 * sweeps a waypoint" from a mission that is dispatched and never moves into a
 * compile error.
 */
describe("published map features feed the graph compiler", () => {
	afterEach(() => {
		__resetMapFeatures();
	});

	it("catches a COVERAGE action aimed at a waypoint, using the published types", () => {
		publishMapFeatures("florennes", [
			{ feature_id: "z-1", name: "North field", feature_type: "zone" },
			{ feature_id: "w-1", name: "Rally", feature_type: "waypoint" },
		]);

		/** agent → COVERAGE action → one asset. */
		const sweepOf = (featureId: string) => ({
			version: MISSION_GRAPH_VERSION,
			nodes: [
				{
					id: "a",
					kind: "agent" as const,
					label: "Rover",
					position: { x: 0, y: 0 },
					agent_id: "agent-1",
				},
				{
					id: "act",
					kind: "action" as const,
					label: "Sweep",
					position: { x: 0, y: 0 },
					action: "COVERAGE" as const,
				},
				{
					id: "s",
					kind: "asset" as const,
					label: "Target",
					position: { x: 0, y: 0 },
					feature_id: featureId,
				},
			],
			edges: [
				{ id: "e1", source: "a", target: "act", kind: "exec" as const },
				{ id: "e2", source: "act", target: "s", kind: "exec" as const },
			],
		});

		const types = getMapFeatureTypes("florennes");

		// Sweeping the published ZONE: clean.
		const overZone = compileMissionGraph(sweepOf("z-1"), types);
		expect(
			overZone.issues.filter((issue) => issue.severity === "error"),
		).toEqual([]);

		// Sweeping the published WAYPOINT: an error, because the planner would
		// accept it, dispatch it and return an empty route for every agent.
		const overWaypoint = compileMissionGraph(sweepOf("w-1"), types);
		expect(
			overWaypoint.issues.some((issue) => issue.severity === "error"),
		).toBe(true);

		// Against a map that never published, the types are unknown — and an
		// unknown type must NOT manufacture a confident error on a mission that
		// is probably fine.
		const unknown = compileMissionGraph(
			sweepOf("w-1"),
			getMapFeatureTypes("unpublished"),
		);
		expect(
			unknown.issues.filter((issue) => issue.severity === "error"),
		).toEqual([]);
	});

	it("reads behaviour off the ACTION node, not the geometry it references", () => {
		publishMapFeatures("florennes", [
			{ feature_id: "z-1", name: "North field", feature_type: "zone" },
		]);
		// An agent pointed straight at a zone, with no action node saying what to
		// do with it, is NAVIGATE — however zone-shaped the asset is.
		const noAction = {
			version: MISSION_GRAPH_VERSION,
			nodes: [
				{
					id: "a",
					kind: "agent" as const,
					label: "Rover",
					position: { x: 0, y: 0 },
					agent_id: "agent-1",
				},
				{
					id: "s",
					kind: "asset" as const,
					label: "North",
					position: { x: 0, y: 0 },
					feature_id: "z-1",
				},
			],
			edges: [
				{ id: "e", source: "a", target: "s", kind: "exec" as const },
			],
		};
		expect(
			compileMissionGraph(noAction, getMapFeatureTypes("florennes"))
				.behavior,
		).toBe(MissionBehavior.NAVIGATE);
	});

	it("a zone drawn on the map reaches the asset list on the next publish", () => {
		// The operator's complaint, at the seam: the map refetches after a
		// save and republishes; the editor reads the catalogue, not a list it
		// fetched once on mount.
		publishMapFeatures("florennes", [
			{ feature_id: "w-1", name: "Rally", feature_type: "waypoint" },
		]);
		expect(getMapAssetFeatures("florennes")).toHaveLength(1);
		publishMapFeatures("florennes", [
			{ feature_id: "w-1", name: "Rally", feature_type: "waypoint" },
			{ feature_id: "z-9", name: "New sweep", feature_type: "zone" },
		]);
		expect(getMapAssetFeatures("florennes").map((f) => f.name)).toEqual([
			"Rally",
			"New sweep",
		]);
		expect(getMapFeatureTypes("florennes")["z-9"]).toBe("zone");
	});
});

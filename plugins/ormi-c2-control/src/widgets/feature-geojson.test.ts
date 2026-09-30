import { describe, expect, it } from "bun:test";

import {
	FEATURE_TYPES,
	FEATURE_TYPE_GEOMETRY,
	FEATURE_TYPE_LABELS,
	c2FeatureToDrawFeature,
	canRetypeFeature,
	drawFeatureToC2Feature,
	isFeatureType,
	readFeatureCategory,
	readFeatureId,
	retypeTargets,
	type DrawFeature,
	type FeatureType,
} from "./feature-geojson";

/** A drawn polygon with explicit [lng, lat] coordinates. */
const drawnPolygon: DrawFeature = {
	type: "Feature",
	properties: {},
	geometry: {
		type: "Polygon",
		coordinates: [
			[
				[4.39, 50.84],
				[4.4, 50.84],
				[4.4, 50.85],
				[4.39, 50.84],
			],
		],
	},
};

const drawnPoint: DrawFeature = {
	type: "Feature",
	properties: {},
	geometry: { type: "Point", coordinates: [4.39, 50.84] },
};

describe("drawFeatureToC2Feature", () => {
	it("preserves [lng, lat] coordinates verbatim (no swap)", () => {
		const feature = drawFeatureToC2Feature(drawnPolygon, {
			name: "Zone A",
			feature_type: "geofence",
		});
		expect(feature.geometry?.type).toBe("Polygon");
		expect(feature.geometry?.coordinates).toEqual([
			[
				[4.39, 50.84],
				[4.4, 50.84],
				[4.4, 50.85],
				[4.39, 50.84],
			],
		]);
	});

	it("generates a feature_id on create when none supplied", () => {
		const feature = drawFeatureToC2Feature(drawnPoint, {
			name: "POI",
			feature_type: "poi",
		});
		const id = feature.properties?.feature_id;
		expect(typeof id).toBe("string");
		expect((id as string).length).toBeGreaterThan(0);
	});

	it("preserves the supplied feature_id on edit", () => {
		const feature = drawFeatureToC2Feature(drawnPoint, {
			name: "POI",
			feature_type: "poi",
			feature_id: "fixed-id-123",
		});
		expect(feature.properties?.feature_id).toBe("fixed-id-123");
	});

	it("carries name and feature_type into properties", () => {
		const feature = drawFeatureToC2Feature(drawnPolygon, {
			name: "Zone A",
			feature_type: "geofence",
		});
		expect(feature.properties?.name).toBe("Zone A");
		expect(feature.properties?.feature_type).toBe("geofence");
		expect(feature.type).toBe("Feature");
	});

	it("mints distinct ids across two creates", () => {
		const a = drawFeatureToC2Feature(drawnPoint, {
			name: "a",
			feature_type: "poi",
		});
		const b = drawFeatureToC2Feature(drawnPoint, {
			name: "b",
			feature_type: "poi",
		});
		expect(a.properties?.feature_id).not.toBe(b.properties?.feature_id);
	});
});

describe("readFeatureId", () => {
	it("reads the persisted feature_id", () => {
		expect(
			readFeatureId({
				type: "Feature",
				properties: { feature_id: "abc" },
				geometry: { type: "Point", coordinates: [0, 0] },
			}),
		).toBe("abc");
	});

	it("returns null when absent", () => {
		expect(
			readFeatureId({
				type: "Feature",
				geometry: { type: "Point", coordinates: [0, 0] },
			}),
		).toBeNull();
	});
});

describe("c2FeatureToDrawFeature", () => {
	it("round-trips a feature back to draw form preserving id and [lng,lat]", () => {
		const saved = drawFeatureToC2Feature(drawnPolygon, {
			name: "Zone A",
			feature_type: "geofence",
			feature_id: "round-trip-1",
		});
		const drawn = c2FeatureToDrawFeature(saved);
		expect(drawn).not.toBeNull();
		expect(drawn?.geometry.type).toBe("Polygon");
		expect(drawn?.geometry.coordinates).toEqual(
			drawnPolygon.geometry.coordinates,
		);
		expect((drawn?.properties as Record<string, unknown>).feature_id).toBe(
			"round-trip-1",
		);
		expect((drawn?.properties as Record<string, unknown>).name).toBe(
			"Zone A",
		);
	});

	it("returns null for an unusable geometry", () => {
		expect(
			c2FeatureToDrawFeature({
				type: "Feature",
				properties: { feature_id: "x" },
				geometry: { type: "GeometryCollection" },
			}),
		).toBeNull();
		expect(
			c2FeatureToDrawFeature({
				type: "Feature",
				properties: {},
			}),
		).toBeNull();
	});
});

describe("asset properties survive the round trip", () => {
	/** A geofence as MapDB now stores one: three identity fields plus data. */
	const storedWaypoint = {
		type: "Feature" as const,
		properties: {
			feature_id: "wp-1",
			name: "Holding Alpha",
			feature_type: "waypoint",
			category: "holding",
			// A property this build does not model at all. The server keeps it
			// (strict:false on the property sub-schema); the client used to
			// throw it away on the first edit.
			required_standoff_m: 12,
			sensor: { modality: "EMI", swath_m: 1.2 },
		},
		geometry: { type: "Point", coordinates: [4.39, 50.84] },
	};

	it("carries category out to the saved feature", () => {
		const saved = drawFeatureToC2Feature(drawnPoint, {
			name: "Holding Alpha",
			feature_type: "waypoint",
			category: "holding",
		});
		expect(saved.properties?.category).toBe("holding");
		expect(saved.properties?.feature_type).toBe("waypoint");
	});

	it("an empty category REMOVES one the feature used to carry", () => {
		const saved = drawFeatureToC2Feature(drawnPoint, {
			name: "Waypoint",
			feature_type: "waypoint",
			category: "",
			properties: { category: "holding" },
		});
		expect("category" in (saved.properties ?? {})).toBe(false);
	});

	it("an absent category leaves the stored one untouched", () => {
		const saved = drawFeatureToC2Feature(drawnPoint, {
			name: "Waypoint",
			feature_type: "waypoint",
			properties: { category: "rally" },
		});
		expect(saved.properties?.category).toBe("rally");
	});

	it("keeps properties this build does not model (stored → draw → stored)", () => {
		const drawn = c2FeatureToDrawFeature(storedWaypoint);
		expect(drawn).not.toBeNull();
		// The bag reaches the authoring layer …
		const props = drawn?.properties as Record<string, unknown>;
		expect(props.required_standoff_m).toBe(12);
		expect(props.category).toBe("holding");

		// … and comes back out on save, unchanged.
		const resaved = drawFeatureToC2Feature(drawn as DrawFeature, {
			name: "Holding Alpha",
			feature_type: "waypoint",
			feature_id: "wp-1",
			category: "holding",
		});
		expect(resaved.properties?.required_standoff_m).toBe(12);
		expect(resaved.properties?.sensor).toEqual({
			modality: "EMI",
			swath_m: 1.2,
		});
		expect(resaved.properties?.feature_id).toBe("wp-1");
	});

	it("never persists terra-draw's own bookkeeping", () => {
		// A live terra-draw snapshot feature carries the mode it was drawn in,
		// its tracked timestamps and its selection state. None of that is the
		// operator's data, and writing it to MapDB would make every saved asset
		// carry four keys nothing reads.
		const fromTerraDraw: DrawFeature = {
			type: "Feature",
			properties: {
				mode: "point",
				createdAt: 1758000000000,
				updatedAt: 1758000000001,
				selected: true,
				midPoint: false,
				category: "holding",
			},
			geometry: { type: "Point", coordinates: [4.39, 50.84] },
		};
		const saved = drawFeatureToC2Feature(fromTerraDraw, {
			name: "Holding Alpha",
			feature_type: "waypoint",
		});
		const keys = Object.keys(saved.properties ?? {});
		expect(keys).not.toContain("mode");
		expect(keys).not.toContain("createdAt");
		expect(keys).not.toContain("updatedAt");
		expect(keys).not.toContain("selected");
		expect(keys).not.toContain("midPoint");
		// … while the operator's own property is kept.
		expect(saved.properties?.category).toBe("holding");
	});

	it("never lets a pass-through property spoof the identity fields", () => {
		const saved = drawFeatureToC2Feature(drawnPoint, {
			name: "Real name",
			feature_type: "waypoint",
			feature_id: "real-id",
			properties: {
				feature_id: "spoofed",
				name: "spoofed",
				feature_type: "risk",
			},
		});
		expect(saved.properties?.feature_id).toBe("real-id");
		expect(saved.properties?.name).toBe("Real name");
		expect(saved.properties?.feature_type).toBe("waypoint");
	});

	it("reads a category off a stored feature, and null when blank", () => {
		expect(readFeatureCategory(storedWaypoint)).toBe("holding");
		expect(
			readFeatureCategory({ properties: { category: "  " } }),
		).toBeNull();
		expect(readFeatureCategory({ properties: {} })).toBeNull();
		expect(readFeatureCategory({})).toBeNull();
	});
});

describe("the feature-type table", () => {
	it("lists exactly what the C2 accepts", () => {
		// Mirrors `VALID_FEATURE_TYPES` in the MapDB server. The three asset
		// types (waypoint / zone / cue) are the ones the behaviour graph names
		// by feature_id.
		expect([...FEATURE_TYPES]).toEqual([
			"road",
			"geofence",
			"risk",
			"waypoint",
			"zone",
			"cue",
		]);
	});

	it("gives every type the geometry the server validates it against", () => {
		// `GEOM_FOR_TYPE` server-side. A type whose toolbar geometry disagrees
		// lets the operator finish a draw the save is certain to reject.
		expect(FEATURE_TYPE_GEOMETRY).toEqual({
			road: "line",
			geofence: "polygon",
			risk: "polygon",
			waypoint: "point",
			zone: "polygon",
			cue: "point",
		});
		for (const type of FEATURE_TYPES) {
			expect(FEATURE_TYPE_LABELS[type].length).toBeGreaterThan(0);
		}
	});

	it("recognises only those types", () => {
		for (const type of FEATURE_TYPES)
			expect(isFeatureType(type)).toBe(true);
		expect(isFeatureType("poi")).toBe(false);
		expect(isFeatureType("")).toBe(false);
		expect(isFeatureType(undefined)).toBe(false);
	});
});

/**
 * Re-typing an asset is a `PUT` through the backend's `normalizeFeature`, which
 * validates the new `feature_type` against `GEOM_FOR_TYPE`. So a retype is legal
 * only WITHIN a geometry class. The rule is derived from
 * {@link FEATURE_TYPE_GEOMETRY} rather than written out twice — these assert the
 * derivation, because a second hardcoded list is how a client starts offering a
 * save the server rejects.
 */
describe("retype legality (same geometry class only)", () => {
	it("offers the other AREA types for an area asset, itself included", () => {
		expect(retypeTargets("geofence")).toEqual(["geofence", "risk", "zone"]);
		expect(retypeTargets("risk")).toEqual(["geofence", "risk", "zone"]);
		expect(retypeTargets("zone")).toEqual(["geofence", "risk", "zone"]);
	});

	it("offers the other POINT types for a point asset", () => {
		expect(retypeTargets("waypoint")).toEqual(["waypoint", "cue"]);
		expect(retypeTargets("cue")).toEqual(["waypoint", "cue"]);
	});

	it("offers a road only itself — it is the sole line type", () => {
		expect(retypeTargets("road")).toEqual(["road"]);
	});

	it("refuses every cross-class retype, in both directions", () => {
		for (const from of FEATURE_TYPES) {
			for (const to of FEATURE_TYPES) {
				const sameClass =
					FEATURE_TYPE_GEOMETRY[from] === FEATURE_TYPE_GEOMETRY[to];
				expect(canRetypeFeature(from, to)).toBe(sameClass);
			}
		}
		// The cases an operator actually reaches for.
		expect(canRetypeFeature("waypoint", "road")).toBe(false);
		expect(canRetypeFeature("geofence", "waypoint")).toBe(false);
		expect(canRetypeFeature("road", "zone")).toBe(false);
	});

	it("is reflexive — a rename that leaves the type alone is legal", () => {
		for (const type of FEATURE_TYPES) {
			expect(canRetypeFeature(type, type)).toBe(true);
		}
	});

	it("agrees with itself: every target it offers is one it permits", () => {
		for (const type of FEATURE_TYPES) {
			const targets: FeatureType[] = retypeTargets(type);
			expect(targets).toContain(type);
			for (const target of targets) {
				expect(canRetypeFeature(type, target)).toBe(true);
			}
			// …and everything it did NOT offer is refused.
			for (const other of FEATURE_TYPES) {
				if (targets.includes(other)) continue;
				expect(canRetypeFeature(type, other)).toBe(false);
			}
		}
	});

	it("follows FEATURE_TYPES order, so the picker never reshuffles", () => {
		const order = [...FEATURE_TYPES];
		for (const type of FEATURE_TYPES) {
			const targets = retypeTargets(type);
			const indices = targets.map((t) => order.indexOf(t));
			expect(indices).toEqual([...indices].sort((a, b) => a - b));
		}
	});
});

/**
 * Topic resolution.
 *
 * The failure this guards against is quiet: picking the alert stream as the
 * timebase, or an `offset_removed` topic as the pre-removal signal, produces a
 * run that looks right and describes something else.
 */

import { describe, expect, it } from "bun:test";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";
import {
	bundleKey,
	emiCapableDatasources,
	pickDatasource,
	resolveEmiTopics,
} from "../emi-topics";

/**
 * A topic as `AVAILABLE_TOPICS` reports it.
 *
 * `datasource_id` is the **instance** id, not the definition id — every plugin
 * worker sets it from `settings.id`, which core mints as `datasource_<uuid>`.
 * The fixture used to carry the definition id here, which is a value the
 * runtime never produces, and it let a bug that compared against a definition
 * id pass its tests while being false in every browser.
 */
const topic = (
	name: string,
	rawType: string,
	dsId = "ds-1",
	type = rawType,
	extra: Record<string, unknown> = {},
): DatasourceTopic => ({
	topic: name,
	datasource_id: dsId,
	source: { id: dsId, title: `source ${dsId}`, enable: true, ...extra },
	type,
	rawType,
});

const FULL = [
	topic("/teodora/emi/gnss", "emi_msgs/msg/EMIGnss"),
	topic("/teodora/emi/gnss/alert", "emi_msgs/msg/EMIGnss"),
	topic("/teodora/emi/targets", "emi_msgs/msg/EMITargetList"),
	topic("/teodora/emi/proposed/targets", "emi_msgs/msg/EMITargetList"),
	topic("/teodora/emi/targets/new", "emi_msgs/msg/EMITarget"),
	topic(
		"/teodora/xsens/gnss",
		"sensor_msgs/msg/NavSatFix",
		"ds-1",
		"GeolocationPosition",
	),
	topic(
		"/teodora/xsens/filter/quaternion",
		"geometry_msgs/msg/QuaternionStamped",
	),
	topic("/tf_static", "tf2_msgs/msg/TFMessage"),
	topic("/tf", "tf2_msgs/msg/TFMessage"),
	topic("/emi/raw", "emi_msgs/msg/EMI"),
	topic("/emi/offset_removed", "emi_msgs/msg/EMI"),
	topic("/emi/offset_removed/filtered", "emi_msgs/msg/EMI"),
];

describe("replay provenance", () => {
	// Every archived run and every exported survey is stamped `bag` or
	// `mission` from this flag. Getting it wrong is not visible anywhere in the
	// cockpit — it only shows up later, in a GeoJSON claiming a replayed
	// recording was collected live.
	it("reads a recording off the settings, not off an id", () => {
		const replayed = FULL.map((t) =>
			topic(t.topic, t.rawType!, "ds-1", t.type, {
				bagName: "survey_2026_08_12.db3",
			}),
		);
		const b = resolveEmiTopics(replayed, "ds-1")!;
		expect(b.isReplay).toBe(true);
		expect(b.recording).toBe("survey_2026_08_12.db3");
	});

	it("calls a source with no recording live", () => {
		const b = resolveEmiTopics(FULL, "ds-1")!;
		expect(b.isReplay).toBe(false);
		expect(b.recording).toBe("");
	});
});

describe("resolveEmiTopics", () => {
	it("takes the non-alert EMIGnss stream as the timebase", () => {
		const b = resolveEmiTopics(FULL, "ds-1")!;
		expect(b.primary.topic).toBe("/teodora/emi/gnss");
		expect(b.alert?.topic).toBe("/teodora/emi/gnss/alert");
	});

	it("subscribes both trackers but not the single-target companions", () => {
		const b = resolveEmiTopics(FULL, "ds-1")!;
		expect(b.targets.map((t) => t.topic).sort()).toEqual([
			"/teodora/emi/proposed/targets",
			"/teodora/emi/targets",
		]);
	});

	it("takes /emi/raw and not another topic of the same type", () => {
		const b = resolveEmiTopics(FULL, "ds-1")!;
		// Three topics carry emi_msgs/msg/EMI; only one is the head of the
		// pipeline, and choosing another would make the walkthrough's first
		// stage show a subtraction of nothing.
		expect(b.raw?.topic).toBe("/emi/raw");
	});

	it("takes tf_static and not tf", () => {
		expect(resolveEmiTopics(FULL, "ds-1")!.tfStatic?.topic).toBe(
			"/tf_static",
		);
	});

	it("finds the fix by webapp type when the converter has renamed it", () => {
		const b = resolveEmiTopics(FULL, "ds-1")!;
		expect(b.fix?.topic).toBe("/teodora/xsens/gnss");
	});

	it("returns null for a datasource with no primary topic", () => {
		expect(resolveEmiTopics(FULL, "ds-2")).toBeNull();
	});

	it("never mixes two datasources into one bundle", () => {
		const mixed = [
			...FULL,
			topic("/teodora/emi/gnss", "emi_msgs/msg/EMIGnss", "ds-2"),
			topic("/tf_static", "tf2_msgs/msg/TFMessage", "ds-2"),
		];
		const b = resolveEmiTopics(mixed, "ds-2")!;
		expect(b.datasourceId).toBe("ds-2");
		expect(b.tfStatic?.source.id).toBe("ds-2");
		// Two timebases interleaved into one monotonic column is the failure
		// this scoping exists to prevent.
		expect(b.alert).toBeUndefined();
	});
});

describe("pickDatasource", () => {
	it("lists only sources offering a usable timebase", () => {
		const mixed = [
			topic(
				"/teodora/emi/gnss/alert",
				"emi_msgs/msg/EMIGnss",
				"alerts-only",
			),
			...FULL,
		];
		expect(emiCapableDatasources(mixed).map((c) => c.id)).toEqual(["ds-1"]);
	});

	it("honours a pinned source and ignores one that cannot serve", () => {
		const two = [
			...FULL,
			topic("/teodora/emi/gnss", "emi_msgs/msg/EMIGnss", "ds-2"),
		];
		expect(pickDatasource(two, "ds-2")).toBe("ds-2");
		expect(pickDatasource(two, "ds-nope")).toBe("ds-1");
		expect(pickDatasource([], "ds-1")).toBeNull();
	});
});

describe("bundleKey", () => {
	it("is stable across re-resolution, so discovery does not restart the run", () => {
		const a = resolveEmiTopics(FULL, "ds-1");
		const b = resolveEmiTopics([...FULL].reverse(), "ds-1");
		expect(bundleKey(a)).toBe(bundleKey(b));
	});

	it("changes when a topic appears", () => {
		const without = FULL.filter((t) => t.topic !== "/emi/raw");
		expect(bundleKey(resolveEmiTopics(without, "ds-1"))).not.toBe(
			bundleKey(resolveEmiTopics(FULL, "ds-1")),
		);
	});
});

describe("the robot fix", () => {
	/**
	 * The live graph that exposed this: the tracker publishes its placed
	 * detections as a second `NavSatFix`, so type alone picks a winner by
	 * enumeration order.
	 */
	const TARGET_GNSS = topic(
		"/teodora/emi/target_gnss",
		"sensor_msgs/msg/NavSatFix",
		"ds-1",
		"GeolocationPosition",
	);

	it("binds the antenna, not the tracker's placed detections", () => {
		const bundle = resolveEmiTopics([...FULL, TARGET_GNSS], "ds-1");
		expect(bundle?.fix?.topic).toBe("/teodora/xsens/gnss");
	});

	it("does not depend on enumeration order", () => {
		// Wire order, and it differs between connects — which is what made the
		// original bug intermittent rather than simply wrong.
		const first = resolveEmiTopics([TARGET_GNSS, ...FULL], "ds-1");
		const last = resolveEmiTopics([...FULL, TARGET_GNSS], "ds-1");
		expect(first?.fix?.topic).toBe("/teodora/xsens/gnss");
		expect(last?.fix?.topic).toBe("/teodora/xsens/gnss");
		expect(bundleKey(first)).toBe(bundleKey(last));
	});

	it("leaves the fix unbound rather than binding an EMI-owned stream", () => {
		// No antenna on this graph. Reconstruction from coil 0 is correct and
		// is reported as `fixReconstructed`; a tracker output as the robot's
		// own position is neither.
		const noAntenna = FULL.filter((t) => t.topic !== "/teodora/xsens/gnss");
		const bundle = resolveEmiTopics([...noAntenna, TARGET_GNSS], "ds-1");
		expect(bundle).not.toBeNull();
		expect(bundle?.fix).toBeUndefined();
	});

	it("still resolves an antenna this robot happens to name differently", () => {
		const noAntenna = FULL.filter((t) => t.topic !== "/teodora/xsens/gnss");
		const bundle = resolveEmiTopics(
			[
				...noAntenna,
				TARGET_GNSS,
				topic("/teodora/gps/fix", "sensor_msgs/msg/NavSatFix"),
			],
			"ds-1",
		);
		expect(bundle?.fix?.topic).toBe("/teodora/gps/fix");
	});
});

describe("lossless declaration", () => {
	/**
	 * A coalescing datasource delivers latest-per-drain-tick unless the consumer
	 * says otherwise, and a run built from a decimated stream is not coarser —
	 * it is short and looks complete.
	 */
	it("marks the streams the run is built from", () => {
		const bundle = resolveEmiTopics(FULL, "ds-1");
		expect(bundle?.primary.lossless).toBe(true);
		expect(bundle?.alert?.lossless).toBe(true);
		expect(bundle?.targets.length).toBeGreaterThan(0);
		for (const t of bundle!.targets) expect(t.lossless).toBe(true);
	});

	it("leaves the latest-wins topics alone", () => {
		// `fix`, `quaternion` and `raw` are read once per primary sample and
		// overwritten, so lossless delivery buys nothing and costs a decode per
		// message. `/tf_static` is a delta stream the coalescer classifies itself.
		const bundle = resolveEmiTopics(FULL, "ds-1");
		expect(bundle?.fix?.lossless).toBeUndefined();
		expect(bundle?.quaternion?.lossless).toBeUndefined();
		expect(bundle?.raw?.lossless).toBeUndefined();
		expect(bundle?.tfStatic?.lossless).toBeUndefined();
	});

	it("does not change the bundle's identity", () => {
		// `bundleKey` decides whether discovery restarts the run. A transport
		// hint is not a change of source.
		expect(bundleKey(resolveEmiTopics(FULL, "ds-1"))).toBe(
			`ds-1|${[
				"",
				"/teodora/emi/gnss",
				"/teodora/emi/gnss/alert",
				"/teodora/emi/proposed/targets",
				"/teodora/emi/targets",
				"/teodora/xsens/gnss",
				"/teodora/xsens/filter/quaternion",
				"/tf_static",
				"/emi/raw",
			].join(",")}`,
		);
	});
});

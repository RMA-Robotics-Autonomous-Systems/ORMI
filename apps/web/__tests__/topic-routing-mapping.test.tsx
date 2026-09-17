/**
 * Registry-level invariant: what a clicked topic actually opens.
 *
 * `resolveTopicRoute` is unit-tested against fixtures in `ormi-core`, which
 * pins the *rules*. This pins the **answer**, against the definitions the build
 * really ships and the `TOPIC_ROUTING_CLAIMS` the plugins really register — the
 * two things fixtures cannot see.
 *
 * It exists because every routing mistake an operator reported came from the
 * same place: a plugin's `accepts` list was honest in isolation and wrong in
 * company. An airspeed gauge genuinely reads a `Movement`, and being the only
 * widget that did made it the silent answer to every `/cmd_vel` click. Nothing
 * in that plugin was wrong; the *registry* was. So the assertion has to be made
 * where the registry is assembled, and it has to be made on the decision rather
 * than on any one declaration.
 *
 * A failure here is not necessarily a bug — adding a widget legitimately
 * changes what an ambiguous type resolves to. It means the mapping moved, and
 * somebody should agree that it moved in the right direction.
 */

import { test, expect, mock } from "bun:test";
import React from "react";
import {
	buildTopicClaimIndex,
	getTopicRoutingIndex,
	resolveTopicRoute,
	resetTopicRoutingIndexCache,
	type TopicClaimIndex,
	type TopicRoutingClaims,
} from "@workspace/ormi-core/widgets";
import type { WidgetDefinition } from "@workspace/ormi-core/widgets";
import type { DatasourceTopic } from "@workspace/ormi-core/datasources";

/** Widget definitions plus the routing claims the same plugins register. */
interface Registry {
	definitions: WidgetDefinition[];
	declared: TopicRoutingClaims;
	claims: TopicClaimIndex;
}

/**
 * Build the registry the dashboard builds.
 *
 * Mirrors `definition-defaults.test.tsx`: instantiate every plugin in the
 * generated registry, build a real `PluginsManager`, and apply the filters
 * inside a React render, because definition factories may call hooks.
 *
 * @returns Every registered widget definition, the claims as the plugins wrote
 * them, and the same claims resolved against that registry.
 */
async function collectRegistry(): Promise<Registry> {
	const pluginsModule = await import("@workspace/ormi-plugins");
	const { PluginsManager, PluginsHooks } = pluginsModule;
	type Plugin = InstanceType<typeof pluginsModule.Plugin>;

	const registry = (await import("../ormi-plugins")).default;

	const plugins = new Map<string, Plugin>();
	for (const pluginPromise of Object.values(registry)) {
		const loaded = (await pluginPromise) as unknown as {
			default: new () => Plugin & { name: string };
		};
		const instance = new loaded.default();
		plugins.set(instance.name, instance);
	}

	const manager = new PluginsManager(plugins);

	await mock.module("@workspace/ormi-plugins", () => ({
		...pluginsModule,
		usePluginsManager: () => manager,
	}));

	const { renderToStaticMarkup } = await import("react-dom/server");

	let definitions: WidgetDefinition[] = [];
	let declared: TopicRoutingClaims = [];
	const Probe: React.FC = () => {
		definitions = manager.applyFilter<WidgetDefinition[]>(
			PluginsHooks.WIDGETS_LIST,
			[],
		);
		declared = manager.applyFilter<TopicRoutingClaims>(
			PluginsHooks.TOPIC_ROUTING_CLAIMS,
			[],
		);
		return null;
	};
	renderToStaticMarkup(React.createElement(Probe));

	resetTopicRoutingIndexCache();
	return {
		definitions,
		declared,
		claims: buildTopicClaimIndex(
			declared,
			getTopicRoutingIndex(definitions),
		),
	};
}

/** A topic as a datasource would report it. */
const topic = (name: string, type: string): DatasourceTopic => ({
	topic: name,
	datasource_id: "ds-1",
	source: { id: "ds-1", title: "Robot", enable: true },
	type,
	rawType: "",
});

/**
 * Resolve a topic against the real registry on an empty dashboard.
 *
 * @param registry - Collected definitions and claims.
 * @param name - Topic name.
 * @param type - Webapp topic type.
 * @returns The routing decision.
 */
function routeOnEmptyDashboard(registry: Registry, name: string, type: string) {
	return resolveTopicRoute({
		topic: topic(name, type),
		claims: registry.claims,
		widgets: new Map(),
	});
}

test("a /cmd_vel click asks, and offers the control that publishes it", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(registry, "/cmd_vel", "Movement");

	// Never automatic: `Movement` covers a commanded velocity and a measured
	// one alike, and a gauge shown for a command reads as a measurement of
	// something nothing measured.
	expect(decision.kind).toBe("ask");
	if (decision.kind !== "ask") return;

	const commands = decision.options.filter(
		(option) => option.direction === "publish",
	);
	expect(commands.length).toBeGreaterThan(0);

	// A display always leads the list; a control is never the first thing
	// offered for a topic click.
	expect(decision.options[0]!.direction).toBe("subscribe");
});

test("an IMU topic opens an attitude indicator, not the map", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(registry, "/imu/data", "IMU");

	// The map's IMU layer also needs a GPS origin no automatic placement can
	// choose, so routing there produced a half-configured entry that crashed.
	expect(decision.kind).toBe("create");
	if (decision.kind !== "create") return;
	expect(decision.option.widgetId).toBe("level-widget");
});

test("an occupancy grid opens the 2D grid viewer, not the 3D scene", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(registry, "/map", "MapGrid");

	expect(decision.kind).toBe("create");
	if (decision.kind !== "create") return;
	expect(decision.option.widgetId).toBe("map-grid-viewer");
});

test("an image topic opens the plain viewer, not the WebRTC one", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(
		registry,
		"/camera/image_raw",
		"Image",
	);

	// Stated by a claim rather than inferred. It used to come out right
	// by arithmetic: the WebRTC slot listed two raw schema names in `accepts`,
	// both misspelled and therefore matching nothing, and the only thing they
	// did was make that slot look three times more specific than this one —
	// so fixing the typo alone would have moved the mapping. The WebRTC viewer
	// needs a video server beside the robot and shows a "stream failed" card
	// where there is not one, so it is an option and not the answer.
	expect(decision.kind).toBe("create");
	if (decision.kind !== "create") return;
	expect(decision.option.widgetId).toBe("image-viewer-widget");
});

test("an unconverted image schema still reaches the image viewer", async () => {
	const registry = await collectRegistry();
	const decision = resolveTopicRoute({
		topic: {
			...topic("/camera/image_raw", ""),
			rawType: "sensor_msgs/msg/Image",
		},
		claims: registry.claims,
		widgets: new Map(),
	});

	expect(decision.kind).toBe("create");
	if (decision.kind !== "create") return;
	expect(decision.option.widgetId).toBe("image-viewer-widget");
});

test("a bare vector opens the readout", async () => {
	const registry = await collectRegistry();

	for (const type of ["Vector2", "Vector3", "Vector4"]) {
		const decision = routeOnEmptyDashboard(registry, "/imu/mag", type);

		// Before the readout existed, a vector's only answers were a raw JSON
		// viewer and an instrument that reinterprets it as something else —
		// the speed indicator reads a `Vector3` as knots. All three are
		// claimed by the readout; the speed indicator claims `Vector3` as an
		// alternative.
		expect(decision.kind).toBe("create");
		if (decision.kind !== "create") return;
		expect(decision.option.widgetId).toBe("vector-readout-widget");
	}
});

test("a pose asks, and now has a display to offer", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(registry, "/goal_pose", "Pose");

	// It used to answer "no widget displays 'Pose' — only controls that
	// command it", because the only `Pose` slot in the registry was the 3D
	// scene's goal publisher. Both attitude indicators read the single
	// `orientation` a `Pose` carries, so both claim it — as alternatives,
	// because a `Pose` carries a position too and neither instrument shows
	// that, so neither is the destination for one.
	expect(decision.kind).toBe("ask");
	if (decision.kind !== "ask") return;

	const displays = decision.options.filter(
		(option) => option.direction === "subscribe",
	);
	expect(displays.map((option) => option.widgetId)).toEqual(
		expect.arrayContaining(["level-widget", "heading-widget"]),
	);
	expect(decision.options[0]!.direction).toBe("subscribe");
});

test("a point cloud opens the 3D scene, which the next click can append to", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(
		registry,
		"/velodyne_points",
		"PointsCloud",
	);

	expect(decision.kind).toBe("create");
	if (decision.kind !== "create") return;
	expect(decision.option.widgetId).toBe("std-scene-3d");
	expect(decision.option.slot?.isArray).toBe(true);
});

test("a number topic opens a chart", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(
		registry,
		"/battery/voltage",
		"number",
	);

	expect(decision.kind).toBe("create");
	if (decision.kind !== "create") return;
	expect(decision.option.slot?.isArray).toBe(true);
});

test("every claim the plugins register resolves against the widgets they ship", async () => {
	const registry = await collectRegistry();

	// A claim names a widget id and a slot path as strings, so it rots
	// silently: rename an array in a uischema, retire a widget, flip a slot to
	// `publish`, and the claim is simply dropped and the topic stops opening
	// anything. The index drops and warns rather than crashing, which is right
	// at runtime and useless as a signal, so the signal is here.
	const resolved = new Set(
		[...registry.claims.byType.values()]
			.flat()
			.concat(registry.claims.fallbacks)
			.map((entry) => entry.claim),
	);

	const dropped = registry.declared
		.filter((claim) => !resolved.has(claim))
		.map((claim) => `${claim.type} -> ${claim.widgetId}.${claim.slot}`);

	expect(registry.declared.length).toBeGreaterThan(0);
	expect(dropped).toEqual([]);
});

test("no topic type is ever answered automatically with a control", async () => {
	const registry = await collectRegistry();

	// Every type any registered slot declares, plus every type a plugin
	// claims, so this widens on its own as plugins are added rather than
	// pinning a list that goes stale.
	const declared = new Set<string>();
	for (const claim of registry.declared) {
		if (claim.type !== "*") declared.add(claim.type);
	}
	for (const definition of registry.definitions) {
		const walk = (node: unknown): void => {
			if (!node || typeof node !== "object") return;
			const element = node as {
				type?: string;
				options?: { dataRequirements?: { accepts?: string[] } };
				elements?: unknown[];
			};
			for (const accepted of element.options?.dataRequirements?.accepts ??
				[]) {
				if (accepted !== "*") declared.add(accepted);
			}
			(element.elements ?? []).forEach(walk);
			const detail = (element.options as { detail?: unknown } | undefined)
				?.detail;
			if (detail) walk(detail);
		};
		walk(definition.uischema);
	}

	expect(declared.size).toBeGreaterThan(0);

	const violations: string[] = [];
	for (const type of declared) {
		const decision = routeOnEmptyDashboard(registry, "/probe", type);
		if (
			(decision.kind === "create" || decision.kind === "append") &&
			decision.option.direction === "publish"
		) {
			violations.push(`${type} -> ${decision.option.widgetName}`);
		}
	}

	expect(violations).toEqual([]);
});

test("no widget is ever offered twice for the same topic", async () => {
	const registry = await collectRegistry();

	// A plugin that ships no datasource must claim both spellings of its
	// message — the webapp type and the wire schema — because it cannot know
	// which transport the operator connects through. A topic carrying both
	// then matches both claims, and they are one destination, not two.
	const probes: [string, string][] = [
		["DiagnosticArray", "diagnostic_msgs/msg/DiagnosticArray"],
		["Image", "sensor_msgs/msg/Image"],
		["Image", "sensor_msgs/msg/CompressedImage"],
		["IMU", "sensor_msgs/msg/Imu"],
		["Movement", "geometry_msgs/msg/Twist"],
		["Vector3", "geometry_msgs/msg/Vector3Stamped"],
		["", "geometry_msgs/msg/QuaternionStamped"],
	];

	const duplicates: string[] = [];

	for (const [type, rawType] of probes) {
		const decision = resolveTopicRoute({
			topic: { ...topic("/probe", type), rawType },
			claims: registry.claims,
			widgets: new Map(),
		});

		// Guard against the test passing because nothing resolved at all: a
		// probe that reaches no widget proves nothing about duplicates.
		expect(decision.kind).not.toBe("none");
		if (decision.kind !== "ask") continue;

		const seen = new Map<string, number>();
		for (const option of decision.options) {
			// A slotless option's destination is the widget itself: it has
			// no slot to distinguish and two of them would be one answer.
			const key = `${option.widgetId}::${option.slot?.slotId ?? ""}`;
			seen.set(key, (seen.get(key) ?? 0) + 1);
		}
		for (const [key, count] of seen) {
			if (count > 1) {
				duplicates.push(`${type || rawType}: ${key} x${count}`);
			}
		}
	}

	expect(duplicates).toEqual([]);
});

test("a DiagnosticArray asks, offering the diagnostics panel and ROSTainer", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(
		registry,
		"/diagnostics",
		"DiagnosticArray",
	);

	// The type cannot say which is meant: ROSTainer's own status topic and a
	// generic /diagnostics from any ROS node are the same message. ROSTainer
	// used to be the default, so a generic diagnostics topic opened a Docker
	// container manager.
	expect(decision.kind).toBe("ask");
	if (decision.kind !== "ask") return;

	const ids = decision.options.map((option) => option.widgetId);
	expect(ids).toContain("diagnostics-widget");
	expect(ids).toContain("rostainer-status-widget");

	// The diagnostics panel discovers its own topics, so nothing is bound.
	const discovering = decision.options.find(
		(option) => option.widgetId === "diagnostics-widget",
	);
	expect(discovering?.slot).toBeUndefined();
});

test("a battery topic opens the battery panel, binding nothing", async () => {
	const registry = await collectRegistry();
	const decision = routeOnEmptyDashboard(
		registry,
		"/battery",
		"BatteryState",
	);

	expect(decision.kind).toBe("create");
	if (decision.kind !== "create") return;
	expect(decision.option.widgetId).toBe("battery-state-widget");
	expect(decision.option.slot).toBeUndefined();
});

/**
 * Which topics feed the run, and from which datasource.
 *
 * The cockpit reads six topics that always travel together on this robot, so
 * asking an operator to select each one in every widget would be six chances to
 * mis-wire a page that has exactly one correct wiring. They are resolved from
 * `AVAILABLE_TOPICS` instead, by type first and name second.
 *
 * Resolution is scoped to **one datasource**. Two EMI sources can be configured
 * at once — a live robot and a recording being compared against it — and mixing
 * their topics into one run would interleave two timebases into a single
 * monotonic column. Which one wins is the operator's choice
 * ({@link pickDatasource}), defaulting to the first that offers a primary topic.
 */

import type {
	DatasourceTopic,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { EMI_TYPES } from "../msgs/emi-types";

/**
 * Is this topic coming off a recording rather than a robot?
 *
 * Decided on the settings the topic carries, **not** on an id. `datasource_id`
 * means two different things in this codebase: on a `Datasource` record it is
 * the definition id (`teodor-emi-replay-source`), but on a `DatasourceTopic`
 * every plugin sets it to `settings.id` — the per-instance `datasource_<uuid>`
 * minted when the operator adds the source. Comparing it to a definition id is
 * therefore always false, which is exactly what it used to do, and the only
 * symptom was every replayed survey being archived and exported as if it had
 * come off the robot live.
 *
 * `bagName` is the honest discriminator: it is the replay's own setting, and no
 * live source has one.
 *
 * @param settings - The topic's `source` settings object.
 * @returns True when the topic is replayed from a recording.
 */
function isReplaySettings(settings: unknown): boolean {
	return Boolean(
		(settings as { bagName?: unknown } | null | undefined)?.bagName,
	);
}

/** ROS type of the transform tree. */
const TF_TYPE = "tf2_msgs/msg/TFMessage";
/** ROS type of the robot fix. */
const NAVSAT_TYPE = "sensor_msgs/msg/NavSatFix";
/** Webapp type the fix converter produces. */
const NAVSAT_WEBAPP = "GeolocationPosition";
/** ROS type of the heading. */
const QUAT_TYPE = "geometry_msgs/msg/QuaternionStamped";

/** The role a topic plays in building a run. */
export type EmiTopicRole =
	"primary" | "alert" | "targets" | "fix" | "quaternion" | "tfStatic" | "raw";

/** Every topic the run builder consumes, resolved against one datasource. */
export interface EmiTopicBundle {
	/** Datasource instance id every topic below belongs to. */
	datasourceId: string;
	/** Display title of that datasource. */
	datasourceTitle: string;
	/** True when the source is the replay datasource rather than a live robot. */
	isReplay: boolean;
	/**
	 * The recording currently loaded, when the source is a replay.
	 *
	 * Part of the bundle's identity: an operator opens the next recording by
	 * changing this field on the *same* datasource instance, which leaves the
	 * instance id and every topic name untouched. Without it the store would see
	 * no change, keep the run open, and concatenate two recordings into one.
	 */
	recording: string;
	/** `/teodora/emi/gnss` — the timebase. */
	primary: SelectedTopic;
	/** `/teodora/emi/gnss/alert` — what the robot detected. */
	alert?: SelectedTopic;
	/** Both tracker outputs; `EMITarget.source` says which wrote each target. */
	targets: SelectedTopic[];
	/** `/teodora/xsens/gnss`. */
	fix?: SelectedTopic;
	/** `/teodora/xsens/filter/quaternion`. */
	quaternion?: SelectedTopic;
	/** `/tf_static` — the coil rake. */
	tfStatic?: SelectedTopic;
	/** `/emi/raw` — the signal before offset removal, for the walkthrough. */
	raw?: SelectedTopic;
}

/** A topic is an alert stream if its name says so; both carry `EMIGnss`. */
const isAlertName = (name: string): boolean => /alert/i.test(name);

/** Datasource ids offering a usable primary topic, in enumeration order. */
export function emiCapableDatasources(
	available: DatasourceTopic[],
): Array<{ id: string; title: string }> {
	const seen = new Map<string, string>();
	for (const t of available) {
		if (t.rawType !== EMI_TYPES.emiGnss) continue;
		if (isAlertName(t.topic)) continue;
		const id = t.source?.id ?? t.datasource_id;
		if (!seen.has(id)) seen.set(id, t.source?.title ?? id);
	}
	return [...seen].map(([id, title]) => ({ id, title }));
}

/**
 * Choose which datasource the cockpit reads.
 *
 * @param available - Every topic `AVAILABLE_TOPICS` reports.
 * @param preferred - Operator's pinned datasource id, if any.
 * @returns The chosen id, or null when nothing offers a primary topic.
 */
export function pickDatasource(
	available: DatasourceTopic[],
	preferred?: string,
): string | null {
	const capable = emiCapableDatasources(available);
	if (capable.length === 0) return null;
	if (preferred && capable.some((c) => c.id === preferred)) return preferred;
	return capable[0]!.id;
}

/**
 * Resolve every topic the builder needs from one datasource.
 *
 * @param available - Every topic `AVAILABLE_TOPICS` reports.
 * @param datasourceId - The datasource to read; see {@link pickDatasource}.
 * @returns The bundle, or null when that datasource has no primary topic.
 */
export function resolveEmiTopics(
	available: DatasourceTopic[],
	datasourceId: string,
): EmiTopicBundle | null {
	const mine = available.filter(
		(t) => (t.source?.id ?? t.datasource_id) === datasourceId,
	);
	const select = (t: DatasourceTopic): SelectedTopic => ({
		...t,
		property: "",
	});

	const gnss = mine.filter((t) => t.rawType === EMI_TYPES.emiGnss);
	const primary = gnss.find((t) => !isAlertName(t.topic));
	if (!primary) return null;

	const settings = primary.source as unknown as Record<string, unknown>;
	return {
		datasourceId,
		datasourceTitle: primary.source?.title ?? datasourceId,
		isReplay: isReplaySettings(settings),
		recording: String(settings?.bagName ?? ""),
		primary: select(primary),
		alert: firstOrUndefined(
			gnss.filter((t) => isAlertName(t.topic)),
			select,
		),
		// Both trackers, and only the full lists: the `/new` companions carry a
		// single target each and would be counted twice, since a target on
		// `/new` is also present in the next full list.
		targets: mine
			.filter((t) => t.rawType === EMI_TYPES.targetList)
			.map(select),
		fix: firstOrUndefined(
			mine.filter(
				(t) => t.rawType === NAVSAT_TYPE || t.type === NAVSAT_WEBAPP,
			),
			select,
		),
		quaternion: firstOrUndefined(
			mine.filter((t) => t.rawType === QUAT_TYPE),
			select,
		),
		tfStatic: firstOrUndefined(
			mine.filter(
				(t) => t.rawType === TF_TYPE && /tf_static/.test(t.topic),
			),
			select,
		),
		// The head of the pipeline, before the baseline remover. Explicitly
		// `/emi/raw` rather than any `emi_msgs/EMI` topic: three of the four
		// stages publish that type, and picking `offset_removed` here would
		// make the walkthrough's first panel show a subtraction of nothing.
		raw: firstOrUndefined(
			mine.filter(
				(t) =>
					t.rawType === EMI_TYPES.emi && /\/emi\/raw$/.test(t.topic),
			),
			select,
		),
	};
}

/** First element mapped, or undefined. */
function firstOrUndefined<T, U>(
	items: T[],
	map: (item: T) => U,
): U | undefined {
	return items.length > 0 ? map(items[0]!) : undefined;
}

/** Stable identity of a bundle, for change detection across discovery polls. */
export function bundleKey(bundle: EmiTopicBundle | null): string {
	if (!bundle) return "";
	const names = [
		bundle.recording,
		bundle.primary.topic,
		bundle.alert?.topic ?? "",
		...bundle.targets.map((t) => t.topic).sort(),
		bundle.fix?.topic ?? "",
		bundle.quaternion?.topic ?? "",
		bundle.tfStatic?.topic ?? "",
		bundle.raw?.topic ?? "",
	];
	return `${bundle.datasourceId}|${names.join(",")}`;
}

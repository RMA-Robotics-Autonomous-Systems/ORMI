/**
 * The mission-control surface as it opens.
 *
 * ## Why FLEX and not GRID
 *
 * The same reason the EMI cockpit is FLEX: these panels want **shares of the
 * window**, not rectangles in 30-pixel row units. The map should grow with the
 * window; the mission list and the fleet roster are columns that stay columns on
 * a laptop and on a wall-mounted display; and two of the panels — the editor and
 * the log — are consulted rather than watched, which is what a tabset is for and
 * what a grid cannot express.
 *
 * ## The shape
 *
 * Rows alternate orientation with depth in FlexLayout — the root row is
 * horizontal, its row children are vertical, theirs horizontal again — so this
 * is the map beside a half-window that is itself two columns over a strip:
 *
 * ```
 * ┌──────────────────────┬────────────┬────────────┐
 * │                      │ missions   │ fleet      │
 * │                      ├────────────┼────────────┤
 * │ map                  │ control    │ feedback   │
 * │                      ├────────────┴────────────┤
 * │                      │ editor ‖ log            │
 * └──────────────────────┴─────────────────────────┘
 * ```
 *
 * The map holds the whole left edge because "where is it going" is most of what
 * this surface answers, and it is the one panel that gets better with every pixel
 * — a table does not. Everything else divides the other half, and the division
 * is the operator's own order of work: **choose** a mission, **command** it,
 * **check** who is flying it and what it reports, with authoring underneath.
 *
 * Three placements carry an argument worth keeping:
 *
 * - **The lifecycle panel is never in a tabset.** It holds Pause and Stop. A
 *   control that halts a vehicle must not be one click behind a tab strip, and a
 *   tab that has to be found first is exactly that. It sits directly under the
 *   mission list because it acts on whatever is selected there.
 * - **Nothing watched continuously shares a tab.** Fleet presence and mission
 *   feedback each keep a pane: they are read while something is moving, and a
 *   reading behind a tab is a reading nobody takes.
 * - **The editor and the log share one, and it spans the full half-window.**
 *   Authoring happens before a mission runs and the log is read once something
 *   has gone wrong; neither is watched continuously, so a pane each would spend
 *   a quarter of the surface on a panel nobody is looking at. Width is what both
 *   want — a mission config is a form, and log lines wrap badly in a 300px rail
 *   — which is why the strip runs under both columns rather than sitting in one.
 *
 * A layout, not a preference: the page persists to local storage from its first
 * autosave, and this is only what a surface with nothing saved starts from.
 *
 * ## Why no datasource is seeded
 *
 * `datasources` is deliberately empty. The page renders
 * `GlobalDataSourcesProvider`, which brings its own Datasources dialog, so the
 * operator adds the C2 source through the same flow as anywhere else — and that
 * flow produces an instance the "Needs setup" affordance can recognise. A seeded
 * instance could not: pre-filled with the definition's `http://localhost:5000`
 * defaults it either reads as pristine and nags forever, or is given a real
 * title and then claims to be configured while pointing at nothing. An empty
 * list states the truth, which is that this deployment's C2 host is not
 * something the plugin can know.
 */

import type { DashboardInterface } from "@workspace/ormi-core/dashboard";
import type { Widget, WidgetDefinition } from "@workspace/ormi-core/widgets";

import { FleetStatusDefinition } from "../widgets/fleet-status";
import { MissionBrowserDefinition } from "../widgets/mission-browser";
import { MissionControlPanelDefinition } from "../widgets/mission-control-panel";
import { MissionEditorDefinition } from "../widgets/mission-editor";
import { MissionFeedbackDefinition } from "../widgets/mission-feedback";
import { MissionMapDefinition } from "../widgets/mission-map";
import { SwarmLogDefinition } from "../widgets/swarm-log";

/**
 * One placed panel: a box id, and the definition it is an instance of.
 *
 * The **definition** is carried rather than its id because the instance's
 * settings are taken from `definition.data` — a widget reads
 * `widget.settings`, not the schema, so a panel seeded with only a title gets
 * `undefined` for every other property (the mission map's `mapUrl` among them,
 * which is an undefined tile template and not a fallback). Reading the
 * definition's own defaults is the one way this file cannot drift from them.
 *
 * ⚠ The cost of reading them: these seven factories are invoked from **outside
 * React render** — the page's `onLoad`, and this plugin's unit tests. A
 * definition factory is allowed to call hooks (the dashboard re-invokes every
 * factory each render precisely so it can, and `ormi-std-widgets`' tree viewer
 * really does call `usePluginsManager()` at factory level), so the first C2
 * definition that grows a factory-level hook breaks this page with an invalid
 * hook call from an async callback. **These seven must stay hook-free**, or this
 * file goes back to literals.
 */
interface Panel {
	/** Widget instance id, and the FlexLayout tab id. */
	box: string;
	/**
	 * The definition factory this panel instantiates.
	 *
	 * `any` for the settings parameter, as everywhere the widget list is
	 * handled generically (`widgetsExport` in `export.ts` does the same): seven
	 * definitions with seven unrelated settings types have no useful common
	 * supertype, and this file only ever reads `id`, `name` and `data`.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	definition: () => WidgetDefinition<any>;
}

/** Every panel the shipped surface opens with, in reading order. */
const PANELS: Panel[] = [
	{ box: "c2-missions", definition: MissionBrowserDefinition },
	{ box: "c2-control", definition: MissionControlPanelDefinition },
	{ box: "c2-map", definition: MissionMapDefinition },
	{ box: "c2-editor", definition: MissionEditorDefinition },
	{ box: "c2-log", definition: SwarmLogDefinition },
	{ box: "c2-fleet", definition: FleetStatusDefinition },
	{ box: "c2-feedback", definition: MissionFeedbackDefinition },
];

/**
 * Look up a panel without letting a typo become a silently empty pane.
 *
 * @param box - The box id to resolve.
 * @returns The panel.
 */
function panel(box: string): Panel {
	const found = PANELS.find((p) => p.box === box);
	if (!found) throw new Error(`default mission control: no panel "${box}"`);
	return found;
}

/**
 * What one panel opens as: the definition's own defaults.
 *
 * Definitions are registry-shared and read-only for consumers, so this reads a
 * **fresh** factory call and spreads it — the returned settings never alias
 * anything the registry holds. The title is whatever the definition calls its
 * default instance rather than a second list of strings here: a panel's caption
 * is the same answer as the title the widget would have carried had the operator
 * added it themselves, and two lists of titles drift the day one is reworded.
 *
 * @param p - The panel.
 * @returns The widget instance the panel places.
 */
function instance(p: Panel): Widget {
	const definition = p.definition();
	// A deep copy, not a spread: settings are plain JSON by construction (JSON
	// Forms writes them and they are persisted as JSON), and a definition that
	// ever hoists a nested default to module scope would otherwise share it with
	// every instance this seeds — a widget writing through it would move the
	// defaults for the whole session.
	const data = structuredClone(definition.data) as Record<string, unknown>;
	const title =
		typeof data.title === "string" && data.title.length > 0
			? data.title
			: definition.name;

	return {
		widget_id: definition.id,
		box_id: p.box,
		title,
		settings: { ...data, title },
	};
}

/**
 * One FlexLayout tab.
 *
 * The engine resolves a tab to a widget by the tab's **`id`**
 * (`useWidgetFactory` reads `node.getId()`), so that is the value which must
 * equal the key in the widget map; `component` is kept equal to it because
 * FlexLayout's own factory contract is stated in terms of `component`, and a
 * tab whose two identifiers disagree is a pane that renders and is wrong.
 *
 * @param box - The box id.
 * @param titles - Title per box id, so this reads the instances already built
 * rather than calling a definition factory a second time.
 * @returns The tab node.
 */
function tab(box: string, titles: Map<string, string>) {
	const p = panel(box);
	return {
		type: "tab" as const,
		id: p.box,
		name: titles.get(p.box) ?? p.box,
		component: p.box,
		config: {},
	};
}

/**
 * A tabset holding one or more panels.
 *
 * @param titles - Title per box id.
 * @param weight - Share of the parent row.
 * @param boxes - The panels, in tab order.
 * @returns The tabset node.
 */
function tabset(
	titles: Map<string, string>,
	weight: number,
	...boxes: string[]
) {
	return {
		type: "tabset" as const,
		weight,
		children: boxes.map((box) => tab(box, titles)),
	};
}

/**
 * The shipped layout, as a FlexLayout model.
 *
 * Weights are shares of their parent, not pixels — which is the whole reason for
 * this engine. The absolute numbers are arbitrary; only their ratios matter.
 *
 * @param titles - Title per box id, from the instances already built.
 * @returns The model.
 */
function flexModel(titles: Map<string, string>) {
	return {
		global: {
			tabEnableClose: true,
			tabEnableRename: false,
			tabEnableDrag: true,
			tabSetEnableDrop: true,
			tabSetEnableDrag: true,
			tabSetEnableMaximize: true,
			tabSetEnableClose: false,
			// Below roughly this the lifecycle panel's button row wraps into a
			// column and the browser's table loses its columns. A splitter that
			// can go smaller leaves a pane that is present, sized and unusable.
			tabSetMinHeight: 140,
			tabSetMinWidth: 200,
			borderMinSize: 100,
			enableEdgeDock: true,
			splitterSize: 4,
			splitterExtra: 4,
		},
		borders: [],
		layout: {
			type: "row" as const,
			weight: 100,
			children: [
				// The map, the whole left edge. It is the only panel here that
				// is better at every size.
				tabset(titles, 50, "c2-map"),
				// The other half: two columns of panes over a strip that spans
				// both of them.
				{
					type: "row" as const,
					weight: 50,
					children: [
						{
							type: "row" as const,
							weight: 66,
							children: [
								// Choose, then command. The lifecycle panel
								// acts on the mission selected above it, and is
								// in a pane of its own because it holds Pause
								// and Stop.
								{
									type: "row" as const,
									weight: 50,
									children: [
										tabset(titles, 55, "c2-missions"),
										tabset(titles, 45, "c2-control"),
									],
								},
								// Who is flying it, and what it reports —
								// neither behind a tab.
								{
									type: "row" as const,
									weight: 50,
									children: [
										tabset(titles, 42, "c2-fleet"),
										tabset(titles, 58, "c2-feedback"),
									],
								},
							],
						},
						// The two panels that want width and are not watched.
						tabset(titles, 34, "c2-editor", "c2-log"),
					],
				},
			],
		},
	};
}

/**
 * A dashboard containing the shipped mission-control surface.
 *
 * @returns Fresh state; the maps and the layout are new on every call, so a
 * caller cannot mutate the template through the dashboard it was handed.
 */
export function defaultMissionControl(): DashboardInterface {
	// One factory call per panel, and the titles are read back from what it
	// produced — see the warning on `Panel` about calling these outside render.
	const widgets = new Map<string, Widget>();
	const titles = new Map<string, string>();
	for (const p of PANELS) {
		const widget = instance(p);
		widgets.set(p.box, widget);
		titles.set(p.box, widget.title);
	}

	return {
		// Keyed `flex`, which is the FLEX engine's `layoutKey`. A layout under
		// the wrong key is not an error anywhere — the engine finds nothing and
		// falls back to stacking every panel into a single tabset, which looks
		// like a broken surface rather than a misconfigured one.
		layouts: { flex: flexModel(titles) },
		widgets,
		datasources: new Map(),
		locked: false,
	};
}

/** The layout key this page's engine reads. Asserted by the page's restore. */
export const MISSION_CONTROL_LAYOUT_KEY = "flex";

/**
 * The mission-control surface as it opens.
 *
 * ## Why FLEX and not GRID
 *
 * The same reason the EMI cockpit is FLEX: these panels want **shares of the
 * window**, not rectangles in 30-pixel row units. The map should grow with the
 * window; the side stacks are columns that stay columns on a laptop and on a
 * wall-mounted display; and the map and the behaviour graph take turns in one
 * pane, which is what a tabset is for and what a grid cannot express.
 *
 * ## The shape
 *
 * Rows alternate orientation with depth in FlexLayout: the root row is
 * horizontal, its row children are vertical. So this is three columns, the map
 * in the middle taking over half the width, with a narrow stack either side:
 *
 * ```
 * ┌──────────┬───────────────────────────┬────────────┐
 * │ missions │                           │ control    │
 * ├──────────┤                           │            │
 * │ fleet    │  map ‖ graph              ├────────────┤
 * ├──────────┤                           │            │
 * │ assets   │                           │ feedback   │
 * │          │                           │            │
 * ├──────────┤                           │            │
 * │ log      │                           │            │
 * └──────────┴───────────────────────────┴────────────┘
 * ```
 *
 * The centre is the operator's workspace, the sides are what they read from and
 * act on. Four placements carry an argument worth keeping:
 *
 * - **The map and the behaviour graph share the centre.** Both are canvases,
 *   and a canvas is the one kind of panel here that is unusable rather than
 *   merely cramped when it is starved. Neither is readable in a side column, and
 *   the centre is the only place with room for one of them, so they take turns
 *   in it: geometry is authored on the map, behaviour on the graph, and an
 *   operator is doing one or the other. The map is the first tab because "where
 *   is it going" is most of what this surface answers once a mission runs.
 * - **The lifecycle panel is never in a tabset.** It holds Pause and Stop. A
 *   control that halts a vehicle must not be one click behind a tab strip, and a
 *   tab that has to be found first is exactly that. It heads the right column,
 *   above the feedback it acts on.
 * - **Nothing watched continuously shares a tab.** Fleet presence and mission
 *   feedback each keep a pane: they are read while something is moving, and a
 *   reading behind a tab is a reading nobody takes. Feedback gets most of the
 *   right column because it is the longest thing on this surface to read.
 * - **The left column is the inventory, in the order of work.** Choose a
 *   mission, see who can fly it, see what it owns, and, last and smallest, the
 *   log, which is read once something has gone wrong. The asset tree gets the
 *   most height there because it is the one that grows with the mission.
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
import { MissionAssetsDefinition } from "../widgets/mission-assets-panel";
import { MissionGraphEditorDefinition } from "../widgets/mission-graph-editor";
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
 * ⚠ The cost of reading them: these eight factories are invoked from **outside
 * React render** — the page's `onLoad`, and this plugin's unit tests. A
 * definition factory is allowed to call hooks (the dashboard re-invokes every
 * factory each render precisely so it can, and `ormi-std-widgets`' tree viewer
 * really does call `usePluginsManager()` at factory level), so the first C2
 * definition that grows a factory-level hook breaks this page with an invalid
 * hook call from an async callback. **These eight must stay hook-free**, or this
 * file goes back to literals.
 */
interface Panel {
	/** Widget instance id, and the FlexLayout tab id. */
	box: string;
	/**
	 * The definition factory this panel instantiates.
	 *
	 * `any` for the settings parameter, as everywhere the widget list is
	 * handled generically (`widgetsExport` in `export.ts` does the same): eight
	 * definitions with eight unrelated settings types have no useful common
	 * supertype, and this file only ever reads `id`, `name` and `data`.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	definition: () => WidgetDefinition<any>;
	/**
	 * Caption for the FlexLayout tab, when the widget's own title is too long
	 * for a SHARED strip.
	 *
	 * A panel header has the pane's whole width; a tab strip has that width
	 * divided by the number of tabs in it, minus the tabset's own maximize
	 * button. "Mission Graph / Assets / Swarm Log" wants 568 px, and at
	 * 1100×800 the strip has 470 — so the captions truncated AND the maximize
	 * button was pushed out of reach, removing the one escape from a cramped
	 * pane. Shortening is the layout's decision because the overflow is a
	 * property of the arrangement, not of the widget: the same widget dropped
	 * alone on an operator's workspace keeps its full title.
	 *
	 * Set it ONLY for a panel that shares a tabset here, and keep it a prefix
	 * of the real title, so the tab and the widget are recognisably the same
	 * thing.
	 */
	tab?: string;
}

/** Every panel the shipped surface opens with, in reading order. */
const PANELS: Panel[] = [
	{ box: "c2-missions", definition: MissionBrowserDefinition },
	{ box: "c2-fleet", definition: FleetStatusDefinition },
	{ box: "c2-assets", definition: MissionAssetsDefinition },
	{ box: "c2-log", definition: SwarmLogDefinition },
	{ box: "c2-map", definition: MissionMapDefinition },
	// Shares the centre strip with the map, captioned to fit it: see `Panel.tab`.
	{ box: "c2-graph", definition: MissionGraphEditorDefinition, tab: "Graph" },
	{ box: "c2-control", definition: MissionControlPanelDefinition },
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
		name: p.tab ?? titles.get(p.box) ?? p.box,
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
				// The inventory column, in the order of work: choose a
				// mission, see who can fly it, what it owns, and last the log.
				// A vertical row: its children divide the HEIGHT.
				{
					type: "row" as const,
					weight: 18,
					children: [
						tabset(titles, 20, "c2-missions"),
						tabset(titles, 17, "c2-fleet"),
						tabset(titles, 50, "c2-assets"),
						tabset(titles, 13, "c2-log"),
					],
				},
				// The two canvases take turns in the centre, the only place
				// with room for either.
				tabset(titles, 55, "c2-map", "c2-graph"),
				// Command, then what it reports. The lifecycle panel is in a
				// pane of its own because it holds Pause and Stop.
				{
					type: "row" as const,
					weight: 27,
					children: [
						tabset(titles, 30, "c2-control"),
						tabset(titles, 70, "c2-feedback"),
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

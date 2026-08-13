/**
 * The cockpit as it opens.
 *
 * ## Why FLEX and not GRID
 *
 * A grid gives every panel a rectangle in fixed row units, and these panels do
 * not want rectangles — they want **shares of the window**. The signal stack is
 * five coil panels that must divide whatever height exists; the rail is a column
 * that should stay a column on a laptop and on a 4K display; the tables and the
 * repeatability overlay want to be resized against their neighbours, not against
 * a 30-pixel row. On the grid, every one of those was a number chosen for one
 * screen size, and a shorter window pushed panels below the fold rather than
 * making them smaller.
 *
 * FlexLayout gives proportional splits with draggable splitters, and it gives
 * something the grid cannot: **tabsets**. Mission control and the exporter are
 * pressed twice a day and read never; sharing one tab strip is exactly right for
 * them, and would waste a third of the screen on a grid.
 *
 * ## The shape
 *
 * Rows alternate orientation with depth in FlexLayout — the root row is
 * horizontal, its row children are vertical — so this is four columns, two of
 * which split vertically:
 *
 * ```
 * ┌────────┬──────────────────┬─────────────────────┬────────┐
 * │        │ coil signals     │ map                 │        │
 * │ coil   │                  │                     │ params │
 * │ array  ├──────────────────┼─────────────────────┤ rail   │
 * │        │ motion           │ tables‖mission‖exp. │        │
 * └────────┴──────────────────┴─────────────────────┴────────┘
 * ```
 *
 * Both outside edges are held by the two panels that are read as columns. The
 * **array** is a top-down of the rake with the ground streaming astern beneath
 * it, so its useful dimension is along-track: a short wide box shows an object
 * for about a second, and a full-height one shows the whole approach and
 * departure. The **rail** is a control surface rather than a reading, and in the
 * middle it split the two things it changes — comparing a signal against the map
 * meant looking past the sliders.
 *
 * The map is the standard map widget carrying this plugin's four marker types,
 * placed and configured here rather than left to the operator: the layers were
 * registered and shipped, and a cockpit that never showed them made "where the
 * detections land" a thing you had to know to go and add.
 *
 * A layout, not a preference: the page persists to local storage from the first
 * save, and this is only what a cockpit with nothing saved starts from.
 */

import type { DashboardInterface } from "@workspace/ormi-core/dashboard";
import type { Widget } from "@workspace/ormi-core/widgets";

/** Widget ids this template places. */
const IDS = {
	signals: "teodor-emi-coil-signal-stack",
	motion: "teodor-emi-motion",
	array: "teodor-emi-coil-array",
	rail: "teodor-emi-params-rail",
	tables: "teodor-emi-tables",
	mission: "teodor-emi-mission-control",
	export: "teodor-emi-export",
	/** The standard map widget, carrying this plugin's four marker types. */
	map: "map-box-viewer",
} as const;

/** One placed panel. `box` is the widget instance id and the FlexLayout tab id. */
interface Panel {
	box: string;
	widget: string;
	title: string;
	/** Settings beyond the title, for widgets that need configuring to be useful. */
	settings?: Record<string, unknown>;
}

/**
 * Basemap tiles the cockpit opens with.
 *
 * Carto Voyager with labels under: a survey is read as marks on ground, so the
 * basemap has to stay behind them. Labels drawn over the layers put place names
 * through the detections.
 */
const CARTO_VOYAGER =
	"https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png";

/**
 * A map layer entry, as the standard map widget stores them.
 *
 * The `topic` is a label here, not a wire. The EMI layers draw the **shared
 * replay** — the same detections every other panel is showing — and resolve it
 * from the run store rather than from a subscription, precisely so a layer fed
 * from a topic cannot disagree with the parameter rail. What the map widget
 * does with this object is identify the layer and offer a "centre on" action,
 * which finds no data for these entries and declines, which is correct.
 *
 * @param name - Layer name shown in the map's own control panel.
 * @param markerType - One of this plugin's registered marker types.
 * @returns The entry.
 */
function emiLayer(name: string, markerType: string) {
	return {
		name,
		makerType: markerType,
		topic: {
			topic: "/teodora/emi/gnss",
			datasource_id: "",
			source: { id: "", title: "EMI", enable: true },
			type: "EMIGnss",
			rawType: "emi_msgs/msg/EMIGnss",
			property: "",
		},
	};
}

/** Every panel the shipped cockpit opens with, in reading order. */
const PANELS: Panel[] = [
	{ box: "emi-signals", widget: IDS.signals, title: "EMI coil signals" },
	{ box: "emi-motion", widget: IDS.motion, title: "EMI motion" },
	{ box: "emi-rail", widget: IDS.rail, title: "EMI parameters" },
	{
		box: "emi-map",
		widget: IDS.map,
		title: "EMI map",
		settings: {
			// Set explicitly rather than left to the schema default. A widget
			// instance's settings are what the map reads, and a missing
			// `mapUrl` is an undefined tile template, not a fallback.
			mapUrl: CARTO_VOYAGER,
			use3D: false,
			customLayers: [],
			localTopics: { pathTopics: [], imuTopics: [] },
			// All four, on by default. Detections without their targets is half
			// the answer; the ghosts are what make the map a check on the
			// georeferencing rather than a picture of it; and the track is the
			// ground every one of them is read against — marks with no path
			// through them cannot say whether a stretch was surveyed and clear
			// or never surveyed at all. Drawn first so it sits under the marks.
			topics: [
				emiLayer("Driven track", "TeodorEMITrack"),
				emiLayer("Detections", "TeodorEMIDetections"),
				emiLayer("Targets", "TeodorEMITargets"),
				emiLayer("Robot pose", "TeodorEMIGhosts"),
			],
		},
	},
	{ box: "emi-array", widget: IDS.array, title: "EMI coil array" },
	{ box: "emi-tables", widget: IDS.tables, title: "EMI tables" },
	{ box: "emi-mission", widget: IDS.mission, title: "EMI mission" },
	{ box: "emi-export", widget: IDS.export, title: "EMI export" },
];

/** Look up a panel's title without letting a typo become a silent blank tab. */
function panel(box: string): Panel {
	const found = PANELS.find((p) => p.box === box);
	if (!found) throw new Error(`default cockpit: no panel "${box}"`);
	return found;
}

/**
 * One FlexLayout tab.
 *
 * `component` carries the widget instance id: the engine resolves a tab to a
 * widget by that value, so it must equal the key in the widget map.
 */
function tab(box: string) {
	const p = panel(box);
	return {
		type: "tab" as const,
		id: p.box,
		name: p.title,
		component: p.box,
		config: {},
	};
}

/** A tabset holding one or more panels. */
function tabset(weight: number, ...boxes: string[]) {
	return {
		type: "tabset" as const,
		weight,
		children: boxes.map(tab),
	};
}

/**
 * The shipped layout, as a FlexLayout model.
 *
 * Weights are shares of their parent, not pixels — which is the whole reason
 * for the engine change. The absolute numbers below are arbitrary; only their
 * ratios matter.
 */
function flexModel() {
	return {
		global: {
			tabEnableClose: true,
			tabEnableRename: false,
			tabEnableDrag: true,
			tabSetEnableDrop: true,
			tabSetEnableDrag: true,
			tabSetEnableMaximize: true,
			tabSetEnableClose: false,
			// Below these a canvas panel is a smear rather than a chart, and
			// several of them refuse to draw at all — the guards in the widgets
			// and this floor should agree.
			tabSetMinHeight: 120,
			tabSetMinWidth: 160,
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
				// The rake, full height on the outside edge. Along-track is the
				// dimension that carries its meaning — an object enters at the
				// top, passes under the front row, then the rear, and leaves —
				// and in a short wide box that whole story was two seconds long.
				tabset(14, "emi-array"),
				// The signals, and the motion they were recorded at.
				{
					type: "row" as const,
					weight: 38,
					children: [
						tabset(62, "emi-signals"),
						tabset(38, "emi-motion"),
					],
				},
				// Where the detections land, and the numbers. The map is here
				// rather than absent because "where" is half of what a survey is
				// for, and a cockpit that only ever shows a signal against time
				// cannot answer it.
				{
					type: "row" as const,
					weight: 34,
					children: [
						tabset(58, "emi-map"),
						// One tabset, three tabs. The tables are consulted, and
						// recording and exporting bracket a survey; none of the
						// three is looked at continuously, so they share.
						tabset(42, "emi-tables", "emi-mission", "emi-export"),
					],
				},
				// The rail on the other outside edge, full height.
				tabset(14, "emi-rail"),
			],
		},
	};
}

/**
 * A dashboard containing the shipped cockpit.
 *
 * @returns Fresh state; the maps and the layout are new on every call so a
 * caller cannot mutate the template through the dashboard it was handed.
 */
export function defaultCockpit(): DashboardInterface {
	const widgets = new Map<string, Widget>();
	for (const p of PANELS) {
		widgets.set(p.box, {
			widget_id: p.widget,
			box_id: p.box,
			title: p.title,
			settings: { title: p.title, ...p.settings },
		});
	}

	return {
		// Keyed `flex`, which is the FLEX engine's `layoutKey`. A layout under
		// the wrong key is not an error anywhere — the engine simply finds
		// nothing and falls back to stacking every widget into a single tabset,
		// which looks like a broken cockpit rather than a misconfigured one.
		layouts: { flex: flexModel() },
		widgets,
		datasources: new Map(),
		locked: false,
	};
}

/** The layout key the cockpit's engine reads. Asserted by the page's restore. */
export const COCKPIT_LAYOUT_KEY = "flex";

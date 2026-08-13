"use client";

/**
 * The detection cockpit, at `/plugin-pages/teodor-emi`.
 *
 * An ordinary ORMI dashboard: the shell, the datasource runtime, the layout
 * engine and the widgets dialog, with this plugin's panels laid out for it. The
 * page adds no data plumbing of its own — the panels resolve their own source —
 * so every one of them works just as well dropped on a user's own workspace.
 *
 * The engine is **FLEX**. These panels want proportional shares of the window
 * rather than rectangles in fixed row units, and two of them want to share a tab
 * strip; `default-cockpit.ts` records why in full.
 *
 * ## Persistence
 *
 * Local storage, keyed per browser, and **written without being asked**. The
 * workspace dashboards persist through Prisma helpers in `apps/web`, which a
 * plugin cannot reach and should not: a plugin page writing to the workspace
 * tables would be a plugin owning app schema. The cost is that a cockpit layout
 * does not follow the operator to another machine, which is the right trade for
 * a tuning surface.
 *
 * The shell only ever saves when its save button is pressed. On a workspace
 * dashboard that is correct — a save is a deliberate edit to a shared document.
 * Here it is not: the layout, the widget settings and the datasource list are
 * one operator's working setup, and the cost of losing them to a reload is
 * paid by the same person who arranged them. So `CockpitAutosave` below turns
 * the shell's own change detection into a save.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";
import {
	DashboardEngine,
	DashboardShell,
	useDashboardShell,
} from "@workspace/ormi-core/dashboard";
import type { DashboardInterface } from "@workspace/ormi-core/dashboard";
import { GlobalDataSourcesProvider } from "@workspace/ormi-core/datasources";
import { WidgetsDialog } from "@workspace/ormi-core/widgets";
import {
	temphandleLoad,
	temphandleSave,
	TemplatesProvider,
	type Template,
} from "@workspace/ormi-core/templates";
import {
	EMI_WIDGETS_FILTER_ID,
	emiWidgetDefinitions,
} from "../widgets/definitions";
import { COCKPIT_LAYOUT_KEY, defaultCockpit } from "./default-cockpit";

/**
 * Local-storage key holding the cockpit layout.
 *
 * Bumped on any change to the shipped arrangement — v2 was the move from the
 * grid engine to FlexLayout, v3 added the map, v4 moved the rail to the outside
 * edge, v5 put the driven track on the map, v6 moved the coil array to the
 * left edge at full height. A saved layout is honoured in full, so an older entry restored today is
 * the old arrangement with nothing to suggest it has been superseded. Retiring
 * the key hands back the new default once; everything after that is the
 * operator's.
 */
const STORAGE_KEY = "teodor-emi-cockpit-v6";

/** The serialised form: maps do not survive `JSON.stringify`. */
interface StoredDashboard {
	layouts: Record<string, unknown>;
	widgets: Array<[string, unknown]>;
	datasources: Array<[string, unknown]>;
	locked: boolean;
}

/**
 * Read the saved cockpit, or fall back to the shipped one.
 *
 * A corrupt entry is treated as absent rather than thrown: a page that will not
 * open because of a layout is worse than a page that opens on the default.
 *
 * @returns The dashboard to start from.
 */
function loadDashboard(): DashboardInterface {
	if (typeof window === "undefined") return defaultCockpit();
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return defaultCockpit();
		const parsed = JSON.parse(raw) as StoredDashboard;
		// Validated as a unit, not field by field. A payload that parses but has
		// lost its `layouts` would otherwise restore a full widget map with no
		// layout — an empty-looking dashboard that the next save writes back
		// over the good entry.
		if (
			!parsed ||
			typeof parsed.layouts !== "object" ||
			parsed.layouts === null ||
			!Array.isArray(parsed.widgets) ||
			!Array.isArray(parsed.datasources)
		) {
			return defaultCockpit();
		}
		// The active engine's own key must be there too. Widgets restored
		// without a layout the engine understands is the one shape that loads
		// without complaint and then looks broken — FlexLayout's answer to a
		// missing layout is to stack every panel into a single tab strip.
		if (!parsed.layouts[COCKPIT_LAYOUT_KEY]) return defaultCockpit();
		return {
			layouts: parsed.layouts,
			widgets: new Map(parsed.widgets) as DashboardInterface["widgets"],
			datasources: new Map(
				parsed.datasources,
			) as DashboardInterface["datasources"],
			locked: Boolean(parsed.locked),
		};
	} catch (err) {
		console.error("[EMI] saved cockpit could not be read:", err);
		return defaultCockpit();
	}
}

/**
 * Templates, in local storage beside the layout.
 *
 * Core already ships the local-storage pair (`temphandleLoad`/`temphandleSave`)
 * for exactly this case. The workspace dashboards persist templates through
 * Prisma helpers in `apps/web`, which a plugin cannot reach and should not — a
 * plugin page writing app schema is the wrong boundary — so the cockpit's
 * templates are per-browser, like its layout.
 */
async function loadTemplates(): Promise<Map<string, Template>> {
	return temphandleLoad();
}

/** Append one template, returning the key it was stored under. */
async function addTemplate(template: Template): Promise<string> {
	const all = temphandleLoad();
	// Templates carry no id of their own; the map key is the id, so one is
	// minted from the name and disambiguated only if it is already taken.
	let id = template.name || `template-${all.size + 1}`;
	for (let n = 2; all.has(id); n++) id = `${template.name} (${n})`;
	all.set(id, template);
	temphandleSave(all);
	return id;
}

/** Remove one template. */
async function removeTemplate(id: string): Promise<boolean> {
	const all = temphandleLoad();
	const existed = all.delete(id);
	temphandleSave(all);
	return existed;
}

/** Replace one template. */
async function updateTemplate(
	id: string,
	template: Template,
): Promise<boolean> {
	const all = temphandleLoad();
	if (!all.has(id)) return false;
	all.set(id, template);
	temphandleSave(all);
	return true;
}

/**
 * How long the cockpit must sit still before it is written.
 *
 * Long enough that a splitter drag or a slider sweep — both of which rewrite
 * the state continuously — cost one write rather than one per frame, short
 * enough that no realistic reload lands inside the window.
 */
const AUTOSAVE_MS = 1000;

/**
 * Persists the cockpit whenever it changes.
 *
 * Renders nothing. It leans entirely on the shell's existing bookkeeping:
 * `hasChanged` is a hash of layouts + widgets + datasources + lock state, and
 * `save()` is the same call the toolbar button makes — so an autosave and a
 * manual save are the same write, and the button stops reading dirty after one.
 *
 * Two properties come free from where this sits rather than from code here:
 *
 * - **It cannot clobber the saved cockpit with the default one.** The shell
 *   renders a skeleton instead of its children until `onLoad` has resolved, so
 *   this component does not exist during the window where that race lives.
 * - **It cannot save a no-op.** `hasChanged` is false until the state actually
 *   differs from what was last loaded or written.
 *
 * The effect re-arms on `hasChanged` rather than on the state itself, which
 * makes this a throttle and not a true debounce: a continuous drag is written
 * about once a second instead of once at the end. That is the behaviour we
 * want — a drag that never quite stops still gets persisted.
 *
 * @returns Nothing.
 */
function CockpitAutosave() {
	const { hasChanged, save } = useDashboardShell();

	useEffect(() => {
		if (!hasChanged) return;
		const timer = setTimeout(() => {
			void save();
		}, AUTOSAVE_MS);
		return () => clearTimeout(timer);
	}, [hasChanged, save]);

	return null;
}

/**
 * Contribute the EMI panels for as long as this page is open.
 *
 * The plugin class deliberately does not register them. `WIDGETS_LIST` is
 * global: a filter added in a plugin constructor puts every panel in the widget
 * picker of every workspace in the app, and ten EMI panels offered to a
 * dashboard that will never have an EMI run behind them are ten wrong answers —
 * each one resolves no source and renders an offline card.
 *
 * Registering from the page instead scopes them to where they mean something,
 * and unmounting takes them back out. The `registered` flag exists because the
 * shell reads `WIDGETS_LIST` during **render**: without it the first render
 * would resolve an empty widget list and the restored cockpit would come back
 * as seven "widget not found" tiles.
 *
 * @returns True once the filter is in place.
 */
function useCockpitWidgets(): boolean {
	const pluginsManager = usePluginsManager();
	const [registered, setRegistered] = useState(false);

	useLayoutEffect(() => {
		pluginsManager.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: EMI_WIDGETS_FILTER_ID,
			priority: 10,
			filter: (widgets: unknown[]) => {
				widgets.push(...emiWidgetDefinitions());
				return widgets;
			},
		});
		// The cascading render is the point. `WIDGETS_LIST` is read during the
		// shell's render and the plugin registry has nothing to subscribe to, so
		// this state change is what tells the tree the list is no longer empty.
		// It happens once per mount, in a layout effect, before paint.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setRegistered(true);
		return () => {
			pluginsManager.removeFilter(EMI_WIDGETS_FILTER_ID);
			setRegistered(false);
		};
	}, [pluginsManager]);

	return registered;
}

/**
 * The cockpit page.
 *
 * @returns React element.
 */
export function EmiMissionPage() {
	const widgetsReady = useCockpitWidgets();

	const handleLoad = useCallback(
		async (apply: (state: DashboardInterface) => void) => {
			apply(loadDashboard());
			return true;
		},
		[],
	);

	const handleSave = useCallback(async (state: DashboardInterface) => {
		if (typeof window === "undefined") return false;
		try {
			const payload: StoredDashboard = {
				layouts: state.layouts,
				widgets: [...state.widgets.entries()],
				datasources: [...state.datasources.entries()],
				locked: state.locked,
			};
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
			return true;
		} catch (err) {
			console.error("[EMI] cockpit could not be saved:", err);
			return false;
		}
	}, []);

	return (
		// FLEX, not GRID: these panels want shares of the window rather than
		// rectangles in fixed row units — see `default-cockpit.ts`.
		<DashboardShell
			dashboardType="FLEX"
			onLoad={handleLoad}
			onSave={handleSave}
			// Holds the shell's own skeleton until the panels are contributed,
			// so the restored layout never resolves against an empty registry.
			loading={!widgetsReady}
		>
			{({ widgetDefinitions, widgetGroups }) => (
				// Not optional chrome: `GlobalDataSourcesProvider` and the layout
				// engine both call `useTemplates()` — the flex engine through its
				// navbar integration — and that is a safe context, which throws
				// when its provider is absent. Without this the page does not
				// render at all.
				<TemplatesProvider
					onLoad={loadTemplates}
					addTemplate={addTemplate}
					removeTemplate={removeTemplate}
					updateTemplate={updateTemplate}
				>
					<GlobalDataSourcesProvider>
						{/* Inside the shell, so it only ever runs after the
						    saved cockpit has been loaded. */}
						<CockpitAutosave />
						<DashboardEngine />
						<WidgetsDialog
							widgetDefinitions={widgetDefinitions}
							widgetGroups={widgetGroups}
						/>
					</GlobalDataSourcesProvider>
				</TemplatesProvider>
			)}
		</DashboardShell>
	);
}

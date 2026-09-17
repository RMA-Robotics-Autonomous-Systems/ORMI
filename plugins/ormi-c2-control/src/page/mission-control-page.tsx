"use client";

/**
 * The mission-control surface, at `/plugin-pages/c2-mission-control`.
 *
 * An ordinary ORMI dashboard: the shell, the datasource runtime, the layout
 * engine and the widget rail, with this plugin's panels laid out for it. The
 * page adds no data plumbing of its own — every panel resolves its own C2
 * datasource and its own topics — so each one still works dropped on an
 * operator's own workspace, which is where they have lived until now.
 *
 * A page rather than a registered layout engine plus a new dashboard type, which
 * is what makes it need no core change: `DashboardEngine` resolves the layout
 * engine by id from the registry, so `dashboardType="FLEX"` renders the real
 * FLEX engine; the arrangement is handed to the shell as the loaded state rather
 * than seeded widget-by-widget after load, so there is no race with
 * persistence; and nothing is written to the workspace tables, so their
 * `dashboardType` validation never sees an id it does not know. What a page
 * gives up is a named, shareable workspace per surface — the layout is per
 * browser.
 *
 * ## Why the panels are registered twice
 *
 * The plugin constructor registers all seven on `WIDGETS_LIST`, and that stays:
 * the command widgets gate themselves on a configured C2 datasource through
 * `WIDGET_LIST_WITH_DATASOURCE` (pattern 8) and the display widgets gate on
 * topic health, so they are useful on any workspace that has a C2 source and
 * operators already place them there. Page-scoping them the way the EMI cockpit
 * does would take them out of those workspaces.
 *
 * But a constructor registration is **not enough for this page**, and the reason
 * is not obvious: `GlobalDataSourcesProvider` registers its own `WIDGETS_LIST`
 * filter at `Number.MAX_SAFE_INTEGER` which returns `[]` outright when the
 * dashboard has **no datasource configured** — a workspace policy (a widget with
 * no datasource can do nothing) that this page's first open necessarily trips,
 * because it seeds no datasource and keeps its own list. In that state
 * `getDefinition` answers the widget-not-found placeholder for all seven panels,
 * every tile renders as an unsupported widget, and the rail offers nothing to
 * put back. Worse, it does not heal: the FLEX engine's widget factory caches the
 * element it built per box id, so a panel first resolved as unsupported stays
 * that way until the page is reloaded, even after the operator adds the C2
 * source.
 *
 * So `usePagePanels` below re-asserts this page's own panels *after* that gate,
 * and the shell is held on `loading` until it has. A panel on the surface whose
 * whole purpose is those panels must be resolvable and restorable; each one
 * reports a missing C2 datasource itself, in its own body, which is something an
 * operator can act on in a way that a puzzle icon is not.
 *
 * ## Persistence
 *
 * Local storage, keyed per browser, and written without being asked. The
 * workspace dashboards persist through Prisma helpers in `apps/web`, which a
 * plugin cannot reach and should not — a plugin writing app schema is the wrong
 * boundary. The cost is that this arrangement does not follow an operator to
 * another machine.
 *
 * The shell only ever saves when its save button is pressed, which is right for
 * a workspace (a save is a deliberate edit to a shared document) and wrong
 * here: the layout is one operator's working setup, and the cost of losing it to
 * a reload is paid by the same person who arranged it. So `MissionControlAutosave`
 * turns the shell's own change detection into a save.
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
import {
	temphandleLoad,
	temphandleSave,
	TemplatesProvider,
	type Template,
} from "@workspace/ormi-core/templates";

import {
	defaultMissionControl,
	MISSION_CONTROL_LAYOUT_KEY,
} from "./default-mission-control";
import { ensurePagePanels, PAGE_WIDGETS_FILTER_ID } from "./page-panels";

/**
 * Local-storage key holding the arrangement.
 *
 * Bumped on any change to the shipped layout — v2 gave the map the whole left
 * edge and put the editor/log strip under the right half. A saved arrangement is
 * honoured in full, so an older entry restored today is the old layout with
 * nothing to suggest it has been superseded; retiring the key hands back the new
 * default once, and everything after that is the operator's.
 */
const STORAGE_KEY = "ormi-c2-mission-control-v2";

/** The serialised form: maps do not survive `JSON.stringify`. */
interface StoredDashboard {
	layouts: Record<string, unknown>;
	widgets: Array<[string, unknown]>;
	datasources: Array<[string, unknown]>;
	locked: boolean;
}

/**
 * Read the saved arrangement, or fall back to the shipped one.
 *
 * A corrupt entry is treated as absent rather than thrown: a page that will not
 * open because of a layout is worse than a page that opens on the default.
 *
 * @returns The dashboard to start from.
 */
function loadDashboard(): DashboardInterface {
	if (typeof window === "undefined") return defaultMissionControl();
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return defaultMissionControl();
		const parsed = JSON.parse(raw) as StoredDashboard;
		// Validated as a unit, not field by field. A payload that parses but has
		// lost its `layouts` would otherwise restore a full widget map with no
		// layout — an empty-looking dashboard that the next autosave writes back
		// over the good entry.
		if (
			!parsed ||
			typeof parsed.layouts !== "object" ||
			parsed.layouts === null ||
			!Array.isArray(parsed.widgets) ||
			!Array.isArray(parsed.datasources)
		) {
			return defaultMissionControl();
		}
		// The active engine's own key must be there too. Widgets restored
		// without a layout the engine understands is the one shape that loads
		// without complaint and then looks broken — FlexLayout's answer to a
		// missing layout is to stack every panel into a single tab strip.
		if (!parsed.layouts[MISSION_CONTROL_LAYOUT_KEY]) {
			return defaultMissionControl();
		}
		return {
			layouts: parsed.layouts,
			widgets: new Map(parsed.widgets) as DashboardInterface["widgets"],
			datasources: new Map(
				parsed.datasources,
			) as DashboardInterface["datasources"],
			locked: Boolean(parsed.locked),
		};
	} catch (err) {
		console.error("[C2] saved mission control could not be read:", err);
		return defaultMissionControl();
	}
}

/**
 * Templates, in local storage beside the layout.
 *
 * Core already ships the local-storage pair (`temphandleLoad`/`temphandleSave`)
 * for exactly this case, under one key shared by every surface that uses it —
 * so a widget saved as a template here is offered on the EMI cockpit too, which
 * is the point of a template. The workspace dashboards persist templates
 * through Prisma helpers in `apps/web`, which a plugin cannot reach.
 *
 * @returns The stored templates.
 */
async function loadTemplates(): Promise<Map<string, Template>> {
	return temphandleLoad();
}

/**
 * Append one template, returning the key it was stored under.
 *
 * @param template - The template to store.
 * @returns Its id.
 */
async function addTemplate(template: Template): Promise<string> {
	const all = temphandleLoad();
	// Templates carry no id of their own; the map key is the id, so one is
	// minted from the name and disambiguated only if it is already taken.
	// The collision suffix is built from the id actually in use, not from
	// `template.name`: an unnamed template would otherwise collide into the
	// literal " (2)".
	const base = template.name || `template-${all.size + 1}`;
	let id = base;
	for (let n = 2; all.has(id); n++) id = `${base} (${n})`;
	all.set(id, template);
	temphandleSave(all);
	return id;
}

/**
 * Remove one template.
 *
 * @param id - The template id.
 * @returns True when one was removed.
 */
async function removeTemplate(id: string): Promise<boolean> {
	const all = temphandleLoad();
	const existed = all.delete(id);
	temphandleSave(all);
	return existed;
}

/**
 * Replace one template.
 *
 * @param id - The template id.
 * @param template - Its replacement.
 * @returns True when one was replaced.
 */
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
 * Keep this page's own panels resolvable, whatever the datasource list says.
 *
 * Runs at `Infinity`, which is after `GlobalDataSourcesProvider`'s gate at
 * `Number.MAX_SAFE_INTEGER` — the one that empties `WIDGETS_LIST` when no
 * datasource is configured (see the note at the top of this file). Anything the
 * gate let through is left exactly as it is and only the missing panels are
 * pushed, so this adds nothing on a page that already has a C2 source and never
 * duplicates an id.
 *
 * It deliberately re-admits the four command widgets that
 * `WIDGET_LIST_WITH_DATASOURCE` hides without a C2 datasource. That gating is
 * right for a general workspace, where offering a mission browser to someone who
 * has never heard of C2 is a wrong answer; on this page it would hide the panels
 * the page exists for. Each reports the missing datasource in its own body.
 *
 * The `registered` flag is not bookkeeping: the shell reads `WIDGETS_LIST`
 * during **render**, and the FLEX engine's factory caches the element it builds
 * per box id — so a first render without this filter pins seven unsupported
 * tiles for the life of the page. The page holds the shell's `loading` until the
 * filter is in place. The merge itself lives in `page-panels.ts` and is
 * unit-tested there.
 *
 * @returns True once the filter is in place.
 */
function usePagePanels(): boolean {
	const pluginsManager = usePluginsManager();
	const [registered, setRegistered] = useState(false);

	useLayoutEffect(() => {
		pluginsManager.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: PAGE_WIDGETS_FILTER_ID,
			priority: Infinity,
			filter: ensurePagePanels,
		});
		// The cascading render is the point. `WIDGETS_LIST` is read during the
		// shell's render and the plugin registry has nothing to subscribe to, so
		// this state change is what tells the tree the list is no longer gated.
		// It happens once per mount, in a layout effect, before paint.
		// NOTE: this directive opts `usePagePanels` out of React Compiler
		// compilation, which costs nothing here — the hook has no work to memo.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setRegistered(true);
		return () => {
			pluginsManager.removeFilter(PAGE_WIDGETS_FILTER_ID);
			setRegistered(false);
		};
	}, [pluginsManager]);

	return registered;
}

/**
 * How long the surface must sit still before it is written.
 *
 * Long enough that a splitter drag — which rewrites the state continuously —
 * costs one write rather than one per frame, short enough that no realistic
 * reload lands inside the window.
 */
const AUTOSAVE_MS = 1000;

/**
 * Persists the arrangement whenever it changes.
 *
 * Renders nothing. It leans entirely on the shell's existing bookkeeping:
 * `hasChanged` is a hash of layouts + widgets + datasources + lock state, and
 * `save()` is the same call the toolbar button makes — so an autosave and a
 * manual save are the same write.
 *
 * Two properties come from where this sits rather than from code here:
 *
 * - **It cannot clobber the saved arrangement with the default one.** The shell
 *   renders a skeleton instead of its children until `onLoad` has resolved, so
 *   this component does not exist during the window where that race lives.
 * - **It cannot save a no-op.** `hasChanged` is false until the state actually
 *   differs from what was last loaded or written.
 *
 * The effect re-arms on `hasChanged` rather than on the state itself, which
 * makes this a throttle and not a true debounce: a continuous drag is written
 * about once a second instead of once at the end. That is what we want — a drag
 * that never quite stops still gets persisted.
 *
 * @returns Nothing.
 */
function MissionControlAutosave() {
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
 * The mission-control page.
 *
 * @returns React element.
 */
export function MissionControlPage() {
	const panelsReady = usePagePanels();

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
			console.error("[C2] mission control could not be saved:", err);
			return false;
		}
	}, []);

	return (
		// FLEX, not GRID: these panels want shares of the window rather than
		// rectangles in fixed row units — see `default-mission-control.ts`.
		<DashboardShell
			dashboardType="FLEX"
			onLoad={handleLoad}
			onSave={handleSave}
			// Holds the shell's own skeleton until this page's panels are past
			// the datasource gate, so the restored arrangement never resolves
			// against an emptied registry — which the widget factory would then
			// cache for the life of the page.
			loading={!panelsReady}
		>
			{/* Not optional chrome: `GlobalDataSourcesProvider` and the layout
			    engine both call `useTemplates()` — the rail's Templates tab
			    among them — and that is a safe context, which throws when its
			    provider is absent. Without this the page does not render at
			    all. The datasource provider also brings the Datasources dialog,
			    which is how the operator points this page at their C2 host. */}
			<TemplatesProvider
				onLoad={loadTemplates}
				addTemplate={addTemplate}
				removeTemplate={removeTemplate}
				updateTemplate={updateTemplate}
			>
				<GlobalDataSourcesProvider>
					{/* Inside the shell, so it only ever runs after the saved
					    arrangement has been loaded. */}
					<MissionControlAutosave />
					{/* The rail comes with the engine: it is the only way to
					    put a panel back after closing one. */}
					<DashboardEngine />
				</GlobalDataSourcesProvider>
			</TemplatesProvider>
		</DashboardShell>
	);
}

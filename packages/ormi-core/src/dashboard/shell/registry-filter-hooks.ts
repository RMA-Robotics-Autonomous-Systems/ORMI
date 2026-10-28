import { PluginsHooks } from "@workspace/ormi-plugins";

/**
 * Every filter hook the shell's registry resolution reads, directly or from
 * inside another filter: `WIDGETS_LIST` and, through the datasource gate
 * `GlobalDataSourcesProvider` registers on it, `AVAILABLE_DATASOURCES` and
 * `WIDGET_LIST_WITH_DATASOURCE`; plus the datasource and layout-engine lists;
 * plus every hook a definition's `extensibilityHook` applies, since the shell
 * runs those during the same render.
 *
 * A registration on any of them re-renders the shell. Module-level so the
 * subscription keeps one identity.
 */
export const DASHBOARD_REGISTRY_FILTER_HOOKS: ReadonlyArray<
	string | PluginsHooks
> = [
	PluginsHooks.WIDGETS_LIST,
	PluginsHooks.WIDGET_LIST_WITH_DATASOURCE,
	PluginsHooks.AVAILABLE_DATASOURCES,
	PluginsHooks.DATASOURCES_LIST,
	PluginsHooks.DASHBOARD_LAYOUTS_LIST,
	// Owned by `ormi-std-widgets`: the standard map's `extensibilityHook`
	// (`widgets/maps/maps-box-viewer.tsx`) applies it to build the marker-type
	// enum. Core cannot import the plugin and has no way for one to contribute
	// a watched hook, so the name is spelled here; rename both together.
	"std-widgets-map-type",
];

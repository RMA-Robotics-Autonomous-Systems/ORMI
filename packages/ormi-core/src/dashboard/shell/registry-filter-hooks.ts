import { PluginsHooks } from "@workspace/ormi-plugins";

/**
 * Every filter hook the shell's registry resolution reads, directly or from
 * inside another filter: `WIDGETS_LIST` and, through the datasource gate
 * `GlobalDataSourcesProvider` registers on it, `AVAILABLE_DATASOURCES` and
 * `WIDGET_LIST_WITH_DATASOURCE`; plus the datasource and layout-engine lists.
 *
 * A registration on any of them re-renders the shell. Module-level so the
 * subscription keeps one identity.
 */
export const DASHBOARD_REGISTRY_FILTER_HOOKS: ReadonlyArray<PluginsHooks> = [
	PluginsHooks.WIDGETS_LIST,
	PluginsHooks.WIDGET_LIST_WITH_DATASOURCE,
	PluginsHooks.AVAILABLE_DATASOURCES,
	PluginsHooks.DATASOURCES_LIST,
	PluginsHooks.DASHBOARD_LAYOUTS_LIST,
];

import { DatasourceProviderSettings } from "@workspace/ormi-core/datasources";
import dataSourceExport, { widgetsExport, widgetFilters } from "./export";
import type { LoadgenPreset } from "./presets";
import { PluginsHooks, Plugin } from "@workspace/ormi-plugins";

/** Synthetic load generator datasource plugin registration. */
class LoadGeneratorPlugin extends Plugin {
	constructor() {
		super();

		this.name = "Load Generator";
		this.description =
			"Datasource that generates configurable synthetic load: many topics, tunable rates, payload shapes, bursts, and fault injection.";
		this.version = "1.0.0";
		this.author = "Lbcqu Florian";
		this.email = "florian.lebecque@mil.be";

		this.addFilter(PluginsHooks.DATASOURCES_LIST, {
			id: "loadgen-source-filter",
			priority: 10,
			filter: dataSourceExport,
		});

		this.addFilter(PluginsHooks.WIDGETS_LIST, {
			id: "loadgen-widgets-filter",
			priority: 10,
			filter: widgetsExport,
		});

		this.addFilter(PluginsHooks.WIDGET_LIST_WITH_DATASOURCE, {
			id: "loadgen-widgets-with-datasource",
			priority: 10,
			filter: widgetFilters,
		});
	}
}

/** One synthetic topic group, expanded to `<topicPrefix>/0 … <topicPrefix>/<topicCount-1>`. */
interface LoadgenGenerator {
	/** Topic name prefix; each generated topic is `<topicPrefix>/<index>`. */
	topicPrefix: string;
	/** Number of topics to expand this generator into. */
	topicCount: number;
	/** Payload shape published on each topic. */
	type: "scalar" | "object" | "pointcloud" | "malformed";
	/** Publish rate per topic, in Hz. */
	rateHz: number;
	/** Approximate payload size: object padding bytes; pointcloud point budget (12 bytes per point). */
	payloadBytes: number;
	/** Optional duty-cycle gating: publish only while `(now % periodMs) < periodMs * dutyPct / 100`. */
	burst?: { periodMs: number; dutyPct: number };
	/** Pointcloud only: transfer the positions buffer (fresh buffer per tick) instead of structured-cloning it. Defaults to falsy. */
	transfer?: boolean;
}

/** Fault injection knobs for the loadgen worker. */
interface LoadgenFaults {
	/** Silently terminate the worker (`self.close()`) this many ms after init. */
	crashAfterMs?: number;
	/** Stall every subscribe handler by this many ms before resolving. */
	subscribeHangMs?: number;
}

/** Settings for the loadgen datasource. */
interface LoadgenSettings extends DatasourceProviderSettings {
	/**
	 * Load intensity preset. A non-custom preset provisions a fixed generator
	 * mix and ignores `generators`; `custom` (or a legacy config with no
	 * preset) uses `generators`. See `resolveGenerators` in `./presets`.
	 */
	preset?: LoadgenPreset;
	/**
	 * Transport the datasource runs on. `worker` (default) decodes inside a Web
	 * Worker; `main-thread` reproduces the `ws://` main-thread pipeline via the
	 * shared coalescer. Orthogonal to `preset`. A missing value is treated as
	 * `worker` for back-compat with pre-transport configs.
	 */
	transport?: "worker" | "main-thread";
	generators: LoadgenGenerator[];
	faults?: LoadgenFaults;
}

export type { LoadgenSettings, LoadgenGenerator, LoadgenFaults };

export default LoadGeneratorPlugin;

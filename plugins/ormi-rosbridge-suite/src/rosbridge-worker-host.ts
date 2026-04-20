import type { PluginsManager } from "@workspace/ormi-plugins";
import { PluginsHooks } from "@workspace/ormi-plugins";
import type {
	DatasourceProviderSettings,
	DatasourceTopic,
	DatasourceTopicFilter,
	SelectedTopic,
} from "@workspace/ormi-core/datasources";
import { createRpcClient } from "@workspace/ormi-core/datasources/worker";
import type {
	RosbridgeWorkerMethods,
	RosbridgeWorkerEvents,
} from "./rosbridge-worker-protocol";
import type { RosBridgeSuiteDataSourceSettings } from "./types";

/**
 * Options for RosbridgeWorkerHost constructor.
 */
interface RosbridgeWorkerHostOptions<Settings = DatasourceProviderSettings> {
	worker: Worker;
	datasourceId: string;
	settings: Settings;
	pluginsManager: PluginsManager;
}

/**
 * Main-thread host that owns the Rosbridge Web Worker and bridges all
 * PluginsManager hooks to it via typed RPC.
 *
 * Mirrors FoxgloveWorkerHost but without services/remote-calls (not supported
 * by the rosbridge plugin).
 */
export class RosbridgeWorkerHost<
	Settings extends RosBridgeSuiteDataSourceSettings =
		RosBridgeSuiteDataSourceSettings,
> {
	private readonly worker: Worker;
	private readonly datasourceId: string;
	private readonly settings: Settings;
	private readonly pluginsManager: PluginsManager;
	private readonly rpc;
	private readonly disposers: Array<() => void> = [];
	private initPromise: Promise<void> | null = null;

	constructor(options: RosbridgeWorkerHostOptions<Settings>) {
		this.worker = options.worker;
		this.datasourceId = options.datasourceId;
		this.settings = options.settings;
		this.pluginsManager = options.pluginsManager;
		this.rpc = createRpcClient<
			RosbridgeWorkerMethods<Settings>,
			RosbridgeWorkerEvents
		>(this.worker);

		this.registerEventHandlers();
	}

	/** Subscribe to connection status events from the worker. */
	onConnectionStatus(
		handler: (status: RosbridgeWorkerEvents["connection-status"]) => void,
	): () => void {
		return this.rpc.onEvent("connection-status", handler);
	}

	async init(): Promise<void> {
		this.initPromise = this.rpc.call("init", this.settings);
		await this.initPromise;
	}

	/** Register all PluginsManager hooks forwarded to the worker. */
	registerHooks(): void {
		const availableTopicsHook = `${this.datasourceId}-available-topics`;
		const subscribeHook = `${this.datasourceId}-subscribe`;
		const unsubscribeHook = `${this.datasourceId}-unsubscribe`;
		const definitionHook = `${this.datasourceId}-definition`;
		const availableTypesHook = `${this.datasourceId}-available-types`;
		const advertiseHook = `${this.datasourceId}-advertise`;
		const unadvertiseHook = `${this.datasourceId}-unadvertise`;

		this.pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: availableTopicsHook,
			priority: 10,
			filter: async (
				topics: DatasourceTopic[],
				filter?: DatasourceTopicFilter,
			) => {
				if (this.initPromise) await this.initPromise;
				const workerTopics = await this.rpc.call("listTopics");
				const toAdd = filter
					? workerTopics.filter((t) => filter.filter(t))
					: workerTopics;
				topics.push(...toAdd);
				return topics;
			},
		});

		this.pluginsManager.addAction(subscribeHook, {
			id: subscribeHook,
			priority: 10,
			action: async (topic: SelectedTopic) => {
				if (this.initPromise) await this.initPromise;
				await this.rpc.call("subscribe", topic as any);
			},
		});

		this.pluginsManager.addAction(unsubscribeHook, {
			id: unsubscribeHook,
			priority: 10,
			action: async (topic: SelectedTopic, ignoreCount?: boolean) => {
				if (this.initPromise) await this.initPromise;
				await this.rpc.call("unsubscribe", topic as any, ignoreCount);
			},
		});

		this.pluginsManager.addFilter(definitionHook, {
			id: definitionHook,
			priority: 10,
			filter: async (_definition: unknown, topic?: DatasourceTopic) => {
				if (!topic) return this.settings;
				if (this.initPromise) await this.initPromise;
				return await this.rpc.call("getDefinition", topic);
			},
		});

		this.pluginsManager.addFilter(availableTypesHook, {
			id: availableTypesHook,
			priority: 10,
			filter: async (types: string[], webtypes: string[] = []) => {
				if (this.initPromise) await this.initPromise;
				const workerTypes = await this.rpc.call("listTypes", webtypes);
				return workerTypes.length > 0 ? workerTypes : types;
			},
		});

		this.pluginsManager.addFilter(advertiseHook, {
			id: advertiseHook,
			priority: 10,
			filter: async (topic: DatasourceTopic) => {
				if (this.initPromise) await this.initPromise;
				const success = await this.rpc.call("advertise", topic);
				if (success) {
					const publishHook = `${this.datasourceId}-${topic.topic}-publish`;
					this.pluginsManager.removeAction(publishHook);
					this.pluginsManager.addAction(publishHook, {
						id: publishHook,
						priority: 10,
						action: async (
							selectedTopic: DatasourceTopic,
							message: unknown,
							webtype: string,
						) => {
							await this.rpc.call(
								"publish",
								selectedTopic,
								message,
								webtype,
							);
						},
					});
				}
				return success;
			},
		});

		this.pluginsManager.addAction(unadvertiseHook, {
			id: unadvertiseHook,
			priority: 10,
			action: async (topic: DatasourceTopic, ignoreCount = false) => {
				if (this.initPromise) await this.initPromise;
				await this.rpc.call("unadvertise", topic, ignoreCount);
				const publishHook = `${this.datasourceId}-${topic.topic}-publish`;
				this.pluginsManager.removeAction(publishHook);
			},
		});

		this.disposers.push(() => {
			this.pluginsManager.removeFilter(availableTopicsHook);
			this.pluginsManager.removeAction(subscribeHook);
			this.pluginsManager.removeAction(unsubscribeHook);
			this.pluginsManager.removeFilter(definitionHook);
			this.pluginsManager.removeFilter(availableTypesHook);
			this.pluginsManager.removeFilter(advertiseHook);
			this.pluginsManager.removeAction(unadvertiseHook);
		});
	}

	dispose(): void {
		this.disposers.forEach((d) => d());
		this.disposers.length = 0;

		const shutdownTimeout = setTimeout(() => {
			console.warn(
				`[Rosbridge Worker] Graceful shutdown timeout for ${this.datasourceId}, forcing termination`,
			);
			this.worker.terminate();
		}, 5000);

		this.rpc
			.call("shutdown")
			.catch(() => {})
			.finally(() => {
				clearTimeout(shutdownTimeout);
				this.rpc.dispose();
				this.worker.terminate();
			});
	}

	private registerEventHandlers(): void {
		const unsub = this.rpc.onEvent("topic-published", (payload) => {
			this.pluginsManager.doAction(
				`${this.datasourceId}-${payload.topic}-published`,
				payload.data,
				payload.time,
				payload.referenceFrameId,
			);
		});
		this.disposers.push(unsub);
	}
}

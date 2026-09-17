import type { PluginsManager } from "@workspace/ormi-plugins";
import { PluginsHooks } from "@workspace/ormi-plugins";
import { metrics, type CounterId } from "@workspace/utils";
import type {
	DatasourceProviderSettings,
	DatasourceTopic,
	DatasourceTopicFilter,
	RemoteCallDefinition,
	RemoteCallHandle,
	RemoteCallOptions,
	RemoteCallResult,
	RemoteCallStatus,
} from "@workspace/ormi-core/datasources";
import {
	clearRemoteCallsFromDatasource,
	setRemoteCalls,
} from "@workspace/ormi-core/datasources";
import {
	createRpcClient,
	withRpcTimeout,
} from "@workspace/ormi-core/datasources";
import type {
	FoxgloveWorkerEvents,
	FoxgloveWorkerMethods,
} from "./foxglove-worker-protocol";

/**
 * Options for FoxgloveWorkerHost constructor.
 */
interface FoxgloveWorkerHostOptions<Settings = DatasourceProviderSettings> {
	worker: Worker;
	datasourceId: string;
	settings: Settings;
	pluginsManager: PluginsManager;
}

/**
 * Longest the topic list waits for one worker datasource before listing none
 * for it.
 *
 * `AVAILABLE_TOPICS` is applied sequentially across every configured
 * datasource, so this is the bound on how long ONE datasource can hold up
 * everyone else's rows. Generous next to a healthy round-trip (single-digit
 * ms) and short next to the poll that will ask again in two seconds, so a
 * datasource that is merely slow to connect loses nothing: it lists no topics
 * until it has some, which is the truth.
 */
const LIST_TOPICS_TIMEOUT_MS = 4000;

/**
 * Manages communication with Foxglove worker thread.
 * @template Settings - Datasource provider settings type.
 */
export class FoxgloveWorkerHost<Settings = DatasourceProviderSettings> {
	private readonly worker: Worker;
	private readonly datasourceId: string;
	private readonly settings: Settings;
	private readonly pluginsManager: PluginsManager;
	private readonly rpc;
	private readonly disposers: Array<() => void> = [];
	private readonly remoteCallStatusHandlers = new Map<
		string,
		Set<(status: RemoteCallStatus) => void>
	>();
	private readonly remoteCallFeedbackHandlers = new Map<
		string,
		Set<(feedback: unknown) => void>
	>();
	private readonly remoteCallResultHandlers = new Map<
		string,
		(result: RemoteCallResult) => void
	>();
	private initPromise: Promise<void> | null = null;
	/** Set once `init` has rejected; see {@link FoxgloveWorkerHost.ready}. */
	private initFailed = false;

	constructor(options: FoxgloveWorkerHostOptions<Settings>) {
		this.worker = options.worker;
		this.datasourceId = options.datasourceId;
		this.settings = options.settings;
		this.pluginsManager = options.pluginsManager;
		this.rpc = createRpcClient<
			FoxgloveWorkerMethods<Settings>,
			FoxgloveWorkerEvents
		>(this.worker);

		this.registerEventHandlers();
	}

	onConnectionStatus(
		handler: (status: FoxgloveWorkerEvents["connection-status"]) => void,
	): () => void {
		return this.rpc.onEvent("connection-status", handler);
	}

	async init(): Promise<void> {
		const pending = this.rpc.call("init", this.settings);
		this.initPromise = pending;
		// Recorded here rather than at each await site: the stored promise is
		// awaited from every hook, and a rejection has to be remembered, not
		// re-thrown forever.
		pending.catch(() => {
			this.initFailed = true;
		});
		await pending;
	}

	/**
	 * Wait for the worker's `init` when waiting can still help.
	 *
	 * `init` rejects on an unreachable endpoint or after its 10 s connect
	 * timeout — an ordinary outcome for a datasource the operator is still
	 * configuring, and the normal first state of one added to a fresh
	 * workspace. The promise is created once and never replaced, so awaiting it
	 * after a failure re-throws the same rejection for the rest of the session,
	 * long after the worker has reconnected on its own. Once init has failed the
	 * host stops waiting and simply asks the worker, which answers from its
	 * current connection state.
	 */
	private async ready(): Promise<void> {
		if (!this.initPromise || this.initFailed) return;
		try {
			await this.initPromise;
		} catch {
			this.initFailed = true;
		}
	}

	registerHooks(): void {
		const availableTopicsHook = `${this.datasourceId}-available-topics`;
		const subscribeHook = `${this.datasourceId}-subscribe`;
		const unsubscribeHook = `${this.datasourceId}-unsubscribe`;
		const definitionHook = `${this.datasourceId}-definition`;
		const availableTypesHook = `${this.datasourceId}-available-types`;
		const executeRemoteCallHook = `${this.datasourceId}-execute-remote-call`;
		const advertiseHook = `${this.datasourceId}-advertise`;
		const unadvertiseHook = `${this.datasourceId}-unadvertise`;

		// `AVAILABLE_TOPICS` is applied sequentially across every datasource in
		// the workspace and has no per-contributor isolation: whatever this
		// filter throws takes the ENTIRE topic list down, including the topics
		// of datasources that are perfectly healthy, and the list stays empty
		// for as long as the page is open. A datasource that cannot connect
		// contributes no rows; it does not get to blank the panel.
		this.pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: availableTopicsHook,
			priority: 10,
			filter: async (
				topics: DatasourceTopic[],
				filter?: DatasourceTopicFilter,
			) => {
				try {
					// Bounded end to end: `ready()` can wait on a worker that
					// never answers at all (one that failed to load never runs
					// its own connect timeout), and so can the call itself.
					const workerTopics = await withRpcTimeout(
						(async () => {
							await this.ready();
							return await this.rpc.call("listTopics");
						})(),
						LIST_TOPICS_TIMEOUT_MS,
						[] as DatasourceTopic[],
					);
					const toAdd = filter
						? workerTopics.filter((t) => filter.filter(t))
						: workerTopics;
					topics.push(...toAdd);
				} catch (error) {
					console.warn(
						`[${this.datasourceId}] failed to list topics`,
						error,
					);
				}
				return topics;
			},
		});

		this.pluginsManager.addAction(subscribeHook, {
			id: subscribeHook,
			priority: 10,
			action: async (topic: DatasourceTopic) => {
				await this.ready();
				await this.rpc.call("subscribe", topic as any);
			},
		});

		this.pluginsManager.addAction(unsubscribeHook, {
			id: unsubscribeHook,
			priority: 10,
			action: async (topic: DatasourceTopic, ignoreCount?: boolean) => {
				await this.ready();
				await this.rpc.call("unsubscribe", topic as any, ignoreCount);
			},
		});

		this.pluginsManager.addFilter(definitionHook, {
			id: definitionHook,
			priority: 10,
			filter: async (definition: unknown, topic?: DatasourceTopic) => {
				if (!topic) {
					return this.settings;
				}
				await this.ready();
				return await this.rpc.call("getDefinition", topic);
			},
		});

		this.pluginsManager.addFilter(availableTypesHook, {
			id: availableTypesHook,
			priority: 10,
			filter: async (types: string[], webtypes: string[] = []) => {
				await this.ready();
				const workerTypes = await this.rpc.call("listTypes", webtypes);
				return workerTypes.length > 0 ? workerTypes : types;
			},
		});

		this.pluginsManager.addFilter(advertiseHook, {
			id: advertiseHook,
			priority: 10,
			filter: async (topic: DatasourceTopic) => {
				await this.ready();
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
				await this.ready();
				await this.rpc.call("unadvertise", topic, ignoreCount);
				const publishHook = `${this.datasourceId}-${topic.topic}-publish`;
				this.pluginsManager.removeAction(publishHook);
			},
		});

		this.pluginsManager.addFilter(executeRemoteCallHook, {
			id: executeRemoteCallHook,
			priority: 10,
			filter: async (
				current: RemoteCallHandle | null,
				definition: RemoteCallDefinition,
				request: unknown,
				options?: RemoteCallOptions,
			) => {
				if (definition.datasource_id !== this.datasourceId) {
					return current;
				}

				try {
					await this.ready();
					const handleWire = await this.rpc.call(
						"executeRemoteCall",
						definition,
						request,
						options,
					);
					return this.createRemoteCallHandle(handleWire);
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					const errorResult: RemoteCallResult = {
						success: false,
						error: errorMessage,
						duration: 0,
						status: "failed",
					};
					return {
						id: "error",
						status: "failed",
						result: Promise.resolve(errorResult),
						onStatusChange: () => () => {},
					} as RemoteCallHandle;
				}
			},
		});

		this.disposers.push(() => {
			this.pluginsManager.removeFilter(availableTopicsHook);
			this.pluginsManager.removeAction(subscribeHook);
			this.pluginsManager.removeAction(unsubscribeHook);
			this.pluginsManager.removeFilter(definitionHook);
			this.pluginsManager.removeFilter(availableTypesHook);
			this.pluginsManager.removeFilter(executeRemoteCallHook);
			this.pluginsManager.removeFilter(advertiseHook);
			this.pluginsManager.removeAction(unadvertiseHook);
		});
	}

	dispose(): void {
		// Cleanup disposers
		this.disposers.forEach((dispose) => dispose());
		this.disposers.length = 0;

		// Reject all pending remote calls
		this.remoteCallResultHandlers.forEach((resolve, callId) => {
			resolve({
				success: false,
				error: "Datasource disposed",
				duration: 0,
				status: "failed",
			});
		});
		this.remoteCallResultHandlers.clear();
		this.remoteCallStatusHandlers.clear();
		this.remoteCallFeedbackHandlers.clear();

		clearRemoteCallsFromDatasource(this.datasourceId);

		// Attempt graceful shutdown
		const shutdownTimeout = setTimeout(() => {
			console.error(
				`[Foxglove Worker] Graceful shutdown timeout for ${this.datasourceId}, forcing termination`,
			);
			this.worker.terminate();
		}, 5000);

		this.rpc
			.call("shutdown")
			.catch(() => {
				// Ignore shutdown errors
			})
			.finally(() => {
				clearTimeout(shutdownTimeout);
				this.rpc.dispose();
				this.worker.terminate();
			});
	}

	private registerEventHandlers(): void {
		// Cold-path metric registration. `ds.<id>.published` counts every emit
		// the worker drains to the host — after worker-side coalescing this is
		// the COALESCED (drain-tick) rate. The per-topic `produced` counters
		// (folded from the worker's 1 Hz snapshot below) carry the WIRE rate, so
		// produced-vs-published exposes the coalescing drop ratio.
		const publishedId = metrics.counter(
			`ds.${this.datasourceId}.published`,
		);
		const producedIds = new Map<string, CounterId>();
		const lastProduced = new Map<string, number>();
		// Per-topic hook-name cache: the `-published` action name is invariant per
		// topic, so build it once instead of concatenating on every drained message.
		const publishedHooks = new Map<string, string>();

		const topicUnsub = this.rpc.onEvent("topic-published", (payload) => {
			metrics.add(publishedId);
			let hook = publishedHooks.get(payload.topic);
			if (hook === undefined) {
				hook = `${this.datasourceId}-${payload.topic}-published`;
				publishedHooks.set(payload.topic, hook);
			}
			this.pluginsManager.doAction(
				hook,
				payload.data,
				payload.time,
				payload.referenceFrameId,
			);
		});

		// Fold the worker's cumulative per-topic wire-rate counts into this
		// runtime's metrics registry by diffing consecutive 1 Hz snapshots.
		const metricsUnsub = this.rpc.onEvent("metrics-snapshot", (payload) => {
			for (const topic in payload.produced) {
				const cumulative = payload.produced[topic]!;
				let id = producedIds.get(topic);
				if (id === undefined) {
					id = metrics.counter(
						`ds.${this.datasourceId}.topic.${topic}.produced`,
					);
					producedIds.set(topic, id);
				}
				const delta = cumulative - (lastProduced.get(topic) ?? 0);
				lastProduced.set(topic, cumulative);
				if (delta > 0) metrics.add(id, delta);
			}
		});

		const callsUnsub = this.rpc.onEvent("remote-calls", (payload) => {
			setRemoteCalls(this.datasourceId, payload.calls);
		});

		const resultUnsub = this.rpc.onEvent(
			"remote-call-result",
			(payload) => {
				const handler = this.remoteCallResultHandlers.get(
					payload.callId,
				);
				if (handler) {
					handler(payload.result);
					this.remoteCallResultHandlers.delete(payload.callId);
					this.remoteCallStatusHandlers.delete(payload.callId);
					this.remoteCallFeedbackHandlers.delete(payload.callId);
				}
			},
		);

		this.disposers.push(topicUnsub, metricsUnsub, callsUnsub, resultUnsub);
	}

	private createRemoteCallHandle(handleWire: {
		callId: string;
		status?: RemoteCallStatus;
	}): RemoteCallHandle {
		// Set up timeout to prevent memory leaks from pending calls
		const timeoutMs = 300000; // 5 minutes default timeout
		const timeoutId = setTimeout(() => {
			const handler = this.remoteCallResultHandlers.get(
				handleWire.callId,
			);
			if (handler) {
				handler({
					success: false,
					error: `Remote call timed out after ${timeoutMs}ms`,
					duration: timeoutMs,
					status: "failed",
				});
				this.remoteCallResultHandlers.delete(handleWire.callId);
				this.remoteCallStatusHandlers.delete(handleWire.callId);
				this.remoteCallFeedbackHandlers.delete(handleWire.callId);
			}
		}, timeoutMs);

		const resultPromise = new Promise<RemoteCallResult>((resolve) => {
			this.remoteCallResultHandlers.set(handleWire.callId, (result) => {
				clearTimeout(timeoutId);
				resolve(result);
			});
		});

		return {
			id: handleWire.callId,
			status: handleWire.status ?? "pending",
			result: resultPromise,
			onFeedback: (callback) => {
				const set =
					this.remoteCallFeedbackHandlers.get(handleWire.callId) ??
					new Set();
				set.add(callback as (feedback: unknown) => void);
				this.remoteCallFeedbackHandlers.set(handleWire.callId, set);
				return () => {
					const current = this.remoteCallFeedbackHandlers.get(
						handleWire.callId,
					);
					if (!current) return;
					current.delete(callback as (feedback: unknown) => void);
				};
			},
			onStatusChange: (callback) => {
				const set =
					this.remoteCallStatusHandlers.get(handleWire.callId) ??
					new Set();
				set.add(callback);
				this.remoteCallStatusHandlers.set(handleWire.callId, set);
				if (handleWire.status) {
					callback(handleWire.status);
				}
				return () => {
					const current = this.remoteCallStatusHandlers.get(
						handleWire.callId,
					);
					if (!current) return;
					current.delete(callback);
				};
			},
			cancel: async () => false,
		} as RemoteCallHandle;
	}
}

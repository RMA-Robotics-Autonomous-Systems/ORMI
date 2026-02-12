import type { PluginsManager } from "@workspace/ormi-plugins";
import { PluginsHooks } from "@workspace/ormi-plugins";
import type {
	DatasourceProviderSettings,
	DatasourceTopicFilter,
	DatasourceTopic,
	SelectedTopic,
} from "../datasource-interface";
import type {
	RemoteCallDefinition,
	RemoteCallHandle,
	RemoteCallOptions,
	RemoteCallResult,
	RemoteCallStatus,
} from "../remote-call-interface";
import {
	setRemoteCalls,
	clearRemoteCallsFromDatasource,
} from "../remote-call-atoms";
import type {
	DatasourceWorkerEvents,
	DatasourceWorkerMethods,
	RemoteCallHandleWire,
} from "./protocol";
import { createRpcClient } from "./rpc";

/** Options for configuring a worker datasource host. */
interface WorkerDatasourceHostOptions<Settings = DatasourceProviderSettings> {
	worker: Worker;
	datasourceId: string;
	settings: Settings;
	pluginsManager: PluginsManager;
}

/** Worker host that proxies datasource hooks to a Web Worker. */
export class WorkerDatasourceHost<Settings = DatasourceProviderSettings> {
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

	constructor(options: WorkerDatasourceHostOptions<Settings>) {
		this.worker = options.worker;
		this.datasourceId = options.datasourceId;
		this.settings = options.settings;
		this.pluginsManager = options.pluginsManager;
		this.rpc = createRpcClient<
			DatasourceWorkerMethods<Settings>,
			DatasourceWorkerEvents
		>(this.worker);

		this.registerEventHandlers();
	}

	async init(): Promise<void> {
		this.initPromise = this.rpc.call("init", this.settings);
		await this.initPromise;
	}

	registerHooks(): void {
		const availableTopicsHook = `${this.datasourceId}-available-topics`;
		const subscribeHook = `${this.datasourceId}-subscribe`;
		const unsubscribeHook = `${this.datasourceId}-unsubscribe`;
		const definitionHook = `${this.datasourceId}-definition`;
		const executeRemoteCallHook = `${this.datasourceId}-execute-remote-call`;

		this.pluginsManager.addFilter(PluginsHooks.AVAILABLE_TOPICS, {
			id: availableTopicsHook,
			priority: 10,
			filter: async (
				topics: DatasourceTopic[],
				filter?: DatasourceTopicFilter,
			) => {
				if (this.initPromise) {
					await this.initPromise;
				}
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
				if (this.initPromise) {
					await this.initPromise;
				}
				await this.rpc.call("subscribe", topic);
			},
		});

		this.pluginsManager.addAction(unsubscribeHook, {
			id: unsubscribeHook,
			priority: 10,
			action: async (topic: SelectedTopic, ignoreCount?: boolean) => {
				if (this.initPromise) {
					await this.initPromise;
				}
				await this.rpc.call("unsubscribe", topic, ignoreCount);
			},
		});

		this.pluginsManager.addFilter(definitionHook, {
			id: definitionHook,
			priority: 10,
			filter: () => this.settings,
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
					if (this.initPromise) {
						await this.initPromise;
					}
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
			this.pluginsManager.removeFilter(executeRemoteCallHook);
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
			console.warn(
				`[Worker Host] Graceful shutdown timeout for ${this.datasourceId}, forcing termination`,
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
		const topicUnsub = this.rpc.onEvent("topic-published", (payload) => {
			this.pluginsManager.doAction(
				`${this.datasourceId}-${payload.topic}-published`,
				payload.data,
				payload.time,
				payload.referenceFrameId,
			);
		});

		const callsUnsub = this.rpc.onEvent("remote-calls", (payload) => {
			setRemoteCalls(this.datasourceId, payload.calls);
		});

		const statusUnsub = this.rpc.onEvent(
			"remote-call-status",
			(payload) => {
				const handlers = this.remoteCallStatusHandlers.get(
					payload.callId,
				);
				if (!handlers) return;
				handlers.forEach((handler) => handler(payload.status));
			},
		);

		const feedbackUnsub = this.rpc.onEvent(
			"remote-call-feedback",
			(payload) => {
				const handlers = this.remoteCallFeedbackHandlers.get(
					payload.callId,
				);
				if (!handlers) return;
				handlers.forEach((handler) => handler(payload.feedback));
			},
		);

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

		this.disposers.push(
			topicUnsub,
			callsUnsub,
			statusUnsub,
			feedbackUnsub,
			resultUnsub,
		);
	}

	private createRemoteCallHandle(
		handleWire: RemoteCallHandleWire,
	): RemoteCallHandle {
		const resultPromise = new Promise<RemoteCallResult>((resolve) => {
			this.remoteCallResultHandlers.set(handleWire.callId, resolve);
		});
		const cancel = this.rpc.call.bind(this.rpc, "cancelRemoteCall");

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
			cancel: async () => {
				try {
					return await cancel(handleWire.callId);
				} catch {
					return false;
				}
			},
		} as RemoteCallHandle;
	}
}

/// <reference lib="webworker" />

import type {
	DatasourceProviderSettings,
	DatasourceTopic,
	SelectedTopic,
} from "../datasource-interface";
import type {
	RemoteCallDefinition,
	RemoteCallOptions,
	RemoteCallResult,
	RemoteCallStatus,
} from "../remote-call-interface";
import type {
	DatasourceWorkerEvents,
	DatasourceWorkerMethods,
	RemoteCallHandleWire,
} from "./protocol";
import { createRpcServer } from "./rpc";

/** Datasource worker implementation contract. */
export interface DatasourceWorkerImplementation<
	Settings = DatasourceProviderSettings,
> {
	init: (settings: Settings) => void | Promise<void>;
	listTopics: () => DatasourceTopic[] | Promise<DatasourceTopic[]>;
	subscribe: (topic: SelectedTopic) => void | Promise<void>;
	unsubscribe: (
		topic: SelectedTopic,
		ignoreCount?: boolean,
	) => void | Promise<void>;
	executeRemoteCall: (
		definition: RemoteCallDefinition,
		request: unknown,
		options?: RemoteCallOptions,
	) => Promise<RemoteCallHandleWire> | RemoteCallHandleWire;
	cancelRemoteCall: (callId: string) => Promise<boolean> | boolean;
	shutdown: () => void | Promise<void>;
}

/** Context exposed to a datasource worker implementation. */
export interface DatasourceWorkerContext {
	publish: (
		topic: string,
		data: unknown,
		time?: number,
		referenceFrameId?: string,
		transfer?: Transferable[],
	) => void;
	setRemoteCalls: (calls: RemoteCallDefinition[]) => void;
	emitRemoteCallStatus: (callId: string, status: RemoteCallStatus) => void;
	emitRemoteCallFeedback: (callId: string, feedback: unknown) => void;
	emitRemoteCallResult: (callId: string, result: RemoteCallResult) => void;
}

/**
 * Create and register a datasource worker RPC server.
 * @param factory - Factory that returns the worker implementation.
 */
export function createDatasourceWorker<Settings = DatasourceProviderSettings>(
	factory: (
		context: DatasourceWorkerContext,
	) => DatasourceWorkerImplementation<Settings>,
): void {
	const target = self as DedicatedWorkerGlobalScope;
	let emit:
		| ((
				event: keyof DatasourceWorkerEvents,
				payload: DatasourceWorkerEvents[keyof DatasourceWorkerEvents],
				transfer?: Transferable[],
		  ) => void)
		| null = null;

	// Worker-local cumulative publish counters, coalesced into a 1 Hz
	// "metrics-snapshot" event. Deliberately a plain Map (no metrics module in
	// the worker): the hot-path cost is one Map.get/set per publish. The
	// interval starts lazily on the first publish and emits only when counts
	// changed since the last snapshot.
	const producedCounts = new Map<string, number>();
	let producedDirty = false;
	let producedTimer: ReturnType<typeof setInterval> | null = null;

	const emitProducedSnapshot = () => {
		if (!producedDirty) return;
		producedDirty = false;
		const produced: Record<string, number> = {};
		producedCounts.forEach((count, topic) => {
			produced[topic] = count;
		});
		emit?.("metrics-snapshot", { produced });
	};

	const context: DatasourceWorkerContext = {
		publish: (
			topic,
			data,
			time = Date.now(),
			referenceFrameId,
			transfer,
		) => {
			producedCounts.set(topic, (producedCounts.get(topic) ?? 0) + 1);
			producedDirty = true;
			if (producedTimer === null) {
				producedTimer = setInterval(emitProducedSnapshot, 1000);
			}
			emit?.(
				"topic-published",
				{ topic, data, time, referenceFrameId },
				transfer,
			);
		},
		setRemoteCalls: (calls) => {
			emit?.("remote-calls", { calls });
		},
		emitRemoteCallStatus: (callId, status) => {
			emit?.("remote-call-status", { callId, status });
		},
		emitRemoteCallFeedback: (callId, feedback) => {
			emit?.("remote-call-feedback", { callId, feedback });
		},
		emitRemoteCallResult: (callId, result) => {
			emit?.("remote-call-result", { callId, result });
		},
	};

	const implementation = factory(context);

	const server = createRpcServer<
		DatasourceWorkerMethods<Settings>,
		DatasourceWorkerEvents
	>(
		target as unknown as {
			postMessage: DedicatedWorkerGlobalScope["postMessage"];
			addEventListener: DedicatedWorkerGlobalScope["addEventListener"];
			removeEventListener: DedicatedWorkerGlobalScope["removeEventListener"];
		},
		{
			init: implementation.init,
			listTopics: implementation.listTopics,
			subscribe: implementation.subscribe,
			unsubscribe: implementation.unsubscribe,
			executeRemoteCall: implementation.executeRemoteCall,
			cancelRemoteCall: implementation.cancelRemoteCall,
			shutdown: () => {
				if (producedTimer !== null) {
					clearInterval(producedTimer);
					producedTimer = null;
				}
				return implementation.shutdown?.();
			},
		},
	);

	emit = server.emit;
}

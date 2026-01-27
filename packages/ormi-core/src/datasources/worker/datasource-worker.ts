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

  const context: DatasourceWorkerContext = {
    publish: (topic, data, time = Date.now(), referenceFrameId, transfer) => {
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
      shutdown: implementation.shutdown ?? (() => undefined),
    },
  );

  emit = server.emit;
}

import type {
	DatasourceTopic,
	SelectedTopic,
	DatasourceProviderSettings,
} from "../datasource-interface";
import type { RpcMethodMap } from "./rpc";
import type {
	RemoteCallDefinition,
	RemoteCallOptions,
	RemoteCallResult,
	RemoteCallStatus,
} from "../remote-call-interface";

/** RPC methods exposed by a datasource worker. */
export interface DatasourceWorkerMethods<
	Settings = DatasourceProviderSettings,
> extends RpcMethodMap {
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

/** Wire format for remote call handle metadata. */
export interface RemoteCallHandleWire {
	callId: string;
	status?: RemoteCallStatus;
}

/** Events emitted by a datasource worker. */
export interface DatasourceWorkerEvents {
	"topic-published": {
		topic: string;
		data: unknown;
		time: number;
		referenceFrameId?: string;
	};
	"remote-calls": {
		calls: RemoteCallDefinition[];
	};
	"remote-call-status": {
		callId: string;
		status: RemoteCallStatus;
	};
	"remote-call-feedback": {
		callId: string;
		feedback: unknown;
	};
	"remote-call-result": {
		callId: string;
		result: RemoteCallResult;
	};
}

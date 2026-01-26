import type {
    DatasourceTopic,
    DatasourceProviderSettings,
} from "@workspace/ormi-core/datasources";
import type {
    DatasourceWorkerMethods,
    DatasourceWorkerEvents,
} from "@workspace/ormi-core/datasources/worker";
import type {
    RemoteCallDefinition,
    RemoteCallOptions,
    RemoteCallResult,
} from "@workspace/ormi-core/datasources";

export interface FoxgloveWorkerMethods<
    Settings = DatasourceProviderSettings,
> extends DatasourceWorkerMethods<Settings> {
    listTypes: (webtypes?: string[]) => string[] | Promise<string[]>;
    getDefinition: (topic: DatasourceTopic) => unknown | Promise<unknown>;
    advertise: (topic: DatasourceTopic) => boolean | Promise<boolean>;
    unadvertise: (
        topic: DatasourceTopic,
        ignoreCount?: boolean,
    ) => void | Promise<void>;
    publish: (
        topic: DatasourceTopic,
        message: unknown,
        webtype: string,
    ) => void | Promise<void>;
    getConnectionStatus: () => {
        connected: boolean;
        error?: string;
        reconnectAttempt?: number;
    };
}

export interface FoxgloveWorkerEvents extends DatasourceWorkerEvents {
    "connection-status": {
        connected: boolean;
        error?: string;
        reconnectAttempt?: number;
    };
    "remote-calls": {
        calls: RemoteCallDefinition[];
    };
    "remote-call-result": {
        callId: string;
        result: RemoteCallResult;
    };
}

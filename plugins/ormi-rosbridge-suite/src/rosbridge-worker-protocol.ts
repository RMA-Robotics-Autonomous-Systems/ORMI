import type {
	DatasourceTopic,
	DatasourceProviderSettings,
} from "@workspace/ormi-core/datasources";
import type {
	DatasourceWorkerMethods,
	DatasourceWorkerEvents,
} from "@workspace/ormi-core/datasources/worker";

/**
 * Extended RPC methods for the Rosbridge datasource worker.
 * Adds topic-type discovery, publisher lifecycle, and connection status
 * on top of the base subscribe/unsubscribe/listTopics set.
 */
export interface RosbridgeWorkerMethods<
	Settings = DatasourceProviderSettings,
> extends DatasourceWorkerMethods<Settings> {
	/** Returns all known ROS interface type names, optionally filtered to those
	 *  compatible with the requested webapp types. */
	listTypes: (webtypes?: string[]) => string[] | Promise<string[]>;
	/** Returns a JsonSchema for the given topic's message type. */
	getDefinition: (topic: DatasourceTopic) => unknown | Promise<unknown>;
	/** Advertises a publisher on the given topic. Returns true on success. */
	advertise: (topic: DatasourceTopic) => boolean | Promise<boolean>;
	/** Unadvertises a publisher, honouring ref-counting unless ignoreCount is set. */
	unadvertise: (
		topic: DatasourceTopic,
		ignoreCount?: boolean,
	) => void | Promise<void>;
	/** Publishes a message on a previously advertised topic. */
	publish: (
		topic: DatasourceTopic,
		message: unknown,
		webtype: string,
	) => void | Promise<void>;
	/** Returns the current connection state synchronously. */
	getConnectionStatus: () => {
		connected: boolean;
		error?: string;
		reconnectAttempt?: number;
	};
}

/**
 * Events emitted by the Rosbridge datasource worker.
 */
export interface RosbridgeWorkerEvents extends DatasourceWorkerEvents {
	/** Fired whenever the WebSocket connection state changes. */
	"connection-status": {
		connected: boolean;
		error?: string;
		reconnectAttempt?: number;
	};
}

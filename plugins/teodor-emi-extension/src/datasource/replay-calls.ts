/**
 * Replay transport, expressed as remote calls.
 *
 * Play, pause, seek and rate are datasource operations, so they go through the
 * mechanism ORMI already has for those rather than a private channel of this
 * plugin's own. That buys the remote-call explorer, the status plumbing and the
 * existing atoms for free, and it means a replay can be driven from any widget
 * — or scripted — without a dependency on the page that usually drives it.
 *
 * Shared by the worker (which implements them) and the UI (which calls them),
 * so the names cannot drift apart.
 */

import type {
	DatasourceProviderSettings,
	RemoteCallDefinition,
} from "@workspace/ormi-core/datasources";

/** Names of the replay transport calls. */
export const REPLAY_CALLS = {
	play: "emi.replay.play",
	pause: "emi.replay.pause",
	seek: "emi.replay.seek",
	setRate: "emi.replay.setRate",
	status: "emi.replay.status",
} as const;

/** What every replay call returns. */
export interface ReplayStatus {
	bagName: string;
	playing: boolean;
	rate: number;
	/** Position in nanoseconds from the start of the recording. */
	positionNs: number;
	/** Length of the recording in nanoseconds. */
	durationNs: number;
	/** How many topics are currently being replayed. */
	subscribedTopics: number;
}

/** JSON Schema shared by the calls that take no argument. */
const EMPTY_REQUEST = { type: "object", properties: {} } as const;

/** JSON Schema of the status every call answers with. */
const STATUS_SCHEMA = {
	type: "object",
	properties: {
		bagName: { type: "string", title: "Recording" },
		playing: { type: "boolean", title: "Playing" },
		rate: { type: "number", title: "Rate" },
		positionNs: { type: "number", title: "Position (ns)" },
		durationNs: { type: "number", title: "Duration (ns)" },
		subscribedTopics: { type: "number", title: "Subscribed topics" },
	},
} as const;

/**
 * The replay transport, as remote-call definitions.
 *
 * @param settings - The datasource these calls belong to.
 * @returns One definition per transport operation.
 */
export function replayCallDefinitions(
	settings: DatasourceProviderSettings,
): RemoteCallDefinition[] {
	const base = {
		datasource_id: settings.id,
		source: settings,
		requestType: "object",
		responseType: "object",
		rawResponseType: "emi/ReplayStatus",
		responseSchema: STATUS_SCHEMA,
		cancelable: false,
	};

	return [
		{
			...base,
			name: REPLAY_CALLS.play,
			rawRequestType: "emi/Empty",
			requestSchema: EMPTY_REQUEST,
			description: "Resume replaying the recording.",
		},
		{
			...base,
			name: REPLAY_CALLS.pause,
			rawRequestType: "emi/Empty",
			requestSchema: EMPTY_REQUEST,
			description: "Hold the replay at its current position.",
		},
		{
			...base,
			name: REPLAY_CALLS.seek,
			rawRequestType: "emi/Seek",
			requestSchema: {
				type: "object",
				properties: {
					positionNs: {
						type: "number",
						title: "Position (ns from start)",
					},
				},
				required: ["positionNs"],
			},
			description:
				"Jump to a position. Re-opens every topic cursor, so seeking backwards works.",
		},
		{
			...base,
			name: REPLAY_CALLS.setRate,
			rawRequestType: "emi/Rate",
			requestSchema: {
				type: "object",
				properties: {
					rate: {
						type: "number",
						title: "Playback rate",
						minimum: 0.01,
					},
				},
				required: ["rate"],
			},
			description: "Change playback speed; 1 is real time.",
		},
		{
			...base,
			name: REPLAY_CALLS.status,
			rawRequestType: "emi/Empty",
			requestSchema: EMPTY_REQUEST,
			description: "Report position, rate and play state.",
		},
	];
}

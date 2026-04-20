export interface BagTopicInfo {
	id: number;
	name: string;
	type: string;
	messageCount: number;
}

export interface TimeSeriesPoint {
	/** Nanoseconds from bag start */
	timestamp: number;
	value: number;
}

export interface GpsPoint {
	/** Nanoseconds from bag start */
	timestamp: number;
	latitude: number;
	longitude: number;
	altitude: number | null;
}

export interface TopicData {
	topic: string;
	points: TimeSeriesPoint[];
}

export interface GpsTrack {
	topic: string;
	points: GpsPoint[];
}

export interface BagSummary {
	topics: BagTopicInfo[];
	/** Duration in nanoseconds */
	duration: number;
	messageCount: number;
}

// ---------------------------------------------------------------------------
// Playground data model
// ---------------------------------------------------------------------------

/**
 * A line series loaded from the bag for a single topic / topic field.
 * Multiple series can share the same `axisKey` to be grouped on one y-axis.
 */
export interface PlaygroundLineSeries {
	/** Human-readable label, e.g. "/cmd_vel linear.x" */
	name: string;
	/** Raw ROS topic name */
	topic: string;
	/** Y-axis group key — same key ⇒ same axis */
	axisKey: string;
	points: TimeSeriesPoint[];
}

/** A NavSatFix topic rendered as vertical event lines in the signal chart. */
export interface PlaygroundEventSeries {
	name: string;
	topic: string;
	/** Timestamps in nanoseconds from bag start */
	timestamps: number[];
}

/** All data returned by a single readAll worker call. */
export interface PlaygroundData {
	lineSeries: PlaygroundLineSeries[];
	eventSeries: PlaygroundEventSeries[];
	/** GPS track — empty when no GPS topic was requested */
	gps: GpsPoint[];
	/** Total bag duration in nanoseconds */
	duration: number;
}

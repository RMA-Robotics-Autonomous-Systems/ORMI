import type { GpsPoint } from "../bag-reader/bag-types";
import type { ClusterConfig } from "./detection-types";

/** Haversine distance between two GPS coordinates, in metres. */
function haversineM(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6_371_000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Binary search for the GPS point closest in time to `tsNs`.
 * Returns null if the GPS track is empty.
 */
export function gpsAtTimestamp(gps: GpsPoint[], tsNs: number): GpsPoint | null {
	if (gps.length === 0) return null;
	let lo = 0;
	let hi = gps.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (gps[mid]!.timestamp < tsNs) lo = mid + 1;
		else hi = mid;
	}
	// Compare lo and lo-1 to pick the closer one
	if (lo > 0) {
		const before = gps[lo - 1]!;
		const after = gps[lo]!;
		return Math.abs(before.timestamp - tsNs) <=
			Math.abs(after.timestamp - tsNs)
			? before
			: after;
	}
	return gps[lo]!;
}

/**
 * Port of `cluster_detections` from emibagprocessing/algorithms/adapters.py,
 * extended with haversine distance gating.
 *
 * Merges consecutive detected timestamps when BOTH conditions are met:
 *   • time gap < config.timeThresholdMs  (milliseconds)
 *   • haversine distance < config.distanceThresholdM  (metres)
 *
 * When `gps` is empty or null, only the time condition is applied.
 *
 * Returns the first timestamp of each cluster.
 */
export function clusterDetections(
	timestamps: number[], // ns from bag start, assumed sorted ascending
	gps: GpsPoint[],
	config: ClusterConfig,
): number[] {
	if (timestamps.length === 0) return [];

	const timeThresholdNs = config.timeThresholdMs * 1_000_000;
	const clusters: number[] = [timestamps[0]!];
	let clusterStart = timestamps[0]!;

	for (let i = 1; i < timestamps.length; i++) {
		const prev = timestamps[i - 1]!;
		const curr = timestamps[i]!;
		const dt = curr - prev;

		// Check time gate
		if (dt >= timeThresholdNs) {
			clusters.push(curr);
			clusterStart = curr;
			continue;
		}

		// Check haversine gate (only when GPS data is available)
		if (gps.length > 0) {
			const gpsPrev = gpsAtTimestamp(gps, clusterStart);
			const gpsCurr = gpsAtTimestamp(gps, curr);
			if (gpsPrev && gpsCurr) {
				const dist = haversineM(
					gpsPrev.latitude,
					gpsPrev.longitude,
					gpsCurr.latitude,
					gpsCurr.longitude,
				);
				if (dist >= config.distanceThresholdM) {
					clusters.push(curr);
					clusterStart = curr;
					continue;
				}
			}
		}
		// Both conditions say "same cluster" — keep only the first timestamp
	}

	return clusters;
}

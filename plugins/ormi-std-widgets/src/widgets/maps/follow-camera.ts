/**
 * Pure decisions behind the map's "follow a topic" camera.
 *
 * Kept free of React and MapLibre so the two questions that fail silently can
 * be unit-tested: which entries can be followed at all, and which operator
 * gesture ends a follow. Getting the second one wrong either strands the
 * camera on a robot the operator is trying to look away from, or drops the
 * follow every time they zoom in on it.
 */

/** Marker types whose newest point is a position worth keeping centred. */
const FOLLOWABLE_MARKER_TYPES: ReadonlySet<string> = new Set([
	"simple",
	"path",
	"multipoints",
]);

/**
 * Whether an entry of this marker type can be followed. A heatmap is an
 * accumulation over an area, not a moving thing: its Target button keeps the
 * one-shot fit to every point.
 * @param makerType - The entry's `makerType` setting.
 * @returns True for marker types that draw a moving position.
 */
export function isFollowableMarker(makerType: unknown): boolean {
	return (
		typeof makerType === "string" && FOLLOWABLE_MARKER_TYPES.has(makerType)
	);
}

/**
 * The newest position in a topic buffer, as `[longitude, latitude]`.
 * @param data - The buffered messages, oldest first (`GeolocationPosition`).
 * @returns The last fix with finite coordinates, or null when there is none.
 */
export function latestFix(data: readonly unknown[]): [number, number] | null {
	const last = data[data.length - 1] as
		{ coords?: { longitude?: unknown; latitude?: unknown } } | undefined;
	const lng = last?.coords?.longitude;
	const lat = last?.coords?.latitude;
	if (
		typeof lng !== "number" ||
		typeof lat !== "number" ||
		!Number.isFinite(lng) ||
		!Number.isFinite(lat)
	) {
		return null;
	}
	return [lng, lat];
}

/**
 * The next followed entry after the operator presses an entry's Target
 * button: pressing the followed entry stops, pressing another switches.
 * @param current - The followed entry id, or null.
 * @param pressed - The entry whose button was pressed.
 * @returns The followed entry id after the press.
 */
export function toggleFollow(
	current: string | null,
	pressed: string,
): string | null {
	return current === pressed ? null : pressed;
}

/** The arrow keys MapLibre's keyboard handler pans with (without shift). */
const PAN_KEYS: ReadonlySet<string> = new Set([
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
]);

/**
 * Whether a MapLibre camera event is the operator panning, which ends a
 * follow. Zoom, rotate and pitch do not: the operator keeps the robot centred
 * while getting closer to it or turning the map.
 *
 * MapLibre fires `dragstart` for any handler that pans (mouse drag, touch).
 * A two-finger touch also pans as its midpoint drifts during a pinch, which is
 * a zoom gesture, so a multi-touch drag is not a pan here. Arrow keys pan
 * through an animated move carrying the `KeyboardEvent`; shift + arrow rotates
 * and pitches. Moves the code makes itself carry no `originalEvent` at all.
 *
 * Inputs are duck-typed rather than `instanceof`-checked: MapLibre forwards the
 * DOM event untouched, and the check has to run in tests without a DOM.
 *
 * @param type - The MapLibre event type.
 * @param originalEvent - The DOM event MapLibre attached, if any.
 * @returns True when the move is an operator pan.
 */
export function isOperatorPan(type: string, originalEvent: unknown): boolean {
	if (!originalEvent || typeof originalEvent !== "object") return false;
	const event = originalEvent as {
		touches?: { length: number };
		key?: unknown;
		shiftKey?: unknown;
	};

	if (type === "dragstart") {
		return !(event.touches && event.touches.length > 1);
	}
	if (type === "movestart") {
		return (
			typeof event.key === "string" &&
			PAN_KEYS.has(event.key) &&
			event.shiftKey !== true
		);
	}
	return false;
}

/** Smallest dead-zone radius, in CSS pixels, however small the map. */
export const FOLLOW_DEADBAND_MIN_PX = 24;
/** Dead-zone radius as a fraction of the map's shorter side. */
export const FOLLOW_DEADBAND_FRACTION = 0.15;
/** Time constant of the camera's glide back to the entry, in milliseconds. */
export const FOLLOW_GLIDE_TAU_MS = 350;
/** Offset under which a glide snaps the last fraction of a pixel and ends. */
export const FOLLOW_SETTLE_PX = 0.5;
/** Longest frame step the glide integrates, so a background tab cannot overshoot it. */
const FOLLOW_MAX_STEP_MS = 100;

/**
 * Dead-zone radius for a map of this size: a fix that stays within it of the
 * map's centre does not move the camera, so GPS jitter leaves the view still.
 * Measured on screen, so it means the same thing at every zoom.
 * @param width - Map width in CSS pixels.
 * @param height - Map height in CSS pixels.
 * @returns The radius in CSS pixels.
 */
export function followDeadbandPx(width: number, height: number): number {
	return Math.max(
		FOLLOW_DEADBAND_MIN_PX,
		FOLLOW_DEADBAND_FRACTION * Math.min(width, height),
	);
}

/** One frame of the follow camera, decided by {@link followStep}. */
export interface FollowStep {
	/** Whether the camera is still gliding after this frame. */
	gliding: boolean;
	/** Screen offset to move the map's centre by this frame, or null. */
	move: [number, number] | null;
}

/**
 * One frame of the follow camera: where the centre moves, given where the
 * followed entry sits on screen.
 *
 * Idle, the camera ignores an entry inside the dead zone. Once the entry
 * leaves it, the camera glides back until the entry is centred again, closing
 * a fixed share of the remaining offset per unit of time (exponential
 * smoothing), so it starts quickly, slows on arrival and never overshoots.
 * The dead zone does not apply mid-glide, or the camera would stop at its
 * edge and leave the entry off-centre. A `tauMs` of 0 (reduced motion)
 * closes the whole offset in one frame.
 *
 * @param offset - The entry's screen position minus the map's centre, in px.
 * @param dtMs - Time since the previous frame.
 * @param gliding - Whether the previous frame was gliding.
 * @param deadbandPx - Dead-zone radius ({@link followDeadbandPx}).
 * @param tauMs - Glide time constant; 0 snaps.
 * @returns The move for this frame and the next state.
 */
export function followStep(
	offset: readonly [number, number],
	dtMs: number,
	gliding: boolean,
	deadbandPx: number,
	tauMs: number = FOLLOW_GLIDE_TAU_MS,
): FollowStep {
	const [dx, dy] = offset;
	const distance = Math.hypot(dx, dy);
	if (!Number.isFinite(distance)) return { gliding: false, move: null };
	if (!gliding && distance <= deadbandPx) {
		return { gliding: false, move: null };
	}
	if (tauMs <= 0 || distance <= FOLLOW_SETTLE_PX) {
		return { gliding: false, move: distance > 0 ? [dx, dy] : null };
	}
	const dt = Math.min(Math.max(dtMs, 0), FOLLOW_MAX_STEP_MS);
	const share = 1 - Math.exp(-dt / tauMs);
	return { gliding: true, move: [dx * share, dy * share] };
}

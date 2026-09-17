/**
 * Axis-binding model for the teleop widget.
 *
 * A teleop axis is one `Movement` component driven by a pair of operator
 * inputs — one for the positive direction, one for the negative. The pair is
 * either *digital* (a keyboard key or a gamepad button: held or not) or
 * *analog* (a gamepad stick axis: a magnitude in `[0, 1]`). That is the only
 * axis of variation; everything else about a teleop axis is shared.
 *
 * Both halves are kept as separate persisted slots rather than one polymorphic
 * slot, so switching mode can never hand an `AnalogInput` to the digital
 * reader (or the reverse) — a mismatch that would produce a chip that looks
 * bound and never fires.
 *
 * Everything here is pure so the union resolution and the movement arithmetic
 * can be tested without a gamepad, a robot, or a DOM.
 */

import type { Movement } from "@workspace/ormi-core/types";
import type {
	AnalogInput,
	DigitalInput,
} from "@workspace/ui/combined/triggers";

/** Axis slots a `Movement` message exposes, as `<group>.<component>`. */
export const MOVEMENT_AXES = [
	"linear.x",
	"linear.y",
	"linear.z",
	"angular.x",
	"angular.y",
	"angular.z",
] as const;

/** One addressable component of a `Movement` message. */
export type MovementAxis = (typeof MOVEMENT_AXES)[number];

/** Which family of input drives an axis. */
export type TeleopAxisMode = "digital" | "analog";

/** Direction half of an axis binding. */
export type TeleopAxisSide = "positive" | "negative";

/**
 * One axis entry exactly as it is persisted in the widget settings.
 *
 * Every field is optional because this is operator-authored data that outlives
 * the build that wrote it: a half-configured axis is an ordinary state, not an
 * exception, and {@link resolveAxisBindings} is what turns it into something
 * the widget is willing to act on.
 */
export interface TeleopAxisConfig {
	/** Target `Movement` component, e.g. `linear.x`. */
	axis?: string;
	/** Input family. Absent or unrecognised is read as `digital`. */
	mode?: string;
	/** Key/button driving the positive direction, in `digital` mode. */
	digital_positive?: DigitalInput | null;
	/** Key/button driving the negative direction, in `digital` mode. */
	digital_negative?: DigitalInput | null;
	/** Stick axis driving the positive direction, in `analog` mode. */
	analog_positive?: AnalogInput | null;
	/** Stick axis driving the negative direction, in `analog` mode. */
	analog_negative?: AnalogInput | null;
	/** Scale applied on top of the shared speed. */
	multiplier?: number;
}

/** Fields every resolved binding carries, whatever its mode. */
interface ResolvedAxisBindingBase {
	/**
	 * Stable identity of this binding within one configuration.
	 *
	 * Derived from the entry's position, not its axis name: two entries may
	 * legitimately target the same `Movement` component (a key pair *and* a
	 * stick, say), and keying input state by axis name would make them
	 * overwrite each other.
	 */
	key: string;
	/** Position of the entry in the saved `axes` array. */
	index: number;
}

/** A binding the widget can drive, plus the inputs that drive it. */
export type ResolvedAxisBinding =
	| (ResolvedAxisBindingBase & {
			kind: "digital";
			axis: MovementAxis;
			multiplier: number;
			positive: DigitalInput | null;
			negative: DigitalInput | null;
	  })
	| (ResolvedAxisBindingBase & {
			kind: "analog";
			axis: MovementAxis;
			multiplier: number;
			positive: AnalogInput | null;
			negative: AnalogInput | null;
	  })
	| (ResolvedAxisBindingBase & {
			kind: "invalid";
			/** The unusable axis value as saved, for the operator to see. */
			axis: string;
			/** One sentence naming what has to be fixed. */
			problem: string;
	  });

/**
 * Press state and stick magnitudes for every configured binding.
 *
 * Both maps are keyed by {@link sideKey}, so a binding's two directions never
 * collide and a removed binding's entries simply stop being read.
 */
export interface TeleopInputState {
	/** `true` while a digital side is held. */
	digital: Record<string, boolean>;
	/** Stick deflection of an analog side, as a magnitude in `[0, 1]`. */
	analog: Record<string, number>;
}

/**
 * Magnitudes at or below this are treated as rest.
 *
 * Analog sticks rarely return to exactly zero; without a floor a resting
 * controller publishes a permanent trickle of velocity.
 */
export const ANALOG_DEADZONE = 0.07;

/**
 * Key under which one direction of one binding stores its input state.
 * @param bindingKey - {@link ResolvedAxisBinding.key} of the binding.
 * @param side - Direction half.
 * @returns Composite key for {@link TeleopInputState}.
 */
export function sideKey(bindingKey: string, side: TeleopAxisSide): string {
	return `${bindingKey}:${side}`;
}

/** Whether a saved axis name addresses a real `Movement` component. */
function isMovementAxis(value: unknown): value is MovementAxis {
	return (
		typeof value === "string" &&
		(MOVEMENT_AXES as readonly string[]).includes(value)
	);
}

/**
 * Normalize a saved multiplier.
 *
 * A saved `0` is honoured as zero — it is how an operator neutralises an axis
 * without unbinding it — so this deliberately does not fall back through a
 * truthiness check.
 *
 * @param value - Saved multiplier.
 * @returns The multiplier, or `1` when none was saved or it is not a usable
 * non-negative number.
 */
function normalizeMultiplier(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: 1;
}

/**
 * Read the input family of a saved axis entry.
 *
 * Anything that is not explicitly `analog` resolves to `digital`, which keeps
 * this in step with the configuration form: the form's analog section is shown
 * only for an explicit `analog`, so an entry with no mode shows — and drives —
 * its digital pair.
 *
 * @param mode - Saved `mode` value.
 * @returns The resolved input family.
 */
export function resolveAxisMode(mode: unknown): TeleopAxisMode {
	return mode === "analog" ? "analog" : "digital";
}

/**
 * Turn one saved axis entry into something the widget can act on.
 *
 * @param config - Saved axis entry.
 * @param index - Its position in the saved `axes` array.
 * @returns The resolved binding, or an `invalid` binding naming what is wrong
 * with it. An entry is never silently dropped — an axis the widget refuses to
 * drive is shown as such, so a configuration mistake is visible instead of
 * looking like an unresponsive robot.
 */
export function resolveAxisBinding(
	config: TeleopAxisConfig | null | undefined,
	index: number,
): ResolvedAxisBinding {
	const key = `axis-${index}`;
	const raw = config ?? {};

	if (!isMovementAxis(raw.axis)) {
		return {
			key,
			index,
			kind: "invalid",
			axis: typeof raw.axis === "string" ? raw.axis : "",
			problem: raw.axis
				? "is not a movement axis this widget can publish"
				: "has no movement axis selected",
		};
	}

	const multiplier = normalizeMultiplier(raw.multiplier);

	if (resolveAxisMode(raw.mode) === "analog") {
		return {
			key,
			index,
			kind: "analog",
			axis: raw.axis,
			multiplier,
			positive: raw.analog_positive ?? null,
			negative: raw.analog_negative ?? null,
		};
	}

	return {
		key,
		index,
		kind: "digital",
		axis: raw.axis,
		multiplier,
		positive: raw.digital_positive ?? null,
		negative: raw.digital_negative ?? null,
	};
}

/**
 * Resolve every saved axis entry.
 * @param axes - Saved `axes` setting, in whatever state it was persisted.
 * @returns One resolved binding per entry, in saved order; empty when the
 * setting is not an array.
 */
export function resolveAxisBindings(
	axes: readonly TeleopAxisConfig[] | null | undefined,
): ResolvedAxisBinding[] {
	if (!Array.isArray(axes)) return [];
	return axes.map((config, index) => resolveAxisBinding(config, index));
}

/** Empty input state, for a fresh widget or a changed axis configuration. */
export function createEmptyInputState(): TeleopInputState {
	return { digital: {}, analog: {} };
}

/**
 * Direction value of a digital pair.
 *
 * Holding both directions cancels to rest rather than picking a winner: on a
 * vehicle, "forward and backward at once" has no defensible answer, and
 * stopping is the safe one.
 *
 * @param positiveActive - Whether the positive key/button is held.
 * @param negativeActive - Whether the negative key/button is held.
 * @returns `1`, `-1` or `0`.
 */
export function digitalAxisValue(
	positiveActive: boolean,
	negativeActive: boolean,
): number {
	if (positiveActive === negativeActive) return 0;
	return positiveActive ? 1 : -1;
}

/**
 * Direction value of an analog pair.
 *
 * The two sides are subtracted rather than overwriting one another, so a stick
 * pushed one way while the opposite side is still decaying resolves to the
 * difference instead of flickering between them.
 *
 * @param positiveMagnitude - Deflection of the positive side, in `[0, 1]`.
 * @param negativeMagnitude - Deflection of the negative side, in `[0, 1]`.
 * @returns A value in `[-1, 1]`, snapped to `0` inside the deadzone.
 */
export function analogAxisValue(
	positiveMagnitude: number,
	negativeMagnitude: number,
): number {
	const positive = Number.isFinite(positiveMagnitude) ? positiveMagnitude : 0;
	const negative = Number.isFinite(negativeMagnitude) ? negativeMagnitude : 0;
	const combined = positive - negative;
	return Math.abs(combined) <= ANALOG_DEADZONE ? 0 : combined;
}

/**
 * Current direction value of one binding, whatever its mode.
 * @param binding - Resolved binding.
 * @param state - Current press state and stick magnitudes.
 * @returns A value in `[-1, 1]`; always `0` for an `invalid` binding.
 */
export function axisScalar(
	binding: ResolvedAxisBinding,
	state: TeleopInputState,
): number {
	if (binding.kind === "invalid") return 0;

	const positive = sideKey(binding.key, "positive");
	const negative = sideKey(binding.key, "negative");

	if (binding.kind === "analog") {
		return analogAxisValue(
			state.analog[positive] ?? 0,
			state.analog[negative] ?? 0,
		);
	}

	return digitalAxisValue(
		state.digital[positive] ?? false,
		state.digital[negative] ?? false,
	);
}

/** A `Movement` at rest. */
export function createZeroMovement(): Movement {
	return {
		linear: { x: 0, y: 0, z: 0 },
		angular: { x: 0, y: 0, z: 0 },
	};
}

/**
 * Add a velocity to one component of a `Movement`.
 *
 * Additive on purpose: several bindings may target the same component — the
 * whole point of fusing the two widgets is that a stick and a key pair can sit
 * on one axis — and the last one written must not erase the others.
 *
 * @param movement - Message being assembled; mutated in place.
 * @param axis - Component to add to.
 * @param value - Velocity to add.
 */
export function accumulateMovement(
	movement: Movement,
	axis: MovementAxis,
	value: number,
): void {
	const [group, component] = axis.split(".") as [
		"linear" | "angular",
		"x" | "y" | "z",
	];
	movement[group][component] += value;
}

/** A built `Movement` together with whether anything is actually commanding it. */
export interface BuiltMovement {
	/** The assembled message. */
	movement: Movement;
	/** Whether any binding contributed a non-zero velocity. */
	isMoving: boolean;
}

/**
 * Assemble the `Movement` the current input state commands.
 *
 * @param bindings - Resolved bindings, in configuration order.
 * @param state - Current press state and stick magnitudes.
 * @param speed - Shared speed scalar, in m/s.
 * @returns The message and whether it is a movement command or a rest message.
 * `isMoving` tracks the *commanded* value, so an axis neutralised by a `0`
 * multiplier does not count as movement.
 */
export function buildMovement(
	bindings: readonly ResolvedAxisBinding[],
	state: TeleopInputState,
	speed: number,
): BuiltMovement {
	const movement = createZeroMovement();
	let isMoving = false;

	for (const binding of bindings) {
		if (binding.kind === "invalid") continue;

		const scalar = axisScalar(binding, state);
		if (scalar === 0) continue;

		const value = scalar * speed * binding.multiplier;
		if (value === 0) continue;

		isMoving = true;
		accumulateMovement(movement, binding.axis, value);
	}

	return { movement, isMoving };
}

/** Geometry of the centre-anchored bar showing one axis' current value. */
export interface AxisBarGeometry {
	/** Bar width, as a percentage of the track. */
	widthPercent: number;
	/** Offset of the bar's left edge, as a percentage of the track. */
	offsetPercent: number;
}

/**
 * Bar geometry for an axis value.
 *
 * The track represents `[-1, 1]`, so rest is the midpoint and a value grows
 * from there — right for positive, left for negative.
 *
 * @param value - Axis value in `[-1, 1]`; anything beyond is clamped.
 * @returns Width and left offset, both as percentages.
 */
export function axisBarGeometry(value: number): AxisBarGeometry {
	const clamped = Number.isFinite(value)
		? Math.max(-1, Math.min(1, value))
		: 0;
	const widthPercent = Math.abs(clamped) * 50;
	return {
		widthPercent,
		offsetPercent: clamped >= 0 ? 50 : 50 - widthPercent,
	};
}

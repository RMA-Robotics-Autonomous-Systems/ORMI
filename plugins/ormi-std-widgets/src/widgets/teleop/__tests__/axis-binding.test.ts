import { describe, expect, test } from "bun:test";
import type {
	AnalogInput,
	DigitalInput,
} from "@workspace/ui/combined/triggers";

import {
	ANALOG_DEADZONE,
	accumulateMovement,
	analogAxisValue,
	axisBarGeometry,
	axisScalar,
	buildMovement,
	createEmptyInputState,
	createZeroMovement,
	digitalAxisValue,
	resolveAxisBinding,
	resolveAxisBindings,
	resolveAxisMode,
	sideKey,
	type ResolvedAxisBinding,
	type TeleopInputState,
} from "../axis-binding";

const KEY_W: DigitalInput = { type: "keyboard", key: "w" };
const KEY_S: DigitalInput = { type: "keyboard", key: "s" };
const BUTTON_A: DigitalInput = {
	type: "gamepad",
	gamepadButtonIndex: 0,
	gamepadId: "pad",
};
const STICK_UP: AnalogInput = {
	type: "gamepad",
	gamepadAxisIndex: 1,
	gamepadId: "pad",
	direction: "negative",
};
const STICK_DOWN: AnalogInput = {
	type: "gamepad",
	gamepadAxisIndex: 1,
	gamepadId: "pad",
	direction: "positive",
};

/** Input state with the listed keys set, everything else at rest. */
function state(
	digital: Record<string, boolean> = {},
	analog: Record<string, number> = {},
): TeleopInputState {
	return { digital, analog };
}

describe("resolveAxisMode", () => {
	test("only an explicit analog is analog", () => {
		expect(resolveAxisMode("analog")).toBe("analog");
	});

	test("digital, absent and unrecognised all read as digital", () => {
		expect(resolveAxisMode("digital")).toBe("digital");
		expect(resolveAxisMode(undefined)).toBe("digital");
		expect(resolveAxisMode(null)).toBe("digital");
		expect(resolveAxisMode("joystick")).toBe("digital");
		expect(resolveAxisMode(7)).toBe("digital");
	});
});

describe("resolveAxisBinding", () => {
	test("reads the digital pair in digital mode and ignores the analog slots", () => {
		const binding = resolveAxisBinding(
			{
				axis: "linear.x",
				mode: "digital",
				digital_positive: KEY_W,
				digital_negative: KEY_S,
				analog_positive: STICK_UP,
				multiplier: 2,
			},
			0,
		);

		expect(binding.kind).toBe("digital");
		if (binding.kind !== "digital") throw new Error("unreachable");
		expect(binding.axis).toBe("linear.x");
		expect(binding.multiplier).toBe(2);
		expect(binding.positive).toEqual(KEY_W);
		expect(binding.negative).toEqual(KEY_S);
	});

	test("reads the analog pair in analog mode and ignores the digital slots", () => {
		const binding = resolveAxisBinding(
			{
				axis: "angular.z",
				mode: "analog",
				digital_positive: KEY_W,
				analog_positive: STICK_UP,
				analog_negative: STICK_DOWN,
			},
			3,
		);

		expect(binding.kind).toBe("analog");
		if (binding.kind !== "analog") throw new Error("unreachable");
		expect(binding.axis).toBe("angular.z");
		expect(binding.positive).toEqual(STICK_UP);
		expect(binding.negative).toEqual(STICK_DOWN);
		expect(binding.index).toBe(3);
		expect(binding.key).toBe("axis-3");
	});

	test("a missing mode falls back to the digital pair", () => {
		const binding = resolveAxisBinding(
			{ axis: "linear.y", digital_positive: KEY_W },
			0,
		);

		expect(binding.kind).toBe("digital");
		if (binding.kind !== "digital") throw new Error("unreachable");
		expect(binding.positive).toEqual(KEY_W);
	});

	test("unset sides resolve to null rather than undefined", () => {
		const binding = resolveAxisBinding({ axis: "linear.z" }, 0);

		if (binding.kind !== "digital") throw new Error("unreachable");
		expect(binding.positive).toBeNull();
		expect(binding.negative).toBeNull();
	});

	test("an unknown axis is reported, never silently dropped", () => {
		const binding = resolveAxisBinding({ axis: "linear.w" }, 1);

		expect(binding.kind).toBe("invalid");
		if (binding.kind !== "invalid") throw new Error("unreachable");
		expect(binding.axis).toBe("linear.w");
		expect(binding.problem).toContain("movement axis");
	});

	test("a missing axis is reported too", () => {
		const binding = resolveAxisBinding({ mode: "analog" }, 0);

		expect(binding.kind).toBe("invalid");
		if (binding.kind !== "invalid") throw new Error("unreachable");
		expect(binding.problem).toContain("no movement axis");
	});

	test("a saved multiplier of zero is honoured, not treated as unset", () => {
		const binding = resolveAxisBinding(
			{ axis: "linear.x", multiplier: 0 },
			0,
		);

		if (binding.kind === "invalid") throw new Error("unreachable");
		expect(binding.multiplier).toBe(0);
	});

	test("an absent or unusable multiplier falls back to one", () => {
		for (const multiplier of [undefined, -1, Number.NaN]) {
			const binding = resolveAxisBinding(
				{ axis: "linear.x", multiplier: multiplier as number },
				0,
			);
			if (binding.kind === "invalid") throw new Error("unreachable");
			expect(binding.multiplier).toBe(1);
		}
	});

	test("bindings on the same axis get distinct keys", () => {
		const bindings = resolveAxisBindings([
			{ axis: "linear.x", digital_positive: KEY_W },
			{ axis: "linear.x", mode: "analog", analog_positive: STICK_UP },
		]);

		expect(bindings.map((binding) => binding.key)).toEqual([
			"axis-0",
			"axis-1",
		]);
		expect(bindings[0]!.kind).toBe("digital");
		expect(bindings[1]!.kind).toBe("analog");
	});

	test("a non-array axes setting resolves to no bindings", () => {
		expect(resolveAxisBindings(undefined)).toEqual([]);
		expect(resolveAxisBindings(null)).toEqual([]);
		expect(resolveAxisBindings("linear.x" as unknown as undefined)).toEqual(
			[],
		);
	});
});

describe("digitalAxisValue", () => {
	test("one side held drives that direction", () => {
		expect(digitalAxisValue(true, false)).toBe(1);
		expect(digitalAxisValue(false, true)).toBe(-1);
	});

	test("both sides held cancel to rest", () => {
		expect(digitalAxisValue(true, true)).toBe(0);
	});

	test("neither side held is rest", () => {
		expect(digitalAxisValue(false, false)).toBe(0);
	});
});

describe("analogAxisValue", () => {
	test("the two sides subtract rather than overwrite", () => {
		expect(analogAxisValue(0.8, 0)).toBeCloseTo(0.8);
		expect(analogAxisValue(0, 0.8)).toBeCloseTo(-0.8);
		expect(analogAxisValue(0.8, 0.3)).toBeCloseTo(0.5);
	});

	test("a resting stick inside the deadzone reads as exactly zero", () => {
		expect(analogAxisValue(ANALOG_DEADZONE, 0)).toBe(0);
		expect(analogAxisValue(0, ANALOG_DEADZONE)).toBe(0);
		expect(analogAxisValue(0.5, 0.5)).toBe(0);
	});

	test("non-numeric magnitudes are treated as rest", () => {
		expect(analogAxisValue(Number.NaN, 0.5)).toBeCloseTo(-0.5);
		expect(
			analogAxisValue(0.5, undefined as unknown as number),
		).toBeCloseTo(0.5);
	});
});

describe("axisScalar", () => {
	const digital = resolveAxisBinding(
		{
			axis: "linear.x",
			mode: "digital",
			digital_positive: KEY_W,
			digital_negative: KEY_S,
		},
		0,
	);
	const analog = resolveAxisBinding(
		{
			axis: "angular.z",
			mode: "analog",
			analog_positive: STICK_UP,
			analog_negative: STICK_DOWN,
		},
		1,
	);

	test("a digital binding reads its press state", () => {
		expect(
			axisScalar(
				digital,
				state({ [sideKey("axis-0", "positive")]: true }),
			),
		).toBe(1);
		expect(
			axisScalar(
				digital,
				state({ [sideKey("axis-0", "negative")]: true }),
			),
		).toBe(-1);
	});

	test("a digital binding ignores analog state on the same keys", () => {
		expect(
			axisScalar(
				digital,
				state({}, { [sideKey("axis-0", "positive")]: 1 }),
			),
		).toBe(0);
	});

	test("an analog binding reads its magnitudes", () => {
		expect(
			axisScalar(
				analog,
				state({}, { [sideKey("axis-1", "negative")]: 0.6 }),
			),
		).toBeCloseTo(-0.6);
	});

	test("an analog binding ignores digital state on the same keys", () => {
		expect(
			axisScalar(
				analog,
				state({ [sideKey("axis-1", "positive")]: true }),
			),
		).toBe(0);
	});

	test("an invalid binding never commands anything", () => {
		const invalid = resolveAxisBinding({ axis: "nope" }, 2);
		expect(axisScalar(invalid, state({ "axis-2:positive": true }))).toBe(0);
	});

	test("an empty input state is rest for every binding", () => {
		const empty = createEmptyInputState();
		expect(axisScalar(digital, empty)).toBe(0);
		expect(axisScalar(analog, empty)).toBe(0);
	});
});

describe("accumulateMovement", () => {
	test("adds into the addressed component", () => {
		const movement = createZeroMovement();
		accumulateMovement(movement, "linear.x", 0.5);
		accumulateMovement(movement, "angular.z", -0.25);

		expect(movement.linear).toEqual({ x: 0.5, y: 0, z: 0 });
		expect(movement.angular).toEqual({ x: 0, y: 0, z: -0.25 });
	});

	test("accumulates rather than overwriting", () => {
		const movement = createZeroMovement();
		accumulateMovement(movement, "linear.x", 0.5);
		accumulateMovement(movement, "linear.x", 0.25);

		expect(movement.linear.x).toBeCloseTo(0.75);
	});
});

describe("buildMovement", () => {
	const bindings: ResolvedAxisBinding[] = resolveAxisBindings([
		{
			axis: "linear.x",
			mode: "digital",
			digital_positive: KEY_W,
			digital_negative: KEY_S,
			multiplier: 1,
		},
		{
			axis: "angular.z",
			mode: "analog",
			analog_positive: STICK_UP,
			analog_negative: STICK_DOWN,
			multiplier: 2,
		},
	]);

	test("nothing held publishes rest and reports no movement", () => {
		const built = buildMovement(bindings, createEmptyInputState(), 1);

		expect(built.isMoving).toBe(false);
		expect(built.movement).toEqual(createZeroMovement());
	});

	test("scales by speed and by the per-axis multiplier", () => {
		const built = buildMovement(
			bindings,
			state(
				{ [sideKey("axis-0", "positive")]: true },
				{ [sideKey("axis-1", "positive")]: 0.5 },
			),
			2,
		);

		expect(built.isMoving).toBe(true);
		expect(built.movement.linear.x).toBeCloseTo(2);
		expect(built.movement.angular.z).toBeCloseTo(2);
	});

	test("a digital and an analog binding on one axis sum", () => {
		const shared = resolveAxisBindings([
			{ axis: "linear.x", digital_positive: KEY_W, multiplier: 1 },
			{
				axis: "linear.x",
				mode: "analog",
				analog_positive: STICK_UP,
				multiplier: 1,
			},
		]);

		const built = buildMovement(
			shared,
			state(
				{ [sideKey("axis-0", "positive")]: true },
				{ [sideKey("axis-1", "positive")]: 0.5 },
			),
			1,
		);

		expect(built.movement.linear.x).toBeCloseTo(1.5);
	});

	test("a zero multiplier neutralises its axis and does not count as movement", () => {
		const muted = resolveAxisBindings([
			{ axis: "linear.x", digital_positive: KEY_W, multiplier: 0 },
		]);

		const built = buildMovement(
			muted,
			state({ [sideKey("axis-0", "positive")]: true }),
			1,
		);

		expect(built.isMoving).toBe(false);
		expect(built.movement.linear.x).toBe(0);
	});

	test("invalid bindings are skipped without disturbing the rest", () => {
		const mixed = resolveAxisBindings([
			{ axis: "nonsense", digital_positive: BUTTON_A },
			{ axis: "linear.y", digital_positive: KEY_W, multiplier: 1 },
		]);

		const built = buildMovement(
			mixed,
			state({ [sideKey("axis-1", "positive")]: true }),
			1,
		);

		expect(built.isMoving).toBe(true);
		expect(built.movement.linear.y).toBeCloseTo(1);
	});

	test("state left over from a removed binding cannot drive anything", () => {
		const built = buildMovement(
			resolveAxisBindings([
				{ axis: "linear.x", digital_positive: KEY_W, multiplier: 1 },
			]),
			state({ [sideKey("axis-4", "positive")]: true }),
			1,
		);

		expect(built.isMoving).toBe(false);
	});

	test("a returned movement is never the same object twice", () => {
		const first = buildMovement(bindings, createEmptyInputState(), 1);
		const second = buildMovement(bindings, createEmptyInputState(), 1);

		expect(first.movement).not.toBe(second.movement);
	});
});

describe("axisBarGeometry", () => {
	test("rest is a zero-width bar at the centre", () => {
		expect(axisBarGeometry(0)).toEqual({
			widthPercent: 0,
			offsetPercent: 50,
		});
	});

	test("positive grows right from the centre", () => {
		expect(axisBarGeometry(1)).toEqual({
			widthPercent: 50,
			offsetPercent: 50,
		});
		expect(axisBarGeometry(0.5)).toEqual({
			widthPercent: 25,
			offsetPercent: 50,
		});
	});

	test("negative grows left from the centre", () => {
		expect(axisBarGeometry(-1)).toEqual({
			widthPercent: 50,
			offsetPercent: 0,
		});
		expect(axisBarGeometry(-0.5)).toEqual({
			widthPercent: 25,
			offsetPercent: 25,
		});
	});

	test("out-of-range and non-numeric values are clamped", () => {
		expect(axisBarGeometry(4)).toEqual({
			widthPercent: 50,
			offsetPercent: 50,
		});
		expect(axisBarGeometry(Number.NaN)).toEqual({
			widthPercent: 0,
			offsetPercent: 50,
		});
	});
});

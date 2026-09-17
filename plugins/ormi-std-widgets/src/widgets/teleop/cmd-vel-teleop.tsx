"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { GaugeIcon, Gamepad2Icon, LockIcon, UnlockIcon } from "lucide-react";
import { ControlElement, RuleEffect, VerticalLayout } from "@jsonforms/core";
import {
	SelectedTopic,
	usePublisherDataSource,
	PublisherDataSourcesProvider,
} from "@workspace/ormi-core/datasources";
import {
	TopicSelectElement,
	WidgetDefinition,
} from "@workspace/ormi-core/widgets";
import { axisControlType, KeyControlType } from "@workspace/ormi-jsonforms";
import {
	AnalogComponent,
	DigitalComponent,
} from "@workspace/ui/combined/triggers";
import type { DigitalInput } from "@workspace/ui/combined/triggers";
import { toast } from "sonner";

import {
	axisBarGeometry,
	axisScalar,
	buildMovement,
	createEmptyInputState,
	MOVEMENT_AXES,
	resolveAxisBindings,
	sideKey,
	type ResolvedAxisBinding,
	type TeleopAxisConfig,
	type TeleopInputState,
} from "./axis-binding";

/** Settings of the teleop widget, as persisted with a widget instance. */
export interface TeleopControlData extends Record<string, unknown> {
	/** Tile title. */
	title: string;
	/** Per-axis input bindings. */
	axes: TeleopAxisConfig[];
	/** Speed the widget starts at, in m/s. */
	startingSpeed: number;
	/** Binding that steps the speed up. */
	incSpeed: DigitalInput;
	/** Binding that steps the speed down. */
	decSpeed: DigitalInput;
	/** Binding that releases the lock. */
	unlock: DigitalInput;
	/** Whether {@link unlock} toggles the lock rather than holding it open. */
	unlocktoggle: boolean;
	/** Topic the assembled `Movement` is published to. */
	topic: SelectedTopic;
	/** Publication rate, in Hz. */
	publicationFrequency: number;
	/** Whether to keep publishing a zero `Movement` while nothing is commanded. */
	keepPublishZero: boolean;
}

/** Amount one press of the speed bindings steps the speed by, in m/s. */
const SPEED_STEP = 0.1;
/** Highest speed the speed bindings will step to, in m/s. */
const MAX_SPEED = 10;

/** Activate/deactivate handles for both directions of one axis binding. */
interface AxisSideHandlers {
	/** Positive side went active — press for digital, deflection for analog. */
	onPositiveActive: () => void;
	/** Positive side went inactive. */
	onPositiveInactive: () => void;
	/** Negative side went active. */
	onNegativeActive: () => void;
	/** Negative side went inactive. */
	onNegativeInactive: () => void;
	/** Positive stick deflection changed. */
	onPositiveValue: (value: number) => void;
	/** Negative stick deflection changed. */
	onNegativeValue: (value: number) => void;
}

/** Placeholder chip for a direction the operator has not bound yet. */
const UnboundSide: React.FC = () => (
	<span className="text-muted-foreground border-input rounded-md border border-dashed px-2 py-1 text-xs">
		Not bound
	</span>
);

/** Props for {@link TeleopAxisRow}. */
interface TeleopAxisRowProps {
	/** The binding this row drives. */
	binding: ResolvedAxisBinding;
	/** Handles for the binding's two directions. Absent for `invalid`. */
	handlers?: AxisSideHandlers;
	/** Current value of the axis, in `[-1, 1]`. */
	value: number;
}

/**
 * One configured axis: its two input chips and a centre-anchored value bar.
 *
 * The chips come straight from `@workspace/ui` so this inherits the shared
 * typing/modal guard and chip styling rather than handling keys itself.
 *
 * @param props - Component props.
 * @returns React element.
 */
const TeleopAxisRow: React.FC<TeleopAxisRowProps> = ({
	binding,
	handlers,
	value,
}) => {
	const bar = axisBarGeometry(value);

	if (binding.kind === "invalid") {
		return (
			<div className="border-destructive/40 flex flex-col items-center rounded border border-dashed p-1 sm:p-2">
				<div className="w-full truncate text-center text-xs font-medium sm:text-sm">
					{binding.axis || `Axis ${binding.index + 1}`}
				</div>
				<div className="text-muted-foreground mt-1 text-center text-xs">
					This axis {binding.problem}. Open the widget settings to fix
					it.
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-col items-center rounded border p-1 sm:p-2">
			<div className="w-full truncate text-center text-xs font-medium sm:text-sm">
				{binding.axis}
			</div>
			<div className="flex w-full items-center justify-around gap-2 sm:gap-4">
				<div className="flex min-w-0 flex-col items-center">
					<div className="mb-1 text-xs">Positive (+)</div>
					{binding.kind === "digital" ? (
						binding.positive ? (
							<DigitalComponent
								digitalInput={binding.positive}
								onActive={handlers!.onPositiveActive}
								onInactive={handlers!.onPositiveInactive}
							/>
						) : (
							<UnboundSide />
						)
					) : binding.positive ? (
						<AnalogComponent
							analogInput={binding.positive}
							onValueChange={handlers!.onPositiveValue}
						/>
					) : (
						<UnboundSide />
					)}
				</div>
				<div className="flex min-w-0 flex-col items-center">
					<div className="mb-1 text-xs">Negative (-)</div>
					{binding.kind === "digital" ? (
						binding.negative ? (
							<DigitalComponent
								digitalInput={binding.negative}
								onActive={handlers!.onNegativeActive}
								onInactive={handlers!.onNegativeInactive}
							/>
						) : (
							<UnboundSide />
						)
					) : binding.negative ? (
						<AnalogComponent
							analogInput={binding.negative}
							onValueChange={handlers!.onNegativeValue}
						/>
					) : (
						<UnboundSide />
					)}
				</div>
			</div>
			<div className="bg-muted mt-1 h-1 w-full rounded sm:mt-2 sm:h-2">
				<div
					className="h-full rounded bg-blue-500 transition-all duration-150"
					style={{
						width: `${bar.widthPercent}%`,
						marginLeft: `${bar.offsetPercent}%`,
					}}
				/>
			</div>
		</div>
	);
};

/**
 * Teleoperation body: speed, lock, and one row per configured axis.
 *
 * Digital and analog bindings are the same widget with a different input
 * device, so they share the whole surface — speed stepping, the lock, the
 * publication loop — and differ only in what each axis row listens to.
 *
 * @param props - Widget settings.
 * @returns React element.
 */
export function TeleopControl(props: TeleopControlData) {
	const bindings = useMemo(
		() => resolveAxisBindings(props.axes),
		[props.axes],
	);

	const [speed, setSpeed] = useState<number>(props.startingSpeed || 1.0);
	const [unlockActive, setUnlockActive] = useState<boolean>(false);
	const [isLocked, setIsLocked] = useState<boolean>(true);
	const [speedIncActive, setSpeedIncActive] = useState<boolean>(false);
	const [speedDecActive, setSpeedDecActive] = useState<boolean>(false);

	const [inputState, setInputState] = useState<TeleopInputState>(
		createEmptyInputState,
	);
	// The publication loop reads input state on a timer, outside React's
	// render cycle, so it reads the ref rather than a captured snapshot.
	const inputStateRef = useRef<TeleopInputState>(inputState);

	const { publishers } = usePublisherDataSource();

	// Mirror committed input state for the publication loop. Kept in an effect
	// rather than written from the setters so the trigger callbacks never close
	// over the ref — the React Compiler treats a ref reachable from a memoised
	// value as a read during render.
	useEffect(() => {
		inputStateRef.current = inputState;
	}, [inputState]);

	// A changed axis configuration starts from rest. Without this, an axis the
	// operator removes while its key was held leaves a latched `true` behind
	// under a key nothing clears — and the robot keeps driving. Declared after
	// the mirror above so that when both fire in one commit, the reset is what
	// the publication loop ends up reading.
	useEffect(() => {
		const fresh = createEmptyInputState();
		inputStateRef.current = fresh;
		setInputState(fresh);
	}, [bindings]);

	useEffect(() => {
		if (speedIncActive) {
			setSpeed((prev) => Math.min(MAX_SPEED, prev + SPEED_STEP));
		}
	}, [speedIncActive]);

	useEffect(() => {
		if (speedDecActive) {
			setSpeed((prev) => Math.max(0, prev - SPEED_STEP));
		}
	}, [speedDecActive]);

	useEffect(() => {
		if (props.unlocktoggle) {
			if (unlockActive) {
				setIsLocked((prev) => !prev);
			}
		} else {
			setIsLocked(!unlockActive);
		}
	}, [unlockActive, props.unlocktoggle]);

	const setDigitalSide = useCallback((key: string, active: boolean) => {
		setInputState((prev) => {
			if ((prev.digital[key] ?? false) === active) return prev;
			return {
				digital: { ...prev.digital, [key]: active },
				analog: prev.analog,
			};
		});
	}, []);

	const setAnalogSide = useCallback((key: string, value: number) => {
		setInputState((prev) => {
			if ((prev.analog[key] ?? 0) === value) return prev;
			return {
				digital: prev.digital,
				analog: { ...prev.analog, [key]: value },
			};
		});
	}, []);

	const axisHandlers = useMemo(() => {
		const handlers = new Map<string, AxisSideHandlers>();

		for (const binding of bindings) {
			if (binding.kind === "invalid") continue;

			const positive = sideKey(binding.key, "positive");
			const negative = sideKey(binding.key, "negative");

			handlers.set(binding.key, {
				onPositiveActive: () => setDigitalSide(positive, true),
				onPositiveInactive: () => setDigitalSide(positive, false),
				onNegativeActive: () => setDigitalSide(negative, true),
				onNegativeInactive: () => setDigitalSide(negative, false),
				onPositiveValue: (value: number) =>
					setAnalogSide(positive, value),
				onNegativeValue: (value: number) =>
					setAnalogSide(negative, value),
			});
		}

		return handlers;
	}, [bindings, setDigitalSide, setAnalogSide]);

	useEffect(() => {
		const frequency = props.publicationFrequency || 30;
		const periodMs = 1000 / frequency;
		const selectedTopic = props.topic;

		if (!selectedTopic?.topic) return;

		const publisher = publishers.get(selectedTopic.topic);

		if (!publisher) {
			const timer = setTimeout(() => {
				if (!publishers.get(selectedTopic.topic)) {
					toast.error(
						`Teleop: no publisher for topic ${selectedTopic.topic}. Please check your configuration.`,
					);
				}
			}, 1000);
			return () => clearTimeout(timer);
		}

		const publishTick = () => {
			if (isLocked) return;

			const { movement, isMoving } = buildMovement(
				bindings,
				inputStateRef.current,
				speed,
			);

			if (isMoving || props.keepPublishZero) {
				publisher.publish(movement, "Movement");
			}
		};

		const publishInterval = setInterval(publishTick, periodMs);

		return () => {
			clearInterval(publishInterval);
		};
	}, [
		props.topic,
		props.publicationFrequency,
		props.keepPublishZero,
		publishers,
		bindings,
		speed,
		isLocked,
	]);

	const handleIncSpeedActive = useCallback(() => setSpeedIncActive(true), []);
	const handleIncSpeedInactive = useCallback(
		() => setSpeedIncActive(false),
		[],
	);
	const handleDecSpeedActive = useCallback(() => setSpeedDecActive(true), []);
	const handleDecSpeedInactive = useCallback(
		() => setSpeedDecActive(false),
		[],
	);
	const handleUnlockActive = useCallback(() => setUnlockActive(true), []);
	const handleUnlockInactive = useCallback(() => setUnlockActive(false), []);

	return (
		<div className="flex h-full flex-col overflow-auto">
			<div className="flex h-full min-h-0 flex-col items-center justify-start gap-1 p-1 sm:gap-2 sm:p-2 lg:gap-3 lg:p-4">
				{/* Bindings that are global to the widget rather than to one axis. */}
				<div style={{ display: "none" }}>
					<DigitalComponent
						digitalInput={props.decSpeed}
						onActive={handleDecSpeedActive}
						onInactive={handleDecSpeedInactive}
					/>
					<DigitalComponent
						digitalInput={props.unlock}
						onActive={handleUnlockActive}
						onInactive={handleUnlockInactive}
					/>
					<DigitalComponent
						digitalInput={props.incSpeed}
						onActive={handleIncSpeedActive}
						onInactive={handleIncSpeedInactive}
					/>
				</div>

				{/* Control header with lock and speed */}
				<div className="mb-1 flex w-full justify-between gap-1 sm:mb-2 sm:gap-2 lg:mb-4">
					<div
						data-active={!isLocked}
						className="
                            bg-black/10 w-full rounded-[var(--radius)] border-[0.2rem] border-black/10
                            flex justify-center items-center select-none cursor-pointer
                            hover:bg-black/20 transition-all duration-100
                            data-[active=true]:bg-green-600/20 dark:data-[active=true]:bg-green-500/20
                            min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[3rem]
                        "
						onMouseUp={handleUnlockInactive}
						onMouseDown={handleUnlockActive}
						style={{ padding: "0.25rem 0.5rem", cursor: "pointer" }}
					>
						{isLocked ? (
							<LockIcon className="text-destructive h-4 w-4 sm:h-5 sm:w-5" />
						) : (
							<UnlockIcon className="h-4 w-4 text-green-600 sm:h-5 sm:w-5 dark:text-green-400" />
						)}
					</div>

					<div
						data-active={speedIncActive || speedDecActive}
						className="
                            bg-black/10 w-full rounded-[var(--radius)] border-[0.2rem] border-black/10
                            flex justify-center items-center select-none cursor-pointer
                            hover:bg-black/20 transition-all duration-100
                            data-[active=true]:bg-green-600/20 dark:data-[active=true]:bg-green-500/20
                            min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[3rem]
                        "
						style={{ padding: "0.25rem 0.5rem" }}
					>
						<span className="flex items-center gap-1">
							<GaugeIcon className="h-4 w-4 sm:h-5 sm:w-5" />
							<span className="text-xs sm:text-sm">
								{speed.toFixed(1)} m/s
							</span>
						</span>
					</div>
				</div>

				{/* Axis rows */}
				<div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-2 overflow-auto sm:gap-3 lg:gap-4">
					{bindings.length > 0 ? (
						bindings.map((binding) => (
							<TeleopAxisRow
								key={binding.key}
								binding={binding}
								handlers={axisHandlers.get(binding.key)}
								value={axisScalar(binding, inputState)}
							/>
						))
					) : (
						<div className="text-muted-foreground flex h-full items-center justify-center">
							No axes configured. Please configure axes in the
							widget settings.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * Widget body: a publisher scope around {@link TeleopControl}.
 *
 * Module-level per pattern 10 — the definition factory re-runs on every
 * dashboard render, and an inline component here would remount the widget and
 * drop the lock, the speed and every held key with it.
 *
 * @param data - Widget settings.
 * @returns React element.
 */
function CmdVelTeleopWidget(data: TeleopControlData) {
	return data.topic ? (
		<PublisherDataSourcesProvider SelectedTopics={[data.topic]}>
			<TeleopControl {...data} />
		</PublisherDataSourcesProvider>
	) : (
		<div className="text-muted-foreground flex h-full items-center justify-center">
			Please select a topic in the widget configuration.
		</div>
	);
}

/** Shown while `mode` is anything other than `analog`, including unset. */
const SHOW_WHEN_DIGITAL = {
	effect: RuleEffect.SHOW,
	condition: {
		scope: "#/properties/mode",
		schema: { not: { const: "analog" } },
	},
} as const;

/** Shown only for an explicit `analog` mode. */
const SHOW_WHEN_ANALOG = {
	effect: RuleEffect.SHOW,
	condition: {
		scope: "#/properties/mode",
		schema: { const: "analog" },
	},
} as const;

/**
 * Definition for the teleop widget.
 *
 * One widget for keyboard, gamepad buttons and analog sticks: the per-axis
 * binding is a union of a digital pair and an analog pair, discriminated by a
 * plain `mode` enum rather than a JSON Schema combinator. Both pairs are
 * persisted side by side and the configuration form shows exactly the one the
 * mode selects, which keeps the existing `Key` and `Axis` controls unchanged
 * and keeps a mode switch from handing one reader the other's value.
 *
 * @returns Widget definition.
 */
export function TeleopControlDefinition(): WidgetDefinition<TeleopControlData> {
	return {
		id: "teleop-cmd-vel-widget",
		name: "Teleop control",
		description:
			"Drive a robot from the keyboard, gamepad buttons or analog sticks",
		titleProp: "title",
		icon: <Gamepad2Icon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				axes: {
					type: "array",
					title: "Axes",
					items: {
						type: "object",
						properties: {
							axis: {
								type: "string",
								title: "Axis",
								enum: [...MOVEMENT_AXES],
								default: "linear.x",
							},
							mode: {
								type: "string",
								title: "Input",
								default: "digital",
								oneOf: [
									{
										title: "Key or button",
										const: "digital",
									},
									{
										title: "Analog stick",
										const: "analog",
									},
								],
							},
							digital_positive: {
								type: "object",
								title: "Positive key",
							},
							digital_negative: {
								type: "object",
								title: "Negative key",
							},
							analog_positive: {
								type: "object",
								title: "Positive stick",
							},
							analog_negative: {
								type: "object",
								title: "Negative stick",
							},
							multiplier: {
								type: "number",
								title: "Multiplier",
								default: 1,
								minimum: 0,
								maximum: 10,
							},
						},
					},
				},
				startingSpeed: {
					type: "number",
					title: "Starting Speed (m/s)",
					default: 1.0,
					minimum: 0,
					maximum: 10,
				},
				incSpeed: {
					type: "object",
					title: "Increase Speed",
				},
				decSpeed: {
					type: "object",
					title: "Decrease Speed",
				},
				unlock: {
					type: "object",
					title: "Unlock",
				},
				unlocktoggle: {
					type: "boolean",
					title: "Unlock is Toggle",
					default: false,
				},
				topic: {
					type: "object",
					title: "Topic",
				},
				publicationFrequency: {
					type: "number",
					title: "Publication Frequency (Hz)",
					default: 30,
					minimum: 1,
				},
				keepPublishZero: {
					type: "boolean",
					title: "Publish 0 when inactive",
					default: false,
				},
			},
			required: ["title", "incSpeed", "decSpeed", "unlock"],
		},
		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/axes",
					options: {
						detail: {
							type: "VerticalLayout",
							elements: [
								{
									type: "Control",
									scope: "#/properties/axis",
								} as ControlElement,
								{
									type: "Control",
									scope: "#/properties/mode",
								} as ControlElement,
								{
									type: "VerticalLayout",
									rule: SHOW_WHEN_DIGITAL,
									elements: [
										{
											type: "Key",
											scope: "#/properties/digital_positive",
										} as KeyControlType,
										{
											type: "Key",
											scope: "#/properties/digital_negative",
										} as KeyControlType,
									],
								} as VerticalLayout,
								{
									type: "VerticalLayout",
									rule: SHOW_WHEN_ANALOG,
									elements: [
										{
											type: "Axis",
											scope: "#/properties/analog_positive",
										} as axisControlType,
										{
											type: "Axis",
											scope: "#/properties/analog_negative",
										} as axisControlType,
									],
								} as VerticalLayout,
								{
									type: "Control",
									scope: "#/properties/multiplier",
								} as ControlElement,
							],
						},
					},
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/startingSpeed",
				} as ControlElement,
				{
					type: "Key",
					scope: "#/properties/incSpeed",
				} as KeyControlType,
				{
					type: "Key",
					scope: "#/properties/decSpeed",
				} as KeyControlType,
				{
					type: "Key",
					scope: "#/properties/unlock",
				} as KeyControlType,
				{
					type: "Control",
					scope: "#/properties/unlocktoggle",
				} as ControlElement,
				{
					type: "TopicSelect",
					scope: "#/properties/topic",
					options: {
						dataRequirements: {
							accepts: ["Movement"],
						},
						// Keeps a sensor topic from ever routing here: this
						// slot publishes, it does not subscribe.
						direction: "publish",
					},
				} as TopicSelectElement,
				{
					type: "Control",
					scope: "#/properties/publicationFrequency",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/keepPublishZero",
				} as ControlElement,
			],
		} as VerticalLayout,
		data: {
			title: "Robot teleop",
			startingSpeed: 0.5,
			publicationFrequency: 30,
			unlocktoggle: false,
			keepPublishZero: false,
			axes: [
				{
					axis: "linear.x",
					mode: "digital",
					digital_positive: { type: "keyboard", key: "w" },
					digital_negative: { type: "keyboard", key: "s" },
					multiplier: 1,
				},
				{
					axis: "angular.z",
					mode: "digital",
					digital_positive: { type: "keyboard", key: "a" },
					digital_negative: { type: "keyboard", key: "d" },
					multiplier: 1,
				},
			],
			incSpeed: { type: "keyboard", key: "+" },
			decSpeed: { type: "keyboard", key: "-" },
			unlock: { type: "keyboard", key: " " },
		},
		Component: CmdVelTeleopWidget,
	};
}

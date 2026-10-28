import { useState } from "react";
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager } from "@workspace/ormi-plugins";
import { datasourceSelectProperty } from "@workspace/utils";
import {
	DigitalInput,
	DigitalComponent,
	usePointerHold,
} from "@workspace/ui/combined/triggers";
import { KeyControlType } from "@workspace/ormi-jsonforms";

/**
 * Props for Tello commands control widget.
 */
interface TelloCommandsControlData extends Record<string, unknown> {
	title: string;
	telloSourceId: string;
	takeoff: DigitalInput;
	land: DigitalInput;
	streamOn: DigitalInput;
	streamOff: DigitalInput;
	command: DigitalInput;
	emergency: DigitalInput;
}

/** Props for one on-screen Tello command key. */
interface TelloKeyProps {
	label: string;
	active: boolean;
	onPress: () => void;
	onRelease: () => void;
}

/**
 * One on-screen command key: sends on press and stays lit while held.
 *
 * Pointer events with capture (`usePointerHold`), never mouse events: under
 * touch a mouse press is synthesised only after the finger lifts. Not a
 * focusable `<button>`, so the space key cannot press it; keyboard bindings go
 * through the hidden `DigitalComponent`s instead.
 */
function TelloKey({ label, active, onPress, onRelease }: TelloKeyProps) {
	const { holdProps } = usePointerHold({ onPress, onRelease });
	return (
		<div {...holdProps} data-active={active} className={KEY_CLASS_NAMES}>
			{label}
		</div>
	);
}

const KEY_CLASS_NAMES =
	"bg-foreground/10 p-[5%] w-full rounded-[var(--radius)] border-[0.2rem] border-foreground/10 flex justify-center items-center touch-none select-none hover:bg-foreground/20 hover:cursor-pointer data-[active=true]:bg-success/20 data-[active=true]:scale-(--press-scale) transition-all duration-(--motion-fast) ease-(--motion-ease) any-pointer-coarse:min-h-11";

/**
 * Tello drone command control widget.
 * @param props - Widget props.
 * @returns React element.
 */
export function TelloCommandsControl(props: TelloCommandsControlData) {
	const pluginsManager = usePluginsManager();
	const telloWS = pluginsManager.applyFilter<WebSocket>(
		`${props.telloSourceId}-tello-connection`,
		null,
	);

	const [activeTakeoff, setActiveTakeoff] = useState<boolean>(false);
	const [activeLand, setActiveLand] = useState<boolean>(false);
	const [activeStreamOn, setActiveStreamOn] = useState<boolean>(false);
	const [activeStreamOff, setActiveStreamOff] = useState<boolean>(false);
	const [activeEmergency, setActiveEmergency] = useState<boolean>(false);
	const [activeCommand, setActiveCommand] = useState<boolean>(false);

	const handleTakeoffActive = () => {
		if (telloWS) {
			telloWS.send("takeoff");
		}
		setActiveTakeoff(true);
	};

	const handleLandActive = () => {
		if (telloWS) {
			telloWS.send("land");
		}
		setActiveLand(true);
	};

	const handleStreamOnActive = () => {
		if (telloWS) {
			telloWS.send("streamon");
		}
		setActiveStreamOn(true);
	};

	const handleStreamOffActive = () => {
		if (telloWS) {
			telloWS.send("streamoff");
		}
		setActiveStreamOff(true);
	};

	const handleEmergencyActive = () => {
		if (telloWS) {
			telloWS.send("emergency");
		}
		setActiveEmergency(true);
	};

	const handleCommandActive = () => {
		if (telloWS) {
			telloWS.send("command");
		}
		setActiveCommand(true);
	};

	return (
		<div
			style={{
				display: "grid",
				gap: "1rem",
				width: "100%",
				height: "100%",
			}}
		>
			<div style={{ display: "none" }}>
				<DigitalComponent
					digitalInput={props.command}
					onActive={handleCommandActive}
					onInactive={() => {
						setActiveCommand(false);
					}}
				/>
				<DigitalComponent
					digitalInput={props.takeoff}
					onActive={handleTakeoffActive}
					onInactive={() => {
						setActiveTakeoff(false);
					}}
				/>
				<DigitalComponent
					digitalInput={props.land}
					onActive={handleLandActive}
					onInactive={() => {
						setActiveLand(false);
					}}
				/>
				<DigitalComponent
					digitalInput={props.streamOn}
					onActive={handleStreamOnActive}
					onInactive={() => {
						setActiveStreamOn(false);
					}}
				/>
				<DigitalComponent
					digitalInput={props.streamOff}
					onActive={handleStreamOffActive}
					onInactive={() => {
						setActiveStreamOff(false);
					}}
				/>
				<DigitalComponent
					digitalInput={props.emergency}
					onActive={handleEmergencyActive}
					onInactive={() => {
						setActiveEmergency(false);
					}}
				/>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(2, 1fr)",
					gap: "1rem",
				}}
			>
				<TelloKey
					label="Command"
					active={activeCommand}
					onPress={handleCommandActive}
					onRelease={() => setActiveCommand(false)}
				/>
				<TelloKey
					label="Emergency"
					active={activeEmergency}
					onPress={handleEmergencyActive}
					onRelease={() => setActiveEmergency(false)}
				/>
				<TelloKey
					label="Take off"
					active={activeTakeoff}
					onPress={handleTakeoffActive}
					onRelease={() => setActiveTakeoff(false)}
				/>
				<TelloKey
					label="Land"
					active={activeLand}
					onPress={handleLandActive}
					onRelease={() => setActiveLand(false)}
				/>
				<TelloKey
					label="Stream On"
					active={activeStreamOn}
					onPress={handleStreamOnActive}
					onRelease={() => setActiveStreamOn(false)}
				/>
				<TelloKey
					label="Stream Off"
					active={activeStreamOff}
					onPress={handleStreamOffActive}
					onRelease={() => setActiveStreamOff(false)}
				/>
			</div>
		</div>
	);
}

const TelloDroneSVGIcon = () => {
	return (
		<svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M12 4L14 6H19L21 8H3L5 6H10L12 4Z" />
			<rect x="8" y="8" width="8" height="4" rx="1" />
			<path d="M5 12L3 17M19 12L21 17" />
			<path d="M8 16L5 20M16 16L19 20" />
			<circle cx="12" cy="10" r="1" />
		</svg>
	);
};

/** Settings for TelloCommandsControl widget. */

/**
 * Returns widget definition for Tello commands control.
 * @returns Widget definition.
 */
export function TelloCommandsControlDefinition(): WidgetDefinition<TelloCommandsControlData> {
	return {
		id: "command-tello-widget",
		name: "Tello commands",
		description: "Command center for Tello drone",
		titleProp: "title",
		icon: <TelloDroneSVGIcon />,
		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
				// A pick-list of the configured Tello datasources. The widget
				// needs a concrete datasource to build its connection hook name,
				// so no "automatic" option is offered.
				telloSourceId: datasourceSelectProperty({
					title: "Tello datasource",
					definitionIds: "tello-data-source",
				}),
				takeoff: {
					type: "object",
					title: "Take off",
				},
				land: {
					type: "object",
					title: "Land",
				},
				streamOn: {
					type: "object",
					title: "Stream On",
				},
				streamOff: {
					type: "object",
					title: "Stream Off",
				},
				command: {
					type: "object",
					title: "Command",
				},
				emergency: {
					type: "object",
					title: "Emergency",
				},
			},
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
					scope: "#/properties/telloSourceId",
				} as ControlElement,
				{
					type: "Key",
					scope: "#/properties/takeoff",
				} as KeyControlType,
				{
					type: "Key",
					scope: "#/properties/land",
				} as KeyControlType,
				{
					type: "Key",
					scope: "#/properties/streamOn",
				} as KeyControlType,
				{
					type: "Key",
					scope: "#/properties/streamOff",
				} as KeyControlType,
				{
					type: "Key",
					scope: "#/properties/command",
				} as KeyControlType,
				{
					type: "Key",
					scope: "#/properties/emergency",
				} as KeyControlType,
			],
		} as VerticalLayout,
		data: {
			title: "TelloCommands Control",
		},
		Component: TelloCommandsControl,
	};
}

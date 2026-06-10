import { useState } from "react"; // Import useCallback
import { ControlElement, VerticalLayout } from "@jsonforms/core";
import { Datasource } from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import {
	DigitalInput,
	DigitalComponent,
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

	const handleMouseDown = (key: string) => {
		// set active to true
		if (key === "command") {
			handleCommandActive();
		}
		if (key === "takeoff") {
			handleTakeoffActive();
		}
		if (key === "land") {
			handleLandActive();
		}
		if (key === "streamOn") {
			handleStreamOnActive();
		}
		if (key === "streamOff") {
			handleStreamOffActive();
		}
		if (key === "emergency") {
			handleEmergencyActive();
		}
	};

	const handleMouseUp = (key: string) => {
		// set active to false
		if (key === "command") {
			setActiveCommand(false);
		}
		if (key === "takeoff") {
			setActiveTakeoff(false);
		}
		if (key === "land") {
			setActiveLand(false);
		}
		if (key === "streamOn") {
			setActiveStreamOn(false);
		}
		if (key === "streamOff") {
			setActiveStreamOff(false);
		}
		if (key === "emergency") {
			setActiveEmergency(false);
		}
	};

	const keyStyleNames =
		"bg-black/10 p-[5%] w-full rounded-[var(--radius)] border-[0.2rem] border-black/10 flex justify-center items-center select-none hover:bg-black/20 hover:scale-110 hover:cursor-pointer data-[active=true]:bg-green-600/20 dark:data-[active=true]:bg-green-500/20 data-[active=true]:scale-110 transition-all duration-100";

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
				<div
					data-active={activeCommand}
					className={keyStyleNames}
					style={{ width: "100%" }}
				>
					<span
						onMouseUp={() => {
							handleMouseUp("command");
						}}
						onMouseDown={() => {
							handleMouseDown("command");
						}}
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							width: "100%",
							height: "100%",
						}}
					>
						Command
					</span>
				</div>
				<div
					data-active={activeEmergency}
					className={keyStyleNames}
					style={{ width: "100%" }}
				>
					<span
						onMouseUp={() => {
							handleMouseUp("emergency");
						}}
						onMouseDown={() => {
							handleMouseDown("emergency");
						}}
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							width: "100%",
							height: "100%",
						}}
					>
						Emergency
					</span>
				</div>
				<div
					data-active={activeTakeoff}
					className={keyStyleNames}
					style={{ width: "100%" }}
				>
					<span
						onMouseUp={() => {
							handleMouseUp("takeoff");
						}}
						onMouseDown={() => {
							handleMouseDown("takeoff");
						}}
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							width: "100%",
							height: "100%",
						}}
					>
						Take off
					</span>
				</div>
				<div
					data-active={activeLand}
					className={keyStyleNames}
					style={{ width: "100%" }}
				>
					<span
						onMouseUp={() => {
							handleMouseUp("land");
						}}
						onMouseDown={() => {
							handleMouseDown("land");
						}}
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							width: "100%",
							height: "100%",
						}}
					>
						Land
					</span>
				</div>
				<div
					data-active={activeStreamOn}
					className={keyStyleNames}
					style={{ width: "100%" }}
				>
					<span
						onMouseUp={() => {
							handleMouseUp("streamOn");
						}}
						onMouseDown={() => {
							handleMouseDown("streamOn");
						}}
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							width: "100%",
							height: "100%",
						}}
					>
						Stream On
					</span>
				</div>
				<div
					data-active={activeStreamOff}
					className={keyStyleNames}
					style={{ width: "100%" }}
				>
					<span
						onMouseUp={() => {
							handleMouseUp("streamOff");
						}}
						onMouseDown={() => {
							handleMouseDown("streamOff");
						}}
						style={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							width: "100%",
							height: "100%",
						}}
					>
						Stream Off
					</span>
				</div>
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
	const pluginsManager = usePluginsManager();

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
				telloSourceId: {
					type: "string",
					title: "Tello Source",
				},
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
					options: {
						async: true,
						asyncFunction: async () => {
							const datasources = Array.from(
								pluginsManager.applyFilter<Datasource[]>(
									PluginsHooks.AVAILABLE_DATASOURCES,
									[],
								),
							).filter(
								(ds) =>
									ds.datasource_id === "tello-data-source",
							);

							const values = Array.from(datasources).map(
								(ds) => ({
									value: ds.settings.id,
									label: ds.settings.title,
								}),
							);

							return values;
						},
					},
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

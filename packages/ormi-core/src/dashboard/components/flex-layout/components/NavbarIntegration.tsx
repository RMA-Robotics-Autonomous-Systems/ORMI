import React from "react";
import { useAtomValue } from "jotai";
import { Button } from "@workspace/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { LockIcon, LockOpenIcon, Save, Check } from "lucide-react";
import { NavbarItem } from "@workspace/ui/combined/navbar";
import { datasourcesAtom, widgetsAtom } from "../../../atoms";

/** Props for NavbarIntegration. */
interface NavbarIntegrationProps {
	locked: boolean;
	hasChanged: boolean;
	onLockToggle: () => void;
	onSave: () => void;
}

/**
 * Register navbar items for the FlexLayout dashboard.
 * @param props - Component props.
 * @returns Navbar contributions.
 */
export const NavbarIntegration: React.FC<NavbarIntegrationProps> = ({
	locked,
	hasChanged,
	onLockToggle,
	onSave,
}) => {
	const datasources = useAtomValue(datasourcesAtom);
	const widgets = useAtomValue(widgetsAtom);

	const lockLabel = locked ? "Unlock dashboard" : "Lock dashboard";

	// Pulse discipline, matching the grid engine: only the next required step
	// pulses. The datasources button owns the first step (no datasource
	// configured); saving stays quiet until there is a configured datasource
	// and at least one widget to persist.
	const savePulses = hasChanged && datasources.size > 0 && widgets.size > 0;

	return (
		<>
			<NavbarItem id="lock_unlock" zone="center">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							aria-label={lockLabel}
							onClick={onLockToggle}
						>
							{!locked ? (
								<LockIcon aria-hidden />
							) : (
								<LockOpenIcon aria-hidden />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{lockLabel}</TooltipContent>
				</Tooltip>
			</NavbarItem>
			<NavbarItem id="save" zone="center">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							aria-label={
								hasChanged
									? "Save dashboard"
									: "Dashboard saved"
							}
							className={savePulses ? "animate-pulse" : ""}
							style={
								savePulses
									? {
											animation:
												"pulse-bg 0.7s infinite, pulse-scale 0.7s infinite",
											boxShadow:
												"0 0 0 0 hsl(var(--primary))",
										}
									: {}
							}
							onClick={onSave}
						>
							{hasChanged ? (
								<Save aria-hidden />
							) : (
								<Check aria-hidden />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{hasChanged
							? "Save dashboard"
							: "Dashboard saved — no pending changes"}
					</TooltipContent>
				</Tooltip>
			</NavbarItem>
		</>
	);
};

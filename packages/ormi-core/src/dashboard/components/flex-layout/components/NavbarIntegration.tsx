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
import { ATTENTION_CLASS, shouldSaveCallAttention } from "../../attention";

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

	// Only the next required step is cued; see shouldSaveCallAttention.
	const savePulses = shouldSaveCallAttention({
		hasChanged,
		datasourceCount: datasources.size,
		widgetCount: widgets.size,
	});

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
							className={savePulses ? ATTENTION_CLASS : undefined}
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
						{hasChanged ? "Save dashboard" : "No unsaved changes"}
					</TooltipContent>
				</Tooltip>
			</NavbarItem>
		</>
	);
};

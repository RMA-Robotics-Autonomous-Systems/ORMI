import React from "react";
import { Button } from "@workspace/ui/components/button";
import { LockIcon, LockOpenIcon, Save, Check } from "lucide-react";
import { NavbarItem } from "@workspace/ui/combined/navbar";
import { useTemplates } from "../../../../templates/templates-provider";
import { WidgetTemplateDrawer } from "../../../../templates/components/templates-drawer";
import { WidgetsCombo } from "../../../../widgets/components/widget-combo/widget-combo";
import { WidgetDefinition } from "../../../../widgets/widget-interface";
import { useDashboardRegistry } from "../../../shell/dashboard-shell";

/** Props for NavbarIntegration. */
interface NavbarIntegrationProps {
	locked: boolean;
	hasChanged: boolean;
	onLockToggle: () => void;
	onSave: () => void;
	onAddWidget: (
		widget: WidgetDefinition,
		settings: Record<string, unknown>,
	) => void;
	onAddDatasource: (datasource_id: string, settings?: any) => void;
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
	onAddWidget,
	onAddDatasource,
}) => {
	const { templates, removeTemplate, updateTemplate } = useTemplates();
	const { widgetDefinitions, datasourceDefinitions } = useDashboardRegistry();

	return (
		<>
			<NavbarItem id="template_drawer" zone="right">
				<WidgetTemplateDrawer
					templates={templates}
					addWidget={onAddWidget}
					addDatasource={onAddDatasource}
					removeTemplate={removeTemplate}
					updateTemplate={updateTemplate}
					widgetDefinitions={widgetDefinitions}
					datasourceDefinitions={datasourceDefinitions}
				/>
			</NavbarItem>
			<NavbarItem id="widgets_combo" zone="center">
				<WidgetsCombo
					widgetDefinitions={widgetDefinitions}
					onValidate={onAddWidget}
				/>
			</NavbarItem>
			<NavbarItem id="lock_unlock" zone="center">
				<Button variant="ghost" onClick={onLockToggle}>
					{!locked ? <LockIcon /> : <LockOpenIcon />}
				</Button>
			</NavbarItem>
			<NavbarItem id="save" zone="center">
				<Button
					variant="ghost"
					className={hasChanged ? "animate-pulse" : ""}
					style={
						hasChanged
							? {
									animation:
										"pulse-bg 0.7s infinite, pulse-scale 0.7s infinite",
									boxShadow: "0 0 0 0 hsl(var(--primary))",
								}
							: {}
					}
					onClick={onSave}
				>
					{hasChanged ? <Save /> : <Check />}
				</Button>
			</NavbarItem>
		</>
	);
};

import React, { useEffect, useCallback } from "react";
import { Button } from "@workspace/ui/components/button";
import { LockIcon, LockOpenIcon, Save, Check } from "lucide-react";
import { useNavbar } from "@workspace/ui/combined/navbar";
import { useTemplates } from "../../../../templates/templates-provider";
import { WidgetTemplateDrawer } from "../../../../templates/components/templates-drawer";
import { WidgetsCombo } from "../../../../widgets/components/widget-combo/widget-combo";
import { WidgetDefinition } from "../../../../widgets/widget-interface";

interface NavbarIntegrationProps {
    locked: boolean;
    hasChanged: boolean;
    onLockToggle: () => void;
    onSave: () => void;
    onAddWidget: (widget: WidgetDefinition, settings: any) => void;
    onAddDatasource: (datasource_id: string, settings?: any) => void;
}

/**
 * Handles navbar integration for FlexLayout dashboard
 * Adds widget combo, template drawer, lock/unlock, and save buttons
 */
export const NavbarIntegration: React.FC<NavbarIntegrationProps> = ({
    locked,
    hasChanged,
    onLockToggle,
    onSave,
    onAddWidget,
    onAddDatasource,
}) => {
    const { setNavbarItem, removeNavbarItem } = useNavbar();
    const { templates, removeTemplate, updateTemplate } = useTemplates();

    // Use refs to capture the latest callback functions to avoid closure issues
    const onSaveRef = React.useRef(onSave);
    const onLockToggleRef = React.useRef(onLockToggle);

    // Update refs when props change
    React.useEffect(() => {
        onSaveRef.current = onSave;
        onLockToggleRef.current = onLockToggle;
    }, [onSave, onLockToggle]);

    const onAddWidgetRef = React.useRef(onAddWidget);
    const onAddDatasourceRef = React.useRef(onAddDatasource);

    React.useEffect(() => {
        onAddWidgetRef.current = onAddWidget;
        onAddDatasourceRef.current = onAddDatasource;
    }, [onAddWidget, onAddDatasource]);

    const handleAddWidget = useCallback(
        (widget: WidgetDefinition, settings: object) => {
            onAddWidgetRef.current(widget, settings);
        },
        []
    );

    // Setup navbar items
    useEffect(() => {
        // Template drawer (right side)
        setNavbarItem(
            "right",
            "template_drawer",
            <WidgetTemplateDrawer
                templates={templates}
                addWidget={(widget, settings) => onAddWidgetRef.current(widget, settings)}
                addDatasource={(datasourceId, settings) => onAddDatasourceRef.current(datasourceId, settings)}
                removeTemplate={removeTemplate}
                updateTemplate={updateTemplate}
            />
        );

        // Widget combo (center)
        setNavbarItem(
            "center",
            "widgets_combo",
            <WidgetsCombo onValidate={handleAddWidget} />
        );

        // Lock/unlock button (center)
        setNavbarItem(
            "center",
            "lock_unlock",
            <Button
                variant="ghost"
                onClick={() => onLockToggleRef.current()}
            >
                {!locked ? <LockIcon /> : <LockOpenIcon />}
            </Button>
        );

        // Save button (center)
        setNavbarItem(
            "center",
            "save",
            <Button
                variant="ghost"
                className={hasChanged ? "animate-pulse" : ""}
                style={
                    hasChanged
                        ? {
                            animation: "pulse-bg 0.7s infinite, pulse-scale 0.7s infinite",
                            boxShadow: "0 0 0 0 hsl(var(--primary))",
                        }
                        : {}
                }
                onClick={() => onSaveRef.current()}
            >
                {hasChanged ? <Save /> : <Check />}
            </Button>
        );

        // Cleanup function
        return () => {
            removeNavbarItem("right", "template_drawer");
            removeNavbarItem("center", "widgets_combo");
            removeNavbarItem("center", "lock_unlock");
            removeNavbarItem("center", "save");
        };
    }, [
        templates,
        locked,
        hasChanged,
        removeTemplate,
        updateTemplate,
        setNavbarItem,
        removeNavbarItem
    ]);

    return null; // This component only manages navbar items
};
"use client";

import React, { useRef, ReactNode, useState, useCallback } from "react";
import { WidgetCard } from "../../../../widgets/components/widget-card/widget-card";
import { createSafeContext } from "@workspace/utils";

/** Dialog state for the widget config dialog. */
interface DialogState {
	isOpen: boolean;
	widgetId: string;
	widget: any;
	definition: any;
	onUpdateWidget: (box_id: string, settings: any) => void;
}

/** FlexLayout portal context value. */
interface FlexLayoutPortalContextType {
	registerPortal: (widgetId: string, container: HTMLElement) => void;
	unregisterPortal: (widgetId: string) => void;
	getPortalContainer: (widgetId: string) => HTMLElement | null;
	openDialog: (
		widgetId: string,
		widget: any,
		definition: any,
		onUpdateWidget: (box_id: string, settings: any) => void,
	) => void;
	closeDialog: () => void;
	dialogState: DialogState | null;
}

const [FlexLayoutPortalContextProvider, useFlexLayoutPortalContext] =
	createSafeContext<FlexLayoutPortalContextType>("FlexLayoutPortal");

/** Props for FlexLayoutPortalProvider. */
interface FlexLayoutPortalProviderProps {
	children: ReactNode;
}

/**
 * Provide portal containers and widget dialog state for FlexLayout.
 * @param props - Component props.
 * @returns React element.
 */
export const FlexLayoutPortalProvider: React.FC<
	FlexLayoutPortalProviderProps
> = ({ children }) => {
	const portalContainers = useRef<Map<string, HTMLElement>>(new Map());
	const [dialogState, setDialogState] = useState<DialogState | null>(null);

	const registerPortal = (widgetId: string, container: HTMLElement) => {
		portalContainers.current.set(widgetId, container);
	};

	const unregisterPortal = (widgetId: string) => {
		portalContainers.current.delete(widgetId);
	};

	const getPortalContainer = (widgetId: string): HTMLElement | null => {
		return portalContainers.current.get(widgetId) || null;
	};

	const openDialog = useCallback(
		(
			widgetId: string,
			widget: any,
			definition: any,
			onUpdateWidget: (box_id: string, settings: any) => void,
		) => {
			setDialogState({
				isOpen: true,
				widgetId,
				widget,
				definition,
				onUpdateWidget,
			});
		},
		[],
	);

	const closeDialog = useCallback(() => {
		setDialogState(null);
	}, []);

	const contextValue: FlexLayoutPortalContextType = {
		registerPortal,
		unregisterPortal,
		getPortalContainer,
		openDialog,
		closeDialog,
		dialogState,
	};

	return (
		<FlexLayoutPortalContextProvider value={contextValue}>
			{children}
			{/* Render dialog outside of FlexLayout structure */}
			{dialogState && (
				<WidgetCard
					key={`dialog-${dialogState.widgetId}`}
					fromLoaded={true}
					data={dialogState.widget.settings}
					definition={dialogState.definition}
					displayType="gear"
					isDialogOpen={dialogState.isOpen}
					onDialogClose={closeDialog}
					onValidate={(widget_def, settings) => {
						dialogState.onUpdateWidget(
							dialogState.widget.box_id,
							settings,
						);
						closeDialog();
					}}
				/>
			)}
		</FlexLayoutPortalContextProvider>
	);
};

/**
 * Access the FlexLayout portal context.
 * @returns FlexLayout portal context value.
 */
export const useFlexLayoutPortal = (): FlexLayoutPortalContextType => {
	return useFlexLayoutPortalContext();
};

"use client";

import React, { ReactNode, useState, useCallback } from "react";
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

/** FlexLayout widget-config dialog context value. */
interface FlexLayoutPortalContextType {
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
 * Provide widget config dialog state for FlexLayout.
 * @param props - Component props.
 * @returns React element.
 */
export const FlexLayoutPortalProvider: React.FC<
	FlexLayoutPortalProviderProps
> = ({ children }) => {
	const [dialogState, setDialogState] = useState<DialogState | null>(null);

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
 * Access the FlexLayout widget-config dialog context.
 * @returns FlexLayout dialog context value.
 */
export const useFlexLayoutPortal = (): FlexLayoutPortalContextType => {
	return useFlexLayoutPortalContext();
};

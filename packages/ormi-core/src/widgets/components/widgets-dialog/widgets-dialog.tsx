"use client";

/**
 * Dialog for selecting and configuring widgets.
 */

import { useState } from "react";

import { Plus } from "lucide-react"; // Import the plus icon

import { WidgetCard } from "../widget-card/widget-card";

import { WidgetDefinition } from "../../widget-interface";
import { useDashboardActions } from "./../../../dashboard";
import { useAtomValue } from "jotai";
import { lockedAtom } from "./../../../dashboard";

import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@workspace/ui/components/dialog";
import style from "./widgets-dialog.module.css";

/**
 * Floating dialog to add widgets to the dashboard.
 * @param props - Component props.
 * @returns React element.
 */
export function WidgetsDialog(props: {
	widgetDefinitions: WidgetDefinition[];
}) {
	const [isOpen, setIsOpen] = useState(false);

	const { widgetDefinitions } = props;
	const { addWidget } = useDashboardActions();
	const locked = useAtomValue(lockedAtom);

	const handleValidate = (
		widget: WidgetDefinition,
		settings: Record<string, unknown>,
	) => {
		addWidget(widget, settings);
		setIsOpen(false); // close the dialog
	};

	return (
		!locked && (
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogTrigger asChild>
					<Button
						className={style.floatingButton}
						onClick={() => setIsOpen(true)}
					>
						<Plus size={32} />{" "}
						{/* Increase the size of the plus icon */}
					</Button>
				</DialogTrigger>
				<DialogContent size="large">
					<DialogHeader>
						<DialogTitle>Widgets</DialogTitle>
						<DialogDescription>
							Select a widget to add to the dashboard
						</DialogDescription>
					</DialogHeader>
					<div className={style.widget_container}>
						{widgetDefinitions.length > 0 ? (
							widgetDefinitions.map((widget, index) => (
								<WidgetCard
									key={index}
									definition={widget}
									onValidate={handleValidate}
								/>
							))
						) : (
							<div
								style={{
									textAlign: "center",
									padding: "2rem",
									color: "hsl(var(--muted-foreground))",
								}}
							>
								<p>
									No widgets available. Please add and connect
									a datasource first.
								</p>
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		)
	);
}

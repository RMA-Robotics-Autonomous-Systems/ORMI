"use client";

import { WidgetDefinition } from "../../widget-interface";

import {
	materialRenderers,
	materialCells,
} from "@jsonforms/material-renderers";
import { shadcnRenderer, shadcnCells } from "@workspace/ormi-jsonforms";

import React, { useState } from "react";
import { JsonForms } from "@jsonforms/react";
import { JsonFormsRendererRegistryEntry } from "@jsonforms/core";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@workspace/ui/components/dialog";
import { SettingsIcon, CheckIcon } from "lucide-react";
import { AddToTemplatesBtn } from "../../../templates/components/add-to-templates";
import { coreRenderer } from "../../../renderers";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import {
	ConfigValidationError,
	formatConfigErrorNotice,
	hasConfigErrors,
	summarizeConfigErrors,
} from "../../../forms/config-errors";

import styles from "./widget-card.module.css";

// Import the custom renderers

/** Props for WidgetCard. */
interface WidgetCardProps {
	/**
	 * `card` (the default) is the catalogue tile the launcher grids; `gear` is
	 * the settings affordance a mounted widget carries in its header.
	 */
	displayType?: "card" | "gear";
	definition: WidgetDefinition;
	data?: any;
	onValidate: (
		widget: WidgetDefinition,
		settings: Record<string, unknown>,
	) => void;
	fromLoaded?: boolean;
	isDialogOpen?: boolean;
	onDialogClose?: () => void;
}

/**
 * Widget configuration card with JsonForms dialog.
 * @param props - Component props.
 * @returns React element.
 */
export function WidgetCard(props: WidgetCardProps) {
	const [data, setData] = useState<any>(
		() => props.data ?? props.definition.data,
	);
	const [errors, setErrors] = useState<ConfigValidationError[] | null>(null);
	const [internalOpen, setInternalOpen] = useState(false);

	// `isDialogOpen` opts the call site into driving the dialog itself.
	const isControlled = props.isDialogOpen !== undefined;
	const isOpen = isControlled ? props.isDialogOpen! : internalOpen;

	/** Close the dialog without committing, in either open mode. */
	const closeDialog = () => {
		if (!isControlled) setInternalOpen(false);
		props.onDialogClose?.();
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			closeDialog();
			return;
		}

		// Reopening shows the persisted settings: an abandoned edit must not
		// survive as the starting point of the next one.
		setData(props.data ?? props.definition.data);
		setErrors(null);
		if (!isControlled) setInternalOpen(true);
	};

	const handleConfirm = () => {
		if (hasConfigErrors(errors)) {
			// Controls render their own error inline; the notice names the
			// fields and spells out only what has no field to appear on.
			const notice = formatConfigErrorNotice(
				summarizeConfigErrors(errors, props.definition.schema),
			);

			if (notice) toast.error(notice);

			return;
		}

		props.onValidate(props.definition, data);
		closeDialog();
	};

	const getButton = () => {
		if (props.displayType === "gear") {
			return (
				<Button variant={"ghost"}>
					<SettingsIcon />
				</Button>
			);
		}

		return (
			<button className={styles.card}>
				<div className={styles.overlay}>
					<p className={styles.description}>
						{props.definition.description}
					</p>
				</div>
				<div className={styles.content}>
					<div style={{ scale: 3 }}>
						{props.definition.icon || <SettingsIcon />}
					</div>
					<h2 className={styles.title}>{props.definition.name}</h2>
				</div>
			</button>
		);
	};

	const pluginsManager = usePluginsManager();

	const baseRenderers = [
		...materialRenderers,
		...shadcnRenderer,
		...coreRenderer,
	];

	// Apply the JSON_FORMS_RENDERER hook to allow plugins to extend renderers
	const renderers = pluginsManager.applyFilter<
		JsonFormsRendererRegistryEntry[]
	>(PluginsHooks.JSON_FORMS_RENDERER, baseRenderers);

	const cellsRenderers = [...materialCells, ...shadcnCells];

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			{/* Only render trigger if not in controlled mode */}
			{!props.isDialogOpen && (
				<DialogTrigger asChild>{getButton()}</DialogTrigger>
			)}
			<DialogContent size="medium">
				<DialogHeader>
					<DialogTitle>{props.definition.name}</DialogTitle>
					<DialogDescription>Widget configuration</DialogDescription>
				</DialogHeader>
				<div>
					<JsonForms
						schema={props.definition.schema}
						uischema={props.definition.uischema}
						data={data}
						renderers={renderers}
						cells={cellsRenderers}
						onChange={({ data, errors }) => {
							setData(data);
							setErrors(errors ?? null);
						}}
					/>
					<div
						className="flex justify-end mt-1.5 gap-3"
						style={{ justifyContent: "flex-end" }}
					>
						{props.fromLoaded && props.fromLoaded === true && (
							<AddToTemplatesBtn
								widget={props.definition}
								data={data}
							/>
						)}
						<Button variant="outline" onClick={closeDialog}>
							Cancel
						</Button>
						<Button
							className="float-end"
							aria-label="Confirm widget configuration"
							onClick={handleConfirm}
						>
							<CheckIcon />
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

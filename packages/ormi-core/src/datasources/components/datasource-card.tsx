"use client";

import {
	materialRenderers,
	materialCells,
} from "@jsonforms/material-renderers";

import { useState } from "react";
import { JsonForms } from "@jsonforms/react";
import { JsonFormsRendererRegistryEntry } from "@jsonforms/core";

// Import the custom renderers
import {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../datasource-interface";
import { isDatasourceConfigured } from "../datasource-configured";
import { CheckIcon, CloudCogIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import { deriveHealth } from "../datasource-interface";
import { useGlobalDataSources } from "./global-datasource-provider";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@workspace/ui/components/dialog";

import { toast } from "sonner";
import { shadcnCells, shadcnRenderer } from "@workspace/ormi-jsonforms";
import { coreRenderer } from "../../renderers";
import { AddDatasourceToTemplatesBtn, Template } from "../../templates";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import {
	ConfigValidationError,
	formatConfigErrorNotice,
	hasConfigErrors,
	summarizeConfigErrors,
} from "../../forms/config-errors";

/** Props for DatasourceCard. */
interface DatasourceCardProps {
	definition: DatasourceDefinition<DatasourceProviderSettings>;
	data?: DatasourceProviderSettings;
	onValidate: (
		datasource: DatasourceDefinition<DatasourceProviderSettings>,
		settings: any,
	) => void;
	onRemove: (source_id: string) => void;
	addTemplate: (template: Template, key?: string) => void; // Optional, if you want to add templates directly from the card
}

/**
 * Datasource configuration card with JSON Forms UI.
 * @param props - Component props.
 * @returns React element.
 */
const DatasourceCard = (props: DatasourceCardProps) => {
	const [data, setData] = useState(() => props.data ?? props.definition.data);
	const [errors, setErrors] = useState<ConfigValidationError[] | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	/** Close the dialog without committing. */
	const closeDialog = () => setIsOpen(false);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			closeDialog();
			return;
		}

		// Reopening shows the persisted settings: an abandoned edit must not
		// survive as the starting point of the next one.
		setData(props.data ?? props.definition.data);
		setErrors(null);
		setIsOpen(true);
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

	// The pulse asks the operator to configure a datasource that is still
	// sitting on its definition's defaults. It reads the persisted settings,
	// not the in-dialog draft, so an abandoned edit keeps nagging.
	const needsConfiguration = !isDatasourceConfigured(
		props.data,
		props.definition,
	);

	// A row that only carries the operator's own title cannot be told apart
	// from another of a different type, and says nothing about whether the
	// robot is actually there. Both come from state this component already
	// sits inside, so showing them costs nothing.
	const { datasourceStatuses } = useGlobalDataSources();
	const health = deriveHealth(datasourceStatuses.get(data.id));
	const statusLabel =
		health === "online"
			? "Connected"
			: health === "offline"
				? "Offline"
				: "Connecting…";
	const statusDotClass =
		health === "online"
			? "bg-green-600 dark:bg-green-400"
			: health === "offline"
				? "bg-destructive"
				: "bg-muted-foreground animate-pulse";

	const title = data.title || props.definition.name;

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
			<Card
				className={cn(
					"flex flex-row items-center gap-3 p-3 transition-colors",
					needsConfiguration && "border-primary/60 bg-primary/5",
				)}
			>
				<DialogTrigger asChild>
					<button
						type="button"
						aria-label={`Configure ${title}`}
						className="flex min-w-0 flex-1 items-center gap-3 text-left"
					>
						<span
							className={cn(
								"bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md",
								needsConfiguration &&
									"bg-primary/10 text-primary",
							)}
						>
							<CloudCogIcon className="size-5" aria-hidden />
						</span>
						<span className="flex min-w-0 flex-col gap-0.5">
							<span
								className="truncate text-sm font-medium"
								title={title}
							>
								{title}
							</span>
							<span className="text-muted-foreground flex items-center gap-1.5 text-xs">
								<span className="truncate">
									{props.definition.name}
								</span>
								<span aria-hidden>·</span>
								<span
									className={cn(
										"size-1.5 shrink-0 rounded-full",
										statusDotClass,
									)}
									aria-hidden
								/>
								<span>{statusLabel}</span>
							</span>
						</span>
					</button>
				</DialogTrigger>

				{needsConfiguration ? (
					<Badge
						variant="outline"
						className="border-primary/60 text-primary shrink-0"
					>
						Needs setup
					</Badge>
				) : null}

				<Button
					variant="ghost"
					size="sm"
					aria-label={`Remove datasource ${title}`}
					className="text-muted-foreground hover:text-destructive shrink-0"
					onClick={() => props.onRemove(data.id)}
				>
					<Trash2Icon aria-hidden />
					Remove
				</Button>
			</Card>
			<DialogContent size="large">
				<DialogHeader>
					<DialogTitle>{props.definition.name}</DialogTitle>
					<DialogDescription>
						Datasource configuration
					</DialogDescription>
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
					<div className="flex justify-between items-center mt-1.5">
						{/* Save to Templates Button - only show if datasource is configured */}
						{props.data && !needsConfiguration && (
							<AddDatasourceToTemplatesBtn
								datasource={{
									datasource_id: props.definition.id,
									title: data.title,
									settings: data,
								}}
								definition={props.definition}
								addTemplate={props.addTemplate}
							/>
						)}

						<div className="ml-auto flex gap-3">
							<Button variant="outline" onClick={closeDialog}>
								Cancel
							</Button>
							<Button
								aria-label="Confirm datasource configuration"
								onClick={handleConfirm}
							>
								<CheckIcon />
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default DatasourceCard;

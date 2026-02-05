"use client";

import {
	materialRenderers,
	materialCells,
} from "@jsonforms/material-renderers";

import { useEffect, useState } from "react";
import { JsonForms } from "@jsonforms/react";
import { JsonFormsRendererRegistryEntry } from "@jsonforms/core";

// Import the custom renderers
import {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../datasource-interface";
import { CheckIcon, CloudCogIcon, XIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
} from "@workspace/ui/components/context-menu";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogClose,
} from "@workspace/ui/components/dialog";

import { toast } from "sonner";
import { shadcnCells, shadcnRenderer } from "@workspace/ormi-jsonforms";
import { coreRenderer } from "../../renderers";
import { AddDatasourceToTemplatesBtn, Template } from "../../templates";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";

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

const DatasourceCard = (props: DatasourceCardProps) => {
	const [data, setData] = useState(props.definition.data);
	const [errors, setErrors] = useState<any>(null);

	const handleAdd = () => {
		if (errors && errors.length > 0) {
			for (const error of errors) {
				toast("Error: " + error.message);
			}

			return;
		}

		props.onValidate(props.definition, data);
	};

	useEffect(() => {
		if (props.data) {
			setData(props.data);
		} else {
			setData(props.definition.data);
		}
	}, []);

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
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant={"ghost"}
					className={
						props.data?.title === "New Datasource"
							? "animate-pulse"
							: ""
					}
					style={
						props.data?.title === "New Datasource"
							? {
									animation:
										"pulse-bg 0.7s infinite, pulse-scale 0.7s infinite",
									boxShadow: "0 0 0 0 hsl(var(--primary))",
								}
							: {}
					}
				>
					<ContextMenu>
						<ContextMenuTrigger>
							<div className="flex gap-1 content-center ">
								<CloudCogIcon />
								<p>{props.data!.title!}</p>
							</div>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuItem>
								<Button
									variant={"destructive"}
									onClick={() => {
										props.onRemove(data.id);
									}}
								>
									Remove
									<XIcon />
								</Button>
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				</Button>
			</DialogTrigger>
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
							setErrors(errors);
						}}
					/>
					<div className="flex justify-between items-center mt-1.5">
						{/* Save to Templates Button - only show if datasource is configured */}
						{props.data &&
							props.data.title !== "New Datasource" && (
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

						<DialogClose className="ml-auto" asChild>
							<Button
								onClick={() => {
									handleAdd();
								}}
							>
								<CheckIcon />
							</Button>
						</DialogClose>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default DatasourceCard;

"use client";

import React, { useMemo } from "react";
import { useAtomValue } from "jotai";
import { withJsonFormsControlProps } from "@jsonforms/react";
import {
	ControlProps,
	and,
	isControl,
	rankWith,
	schemaMatches,
} from "@jsonforms/core";
import { PuzzleIcon } from "lucide-react";
import {
	PluginsHooks,
	PluginsManager,
	usePluginsManager,
} from "@workspace/ormi-plugins";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import {
	buildDatasourceSelectOptions,
	DATASOURCE_SELECT_AUTO_VALUE,
	readDatasourceSelectMarker,
	type DatasourceSelectOption,
} from "@workspace/utils";
import { datasourcesAtom } from "../dashboard/atoms";
import { appStore } from "../store";
import type {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../datasources/datasource-interface";

/**
 * Radix `Select` reserves the empty string for "no selection" and throws on
 * an item whose value is `""`, so the automatic option travels under this
 * token inside the control and is stored as `""`.
 */
const AUTO_ITEM_VALUE = "__ormi_datasource_auto__";

/**
 * Resolve datasource definition ids to their display names.
 *
 * @param pluginsManager - Live plugins manager.
 * @returns A lookup from definition id to name.
 */
function useDatasourceTypeNames(
	pluginsManager: PluginsManager | undefined,
): (definitionId: string) => string | undefined {
	return useMemo(() => {
		const names = new Map<string, string>();
		const definitions =
			pluginsManager?.applyFilter<
				DatasourceDefinition<DatasourceProviderSettings>[]
			>(PluginsHooks.DATASOURCES_LIST, []) ?? [];
		for (const definition of definitions) {
			if (definition?.id) names.set(definition.id, definition.name);
		}
		return (definitionId: string) => names.get(definitionId);
	}, [pluginsManager]);
}

/**
 * One option row: the datasource title, then its type in muted text. A
 * stored id that no longer resolves gets the unsupported-configuration
 * vocabulary (muted puzzle icon), never error vocabulary.
 *
 * @param props - The option to render.
 * @returns React element.
 */
const OptionLabel = ({ option }: { option: DatasourceSelectOption }) => (
	<span className="flex min-w-0 items-center gap-2">
		{(option.kind === "missing" || option.kind === "incompatible") && (
			<PuzzleIcon
				className="text-muted-foreground size-4 shrink-0"
				aria-hidden
			/>
		)}
		<span
			className={cn(
				"truncate",
				option.kind !== "configured" &&
					option.kind !== "auto" &&
					"text-muted-foreground",
			)}
		>
			{option.label}
		</span>
		{option.typeName && (
			<span className="text-muted-foreground shrink-0 text-xs">
				{option.typeName}
			</span>
		)}
	</span>
);

/**
 * JSON Forms control for a settings property holding a datasource instance
 * id, selected by the `datasourceSelect` schema marker
 * (`datasourceSelectProperty` in `@workspace/utils`).
 *
 * The list is read from the dashboard's configured datasources **at render
 * time**, so it is always the live one: the config dialog renders inside the
 * dashboard providers, whereas a list baked into the schema by the registry
 * is resolved before those providers exist. The stored value is the instance
 * id, as before. A stored id that matches no configured datasource of an
 * accepted type is kept, selected and named ("Missing datasource (<id>)"):
 * the operator decides what to do with it, the dialog never clears it.
 *
 * @param props - JSON Forms control props.
 * @returns React element, or `null` when the control is hidden.
 */
export const DatasourceSelectControl = (props: ControlProps) => {
	const {
		id,
		data,
		handleChange,
		path,
		label,
		description,
		required,
		enabled,
		visible,
		errors,
		schema,
	} = props;

	const marker = readDatasourceSelectMarker(schema) ?? {};
	const datasources = useAtomValue(datasourcesAtom, { store: appStore });
	const pluginsManager = usePluginsManager() as PluginsManager | undefined;
	const typeName = useDatasourceTypeNames(pluginsManager);

	const { options, configuredCount } = buildDatasourceSelectOptions(
		datasources.values(),
		marker,
		data,
		typeName,
	);

	if (!visible) return null;

	const stored = typeof data === "string" ? data : "";
	const selected =
		stored === DATASOURCE_SELECT_AUTO_VALUE
			? marker.autoLabel
				? AUTO_ITEM_VALUE
				: ""
			: stored;
	const hasError = errors.length > 0;
	// Rendered into the trigger directly rather than left to Radix, which
	// only learns an item's text once the (portalled) list has mounted.
	const selectedOption =
		selected === ""
			? undefined
			: options.find((option) =>
					selected === AUTO_ITEM_VALUE
						? option.kind === "auto"
						: option.kind !== "auto" && option.value === selected,
				);

	return (
		<div
			className="grid grid-cols-[10dvw_1fr] items-center gap-4"
			data-datasource-select=""
		>
			<Label
				htmlFor={id}
				className={cn(
					"text-sm leading-none font-medium",
					required && "after:text-destructive after:content-['*']",
				)}
			>
				{label}
			</Label>
			<Select
				value={selected}
				disabled={!enabled}
				onValueChange={(value) =>
					handleChange(
						path,
						value === AUTO_ITEM_VALUE
							? DATASOURCE_SELECT_AUTO_VALUE
							: value,
					)
				}
			>
				<SelectTrigger
					id={id}
					className={cn("w-full", hasError && "border-destructive")}
				>
					<SelectValue placeholder="Select datasource">
						{selectedOption && (
							<OptionLabel option={selectedOption} />
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem
							key={option.kind + option.value}
							value={
								option.kind === "auto"
									? AUTO_ITEM_VALUE
									: option.value
							}
						>
							<OptionLabel option={option} />
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{configuredCount === 0 && (
				<p className="text-muted-foreground col-start-2 text-sm">
					No matching datasource in this workspace.
				</p>
			)}
			{description && (
				<p className="text-muted-foreground col-start-2 text-sm">
					{description}
				</p>
			)}
			{hasError && (
				<p className="text-destructive col-start-2 text-sm">{errors}</p>
			)}
		</div>
	);
};

/**
 * Tester: any control whose resolved schema carries the `datasourceSelect`
 * marker, at any depth (array item details resolve against the item schema),
 * ranked above the generic string and enum controls.
 */
export const datasourceSelectTester = rankWith(
	10,
	and(
		isControl,
		schemaMatches(
			(schema) => readDatasourceSelectMarker(schema) !== undefined,
		),
	),
);

export default withJsonFormsControlProps(DatasourceSelectControl);

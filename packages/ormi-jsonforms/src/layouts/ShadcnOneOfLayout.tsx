"use client";
import React, { useState, useMemo, useEffect } from "react";
import isEmpty from "lodash/isEmpty";
import {
	CombinatorRendererProps,
	createCombinatorRenderInfos,
	createDefaultValue,
	isOneOfControl,
	JsonSchema,
	RankedTester,
	rankWith,
	CombinatorSubSchemaRenderInfo,
} from "@jsonforms/core";
import { withJsonFormsOneOfProps } from "@jsonforms/react";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs";
import { JsonFormsDispatch } from "@jsonforms/react";

export const shadcnOneOfTester: RankedTester = rankWith(4, isOneOfControl);

export const ShadcnOneOfLayoutRenderer = ({
	handleChange,
	schema,
	path,
	renderers,
	cells,
	rootSchema,
	id,
	visible,
	enabled,
	indexOfFittingSchema,
	uischema,
	uischemas,
	data,
}: CombinatorRendererProps) => {
	const [selectedIndex, setSelectedIndex] = useState(
		indexOfFittingSchema || 0,
	);

	const oneOf = (schema as JsonSchema).oneOf;
	const renderInfos = useMemo(
		() =>
			createCombinatorRenderInfos(
				oneOf || [],
				rootSchema,
				"oneOf",
				uischema,
				path,
				uischemas || [],
			),
		[oneOf, rootSchema, uischema, path, uischemas],
	);

	// Sync with external data changes
	useEffect(() => {
		if (
			indexOfFittingSchema !== undefined &&
			indexOfFittingSchema !== selectedIndex
		) {
			setSelectedIndex(indexOfFittingSchema);
		}
	}, [indexOfFittingSchema]);

	const handleSelectionChange = (value: string) => {
		const index = parseInt(value, 10);
		setSelectedIndex(index);

		// Create default value for the selected schema like the Material renderer does
		if (handleChange && path && renderInfos[index]) {
			const defaultValue = createDefaultValue(
				renderInfos[index].schema,
				rootSchema,
			);
			handleChange(path, defaultValue);
		}
	};

	// Safety check for oneOf existence
	if (!oneOf || !Array.isArray(oneOf) || oneOf.length === 0) {
		console.warn(
			"ShadcnOneOfLayoutRenderer: No oneOf schemas found:",
			oneOf,
		);
		return (
			<div className="p-4 text-muted-foreground">
				No options available
			</div>
		);
	}

	// Safety check for valid selection
	if (
		selectedIndex >= oneOf.length ||
		selectedIndex < 0 ||
		!renderInfos ||
		renderInfos.length === 0
	) {
		console.warn(
			"ShadcnOneOfLayoutRenderer: Invalid selectedIndex or empty renderInfos:",
			selectedIndex,
			renderInfos,
			"oneOf length:",
			oneOf.length,
		);
		return (
			<div className="p-4 text-muted-foreground">
				Invalid selection or no options available
			</div>
		);
	}

	return (
		<div className="w-full">
			<Tabs
				value={selectedIndex.toString()}
				onValueChange={handleSelectionChange}
				className="w-full"
			>
				<TabsList
					className="grid w-full"
					style={{
						gridTemplateColumns: `repeat(${renderInfos.length}, minmax(0, 1fr))`,
					}}
				>
					{renderInfos.map((renderInfo, index) => (
						<TabsTrigger
							key={index}
							value={index.toString()}
							disabled={!enabled}
						>
							{renderInfo.label || `Option ${index + 1}`}
						</TabsTrigger>
					))}
				</TabsList>
				{renderInfos.map((renderInfo, index) => (
					<TabsContent
						key={index}
						value={index.toString()}
						className="mt-4"
					>
						<JsonFormsDispatch
							schema={oneOf[index]}
							uischema={renderInfo.uischema}
							path={path}
							renderers={renderers}
							cells={cells}
						/>
					</TabsContent>
				))}
			</Tabs>
		</div>
	);
};

export default withJsonFormsOneOfProps(ShadcnOneOfLayoutRenderer);

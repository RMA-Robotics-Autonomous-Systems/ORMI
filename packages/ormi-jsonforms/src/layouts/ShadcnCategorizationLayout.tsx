"use client";
/*
  The MIT License

  Copyright (c) 2017-2019 EclipseSource Munich
  https://github.com/eclipsesource/jsonforms

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
import React, { useState, useMemo } from "react";
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from "@workspace/ui/components/tabs";
import {
	and,
	Categorization,
	Category,
	deriveLabelForUISchemaElement,
	isVisible,
	RankedTester,
	rankWith,
	StatePropsOfLayout,
	Tester,
	UISchemaElement,
	uiTypeIs,
} from "@jsonforms/core";
import {
	TranslateProps,
	withJsonFormsLayoutProps,
	withTranslateProps,
} from "@jsonforms/react";
import {
	AjvProps,
	ShadcnLayoutRenderer,
	shadcnLayoutRendererProps,
	withAjvProps,
} from "../utils/layouts";

export const isSingleLevelCategorization: Tester = and(
	uiTypeIs("Categorization"),
	(uischema: UISchemaElement): boolean => {
		const categorization = uischema as Categorization;

		return (
			categorization.elements &&
			categorization.elements.reduce(
				(acc, e) => acc && e.type === "Category",
				true,
			)
		);
	},
);

export const shadcnCategorizationTester: RankedTester = rankWith(
	2,
	isSingleLevelCategorization,
);
export interface CategorizationState {
	activeCategory: number;
}

export interface ShadcnCategorizationLayoutRendererProps
	extends StatePropsOfLayout, AjvProps, TranslateProps {
	selected?: number;
	ownState?: boolean;
	data?: any;
	onChange?(selected: number, prevSelected: number): void;
}

export const ShadcnCategorizationLayoutRenderer = (
	props: ShadcnCategorizationLayoutRendererProps,
) => {
	const {
		data,
		path,
		renderers,
		cells,
		schema,
		uischema,
		visible,
		enabled,
		selected,
		onChange,
		ajv,
		t,
		config,
	} = props;
	const categorization = uischema as Categorization;
	const [previousCategorization, setPreviousCategorization] =
		useState<Categorization>(uischema as Categorization);
	const [activeCategory, setActiveCategory] = useState<number>(selected ?? 0);
	const categories = useMemo(
		() =>
			categorization.elements.filter(
				(category: Categorization | Category) =>
					isVisible(category, data, "", ajv, config),
			),
		[categorization, data, ajv],
	);

	if (categorization !== previousCategorization) {
		setActiveCategory(0);
		setPreviousCategorization(categorization);
	}

	const safeCategory =
		activeCategory >= categorization.elements.length ? 0 : activeCategory;

	const childProps: shadcnLayoutRendererProps = {
		elements: categories[safeCategory]
			? categories[safeCategory].elements
			: [],
		schema,
		path,
		direction: "column",
		enabled,
		visible,
		renderers,
		cells,
	};
	const onTabChange = (value: string) => {
		const numericValue = parseInt(value, 10);
		if (onChange) {
			onChange(numericValue, safeCategory);
		}
		setActiveCategory(numericValue);
	};

	const tabLabels = useMemo(() => {
		return categories.map((e) =>
			e.type === "Category"
				? deriveLabelForUISchemaElement(e as Category, t)
				: undefined,
		);
	}, [categories, t]);

	if (!visible) {
		return null;
	}

	return (
		<Tabs value={safeCategory.toString()} onValueChange={onTabChange}>
			<TabsList className="w-full">
				{categories.map((_, idx: number) => (
					<TabsTrigger key={idx} value={idx.toString()}>
						{tabLabels[idx]}
					</TabsTrigger>
				))}
			</TabsList>
			<TabsContent value={safeCategory.toString()} className="mt-2">
				<ShadcnLayoutRenderer {...childProps} key={safeCategory} />
			</TabsContent>
		</Tabs>
	);
};

export default withAjvProps(
	withTranslateProps(
		withJsonFormsLayoutProps(ShadcnCategorizationLayoutRenderer),
	),
);

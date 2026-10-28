"use client";
import React, { useEffect, useRef, useState } from "react";
import { Widget } from "../widgets/widget-interface";
import { Datasource } from "../datasources";

import {
	Template,
	WidgetTemplate,
	DatasourceTemplate,
	TemplateType,
} from "./templates-types";
import { createSafeContext } from "@workspace/utils";
import { startTemplatesLoad } from "./load-templates";

/** Templates provider context value. */
interface TemplatesProviderContextInterface {
	templates: Map<string, Template>;
	addTemplate: (template: Template, key?: string) => void;
	removeTemplate: (id: string) => void;
	updateTemplate: (id: string, updatedTemplate: Template) => void;
	getTemplatesByType: (type: TemplateType) => Map<string, Template>;
	getWidgetTemplates: () => Map<string, WidgetTemplate>;
	getDatasourceTemplates: () => Map<string, DatasourceTemplate>;
}

/** Templates provider React context. */
const [TemplatesProviderContextProvider, useTemplatesContext] =
	createSafeContext<TemplatesProviderContextInterface>("Templates");

/** Props for TemplatesProvider. */
interface TemplatesProviderProps {
	children: React.ReactNode;

	addTemplate: (template: Template) => Promise<string>;
	removeTemplate: (template_id: string) => Promise<boolean>;
	updateTemplate: (
		template_id: string,
		updatedTemplate: Template,
	) => Promise<boolean>; // Add this
	onLoad: () => Promise<Map<string, Template>>;
}

/**
 * Templates provider with persistence hooks.
 * @param props - Component props.
 * @returns React element.
 */
const TemplatesProvider = (props: TemplatesProviderProps) => {
	const [templates, setTemplates] = useState<Map<string, Template>>(
		new Map<string, Template>(),
	);

	const addTemplate = async (template: Template, key?: string) => {
		const template_id = await props.addTemplate(template);

		if (!template_id) {
			console.error("Failed to save template");
			return;
		}

		// Functional updates throughout: the persistence call is awaited, and
		// the initial load may land in the meantime.
		setTemplates((prev) => new Map(prev).set(template_id, template));
	};

	const removeTemplate = async (id: string) => {
		if (!templates.has(id)) {
			throw new Error("Key does not exist");
		}

		if (!(await props.removeTemplate(id))) {
			console.error("Failed to remove template");
			return;
		}

		setTemplates((prev) => {
			const next = new Map(prev);
			next.delete(id);
			return next;
		});
	};

	const updateTemplate = async (id: string, updatedTemplate: Template) => {
		if (!templates.has(id)) {
			throw new Error("Template does not exist");
		}

		if (!(await props.updateTemplate(id, updatedTemplate))) {
			console.error("Failed to update template");
			return;
		}

		setTemplates((prev) => new Map(prev).set(id, updatedTemplate));
	};

	const getTemplatesByType = (type: TemplateType): Map<string, Template> => {
		const filteredTemplates = new Map<string, Template>();
		templates.forEach((template, id) => {
			if (template.type === type) {
				filteredTemplates.set(id, template);
			}
		});
		return filteredTemplates;
	};

	const getWidgetTemplates = (): Map<string, WidgetTemplate> => {
		const widgetTemplates = new Map<string, WidgetTemplate>();
		templates.forEach((template, id) => {
			if (template.type === "widget") {
				widgetTemplates.set(id, template as WidgetTemplate);
			}
		});
		return widgetTemplates;
	};

	const getDatasourceTemplates = (): Map<string, DatasourceTemplate> => {
		const datasourceTemplates = new Map<string, DatasourceTemplate>();
		templates.forEach((template, id) => {
			if (template.type === "datasource") {
				datasourceTemplates.set(id, template as DatasourceTemplate);
			}
		});
		return datasourceTemplates;
	};

	// Load once per mount. `onLoad` is read through a ref: callers pass an
	// inline callback, so keying the effect on it (or on `props`) refetched on
	// every parent render.
	const onLoadRef = useRef(props.onLoad);
	useEffect(() => {
		onLoadRef.current = props.onLoad;
	});
	useEffect(() => startTemplatesLoad(onLoadRef.current, setTemplates), []);

	return (
		<TemplatesProviderContextProvider
			value={{
				templates,
				addTemplate,
				removeTemplate,
				updateTemplate,
				getTemplatesByType,
				getWidgetTemplates,
				getDatasourceTemplates,
			}}
		>
			{props.children}
		</TemplatesProviderContextProvider>
	);
};

/**
 * Access templates context.
 * @returns Templates context value.
 */
const useTemplates = () => {
	return useTemplatesContext();
};

export { TemplatesProvider, useTemplates };

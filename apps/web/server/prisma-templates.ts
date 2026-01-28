/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
	Template,
	WidgetTemplate,
	DatasourceTemplate,
} from "@workspace/ormi-core/templates";

const handleSave = async (template: Template): Promise<string> => {
	try {
		const response = await fetch(`/api/templates/`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ content: template }),
		});

		if (!response.ok) {
			throw new Error(`Error saving template: ${response.statusText}`);
		}

		const templateId = await response.text();
		// Remove quotes if present (JSON.stringify adds quotes to strings)
		return templateId.replace(/"/g, "");
	} catch (error) {
		console.error("Failed to save template:", error);
		return "";
	}
};

const handleDelete = async (templateId: string): Promise<boolean> => {
	try {
		const response = await fetch(`/api/templates/${templateId}`, {
			method: "DELETE",
		});

		if (!response.ok) {
			throw new Error(`Error deleting template: ${response.statusText}`);
		}

		return true;
	} catch (error) {
		console.error("Failed to delete template:", error);
		return false;
	}
};

const handleLoad = async (): Promise<Map<string, Template>> => {
	try {
		const response = await fetch(`/api/templates`);

		if (!response.ok) {
			throw new Error(`Error loading templates: ${response.statusText}`);
		}

		const data = (await response.json()) as any;

		const templates = new Map<string, Template>();

		data.forEach((template: any) => {
			const templateType = template.type?.toLowerCase() || "widget";

			if (templateType === "widget") {
				templates.set(template.id.toString(), {
					name: template.name,
					type: "widget",
					widget: template.widget || template.content?.widget,
					public: template.public,
					tags: template.tags,
					yours: template.yours,
				} as WidgetTemplate);
			} else if (templateType === "datasource") {
				templates.set(template.id.toString(), {
					name: template.name,
					type: "datasource",
					datasource:
						template.datasource || template.content?.datasource,
					public: template.public,
					tags: template.tags,
					yours: template.yours,
				} as DatasourceTemplate);
			}
		});

		return templates;
	} catch (error) {
		console.error("Failed to load templates:", error);
		return new Map<string, Template>();
	}
};

export const handleUpdate = async (
	templateId: string,
	updatedTemplate: Template,
): Promise<boolean> => {
	try {
		const updateData: any = {
			name: updatedTemplate.name,
			public: updatedTemplate.public,
			tags: updatedTemplate.tags,
		};

		// Add type-specific data
		if (updatedTemplate.type === "widget") {
			updateData.widget = (updatedTemplate as WidgetTemplate).widget;
		} else if (updatedTemplate.type === "datasource") {
			updateData.datasource = (
				updatedTemplate as DatasourceTemplate
			).datasource;
		}

		const response = await fetch(`/api/templates/${templateId}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(updateData),
		});

		if (!response.ok) {
			console.error("Failed to update template:", response.statusText);
			return false;
		}

		return true;
	} catch (error) {
		console.error("Error updating template:", error);
		return false;
	}
};

export { handleSave, handleDelete, handleLoad };

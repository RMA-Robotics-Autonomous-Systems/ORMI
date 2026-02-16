"use client";

import { templateApi } from "../api/template-api";
import { Template } from "@workspace/ormi-core/templates";

const handleSave = async (template: Template): Promise<string> => {
	const result = await templateApi.save(template);

	if (!result.ok) {
		console.error("Failed to save template:", result.error);
		return "";
	}

	return result.data;
};

const handleDelete = async (templateId: string): Promise<boolean> => {
	const result = await templateApi.delete(templateId);

	if (!result.ok) {
		console.error("Failed to delete template:", result.error);
		return false;
	}

	return true;
};

const handleLoad = async (): Promise<Map<string, Template>> => {
	const result = await templateApi.getAll();

	if (!result.ok) {
		console.error("Failed to load templates:", result.error);
		return new Map<string, Template>();
	}

	return result.data;
};

/**
 * Handles template update operations.
 * @param templateId - Template ID to update.
 * @param updatedTemplate - Updated template data.
 * @returns True if update succeeded, false otherwise.
 */
export const handleUpdate = async (
	templateId: string,
	updatedTemplate: Template,
): Promise<boolean> => {
	const result = await templateApi.update(templateId, updatedTemplate);

	if (!result.ok) {
		console.error("Failed to update template:", result.error);
		return false;
	}

	return true;
};

export { handleSave, handleDelete, handleLoad };

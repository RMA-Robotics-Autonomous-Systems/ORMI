import { httpClient } from "../http/client";
import type { ApiResult } from "../http/client";
import {
	Template,
	WidgetTemplate,
	DatasourceTemplate,
} from "@workspace/ormi-core/templates";

/**
 * Template API response shape
 */
interface TemplateResponse {
	id: string;
	name: string;
	type: string;
	content?: {
		widget?: unknown;
		datasource?: unknown;
	};
	widget?: unknown;
	datasource?: unknown;
	public: boolean;
	tags: string[];
	yours: boolean;
}

/**
 * Template API client
 */
export const templateApi = {
	/**
	 * Get all templates
	 */
	async getAll(): Promise<ApiResult<Map<string, Template>>> {
		const result =
			await httpClient.get<TemplateResponse[]>("/api/templates");

		if (!result.ok) {
			return result;
		}

		const templates = new Map<string, Template>();

		result.data.forEach((template) => {
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

		return { ok: true, data: templates };
	},

	/**
	 * Create/save template
	 */
	async save(template: Template): Promise<ApiResult<string>> {
		const result = await httpClient.post<string>("/api/templates", {
			content: template,
		});

		if (!result.ok) {
			return result;
		}

		// Handle response as plain text (template ID)
		return { ok: true, data: String(result.data) };
	},

	/**
	 * Update template
	 */
	async update(
		templateId: string,
		template: Template,
	): Promise<ApiResult<void>> {
		return httpClient.put<void>(`/api/templates/${templateId}`, {
			content: template,
		});
	},

	/**
	 * Delete template
	 */
	async delete(templateId: string): Promise<ApiResult<void>> {
		return httpClient.delete<void>(`/api/templates/${templateId}`);
	},
};

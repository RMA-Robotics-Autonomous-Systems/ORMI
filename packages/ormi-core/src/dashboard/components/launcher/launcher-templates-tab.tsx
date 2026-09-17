"use client";

import React from "react";

import { WidgetTemplateBrowser } from "../../../templates/components/templates-browser";
import { useTemplates } from "../../../templates/templates-provider";
import { useDashboardActions } from "../../state/use-dashboard-actions";
import { useDashboardRegistry } from "../../shell/dashboard-shell";

/**
 * Saved widget and datasource templates.
 *
 * The content the navbar `Templates` drawer used to hold, wired to the same
 * provider and the same dashboard actions. The drawer is gone: two surfaces
 * showing the same list is the duplication the launcher exists to end.
 *
 * @returns React element.
 */
export const LauncherTemplatesTab: React.FC = () => {
	const { templates, removeTemplate, updateTemplate } = useTemplates();
	const { addWidget, addDatasource } = useDashboardActions();
	const { widgetDefinitions, datasourceDefinitions } = useDashboardRegistry();

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<WidgetTemplateBrowser
				templates={templates}
				addWidget={addWidget}
				addDatasource={addDatasource}
				removeTemplate={removeTemplate}
				updateTemplate={updateTemplate}
				widgetDefinitions={widgetDefinitions}
				datasourceDefinitions={datasourceDefinitions}
			/>
		</div>
	);
};

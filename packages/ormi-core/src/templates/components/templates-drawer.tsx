"use client";

import React, { useState, useMemo } from "react";
import { TemplateComponent } from "./template";
import { DatasourceTemplateComponent } from "./datasource-template";
import {
	Template,
	WidgetTemplate,
	DatasourceTemplate,
} from "../templates-types";
import {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
} from "@workspace/ui/components/accordion";
import { Button } from "@workspace/ui/components/button";
import {
	Sheet,
	SheetTrigger,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@workspace/ui/components/sheet";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs";
import { X } from "lucide-react";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";

import { WidgetDefinition } from "../../widgets";
import {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../../datasources";

/** Props for WidgetTemplateDrawer. */
interface WidgetTemplateDrawerProps {
	templates: Map<string, Template>;
	removeTemplate: (id: string) => void;
	addWidget: (widget: WidgetDefinition, settings: object) => void;
	addDatasource?: (
		datasource_id: string,
		settings: DatasourceProviderSettings,
	) => void;
	updateTemplate?: (id: string, updatedTemplate: Template) => void;
}

/**
 * Drawer UI for browsing and applying templates.
 * @param props - Component props.
 * @returns React element.
 */
export function WidgetTemplateDrawer(props: WidgetTemplateDrawerProps) {
	const {
		templates,
		removeTemplate,
		addWidget,
		addDatasource,
		updateTemplate,
	} = props;
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);

	const pluginsManager = usePluginsManager();

	// Pre-fetch available widgets and datasources once at component level
	const availableWidgets = pluginsManager.applyFilter<WidgetDefinition[]>(
		PluginsHooks.WIDGETS_LIST,
		[],
	);
	const availableDatasources = pluginsManager.applyFilter<
		DatasourceDefinition[]
	>(PluginsHooks.DATASOURCES_LIST, []);

	// Get all unique tags from templates
	const allTags = useMemo(() => {
		const tags = new Set<string>();
		Array.from(templates.values()).forEach((template) => {
			template.tags?.forEach((tag) => tags.add(tag));
		});
		return Array.from(tags).sort();
	}, [templates]);

	// Filter templates based on search and tags
	const filteredTemplates = useMemo(() => {
		return Array.from(templates.entries()).filter(([key, template]) => {
			// Search filter
			const matchesSearch =
				searchQuery === "" ||
				template.name.toLowerCase().includes(searchQuery.toLowerCase());

			// Tag filter
			const matchesTags =
				selectedTags.length === 0 ||
				selectedTags.every((tag) => template.tags?.includes(tag));

			return matchesSearch && matchesTags;
		});
	}, [templates, searchQuery, selectedTags]);

	// Split filtered templates by type and ownership
	const yourWidgetTemplates = filteredTemplates
		.filter(
			([key, template]) => template.type === "widget" && template.yours,
		)
		.reduce((acc, [key, template]) => {
			acc.set(key, template as WidgetTemplate);
			return acc;
		}, new Map<string, WidgetTemplate>());

	const publicWidgetTemplates = filteredTemplates
		.filter(
			([key, template]) => template.type === "widget" && !template.yours,
		)
		.reduce((acc, [key, template]) => {
			acc.set(key, template as WidgetTemplate);
			return acc;
		}, new Map<string, WidgetTemplate>());

	const yourDatasourceTemplates = filteredTemplates
		.filter(
			([key, template]) =>
				template.type === "datasource" && template.yours,
		)
		.reduce((acc, [key, template]) => {
			acc.set(key, template as DatasourceTemplate);
			return acc;
		}, new Map<string, DatasourceTemplate>());

	const publicDatasourceTemplates = filteredTemplates
		.filter(
			([key, template]) =>
				template.type === "datasource" && !template.yours,
		)
		.reduce((acc, [key, template]) => {
			acc.set(key, template as DatasourceTemplate);
			return acc;
		}, new Map<string, DatasourceTemplate>());

	const handleTagToggle = (tag: string) => {
		setSelectedTags((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
		);
	};

	const clearFilters = () => {
		setSearchQuery("");
		setSelectedTags([]);
	};

	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button variant={"ghost"}>Templates</Button>
			</SheetTrigger>
			<SheetContent className="w-[50%] min-w-[300px]">
				<SheetHeader>
					<SheetTitle>Saved widgets</SheetTitle>
					<SheetDescription>
						List of available widgets templates
					</SheetDescription>
				</SheetHeader>
				<div className="p-4 space-y-4">
					{/* Search Box */}
					<div className="space-y-2">
						<Input
							placeholder="Search templates..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>

					{/* Tag Filter */}
					{allTags.length > 0 && (
						<div className="space-y-2">
							<div className="text-sm font-medium">
								Filter by tags:
							</div>
							<div className="flex flex-wrap gap-2">
								{allTags.map((tag) => (
									<Badge
										key={tag}
										variant={
											selectedTags.includes(tag)
												? "default"
												: "outline"
										}
										className="cursor-pointer"
										onClick={() => handleTagToggle(tag)}
									>
										{tag}
									</Badge>
								))}
							</div>
						</div>
					)}

					{/* Clear Filters */}
					{(searchQuery || selectedTags.length > 0) && (
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={clearFilters}
							>
								<X className="h-4 w-4 mr-1" />
								Clear filters
							</Button>
							<span className="text-sm text-muted-foreground">
								{filteredTemplates.length} template(s) found
							</span>
						</div>
					)}

					<Tabs defaultValue="widgets" className="w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="widgets">Widgets</TabsTrigger>
							<TabsTrigger value="datasources">
								Datasources
							</TabsTrigger>
						</TabsList>

						<TabsContent value="widgets">
							<Accordion
								type="single"
								defaultValue="user-widgets"
								collapsible
							>
								<AccordionItem value="user-widgets">
									<AccordionTrigger>
										Your widget templates (
										{yourWidgetTemplates.size})
									</AccordionTrigger>
									<AccordionContent>
										{yourWidgetTemplates.size === 0 ? (
											<p className="text-sm text-muted-foreground">
												No widget templates found
											</p>
										) : (
											Array.from(
												yourWidgetTemplates.entries(),
											).map(([key, template]) => (
												<TemplateComponent
													key={key}
													templateId={key}
													availableWidgets={
														availableWidgets
													}
													template={template}
													removeTemplate={
														removeTemplate
													}
													addWidget={addWidget}
													updateTemplate={
														updateTemplate
													}
												/>
											))
										)}
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="public-widgets">
									<AccordionTrigger>
										Public widget templates (
										{publicWidgetTemplates.size})
									</AccordionTrigger>
									<AccordionContent>
										{publicWidgetTemplates.size === 0 ? (
											<p className="text-sm text-muted-foreground">
												No public widget templates found
											</p>
										) : (
											Array.from(
												publicWidgetTemplates.entries(),
											).map(([key, template]) => (
												<TemplateComponent
													key={key}
													templateId={key}
													availableWidgets={
														availableWidgets
													}
													template={template}
													removeTemplate={
														removeTemplate
													}
													addWidget={addWidget}
													updateTemplate={
														updateTemplate
													}
												/>
											))
										)}
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</TabsContent>

						<TabsContent value="datasources">
							<Accordion
								type="single"
								defaultValue="user-datasources"
								collapsible
							>
								<AccordionItem value="user-datasources">
									<AccordionTrigger>
										Your datasource templates (
										{yourDatasourceTemplates.size})
									</AccordionTrigger>
									<AccordionContent>
										{yourDatasourceTemplates.size === 0 ? (
											<p className="text-sm text-muted-foreground">
												No datasource templates found
											</p>
										) : (
											Array.from(
												yourDatasourceTemplates.entries(),
											).map(([key, template]) => (
												<DatasourceTemplateComponent
													key={key}
													templateId={key}
													availableDatasources={
														availableDatasources
													}
													template={template}
													removeTemplate={
														removeTemplate
													}
													addDatasource={
														addDatasource ||
														(() => {})
													}
													updateTemplate={
														updateTemplate
													}
												/>
											))
										)}
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="public-datasources">
									<AccordionTrigger>
										Public datasource templates (
										{publicDatasourceTemplates.size})
									</AccordionTrigger>
									<AccordionContent>
										{publicDatasourceTemplates.size ===
										0 ? (
											<p className="text-sm text-muted-foreground">
												No public datasource templates
												found
											</p>
										) : (
											Array.from(
												publicDatasourceTemplates.entries(),
											).map(([key, template]) => (
												<DatasourceTemplateComponent
													key={key}
													templateId={key}
													availableDatasources={
														availableDatasources
													}
													template={template}
													removeTemplate={
														removeTemplate
													}
													addDatasource={
														addDatasource ||
														(() => {})
													}
													updateTemplate={
														updateTemplate
													}
												/>
											))
										)}
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						</TabsContent>
					</Tabs>
				</div>
			</SheetContent>
		</Sheet>
	);
}

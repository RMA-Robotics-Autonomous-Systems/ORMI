"use client";

import React, { useState } from "react";
import { DatasourceTemplate } from "../templates-types";
import {
	DatasourceDefinition,
	DatasourceProviderSettings,
} from "../../datasources";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogFooter,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { ActionDialog } from "@workspace/ui/combined/ActionDialog";
import {
	PlusIcon,
	SettingsIcon,
	TrashIcon,
	CheckIcon,
	XIcon,
} from "lucide-react";
import { toast } from "sonner";

interface DatasourceTemplateProps {
	template: DatasourceTemplate;
	templateId: string;
	removeTemplate: (id: string) => void;
	addDatasource: (
		datasource_id: string,
		settings: DatasourceProviderSettings,
	) => void;
	availableDatasources: DatasourceDefinition[];
	updateTemplate?: (id: string, updatedTemplate: DatasourceTemplate) => void;
}

export const DatasourceTemplateComponent = (props: DatasourceTemplateProps) => {
	const { template, templateId, availableDatasources } = props;
	const [optionsOpen, setOptionsOpen] = useState(false);
	const [editedTemplate, setEditedTemplate] = useState<DatasourceTemplate>({
		...template,
	});
	const [newTag, setNewTag] = useState("");

	const handleSaveOptions = () => {
		if (props.updateTemplate) {
			props.updateTemplate(templateId, editedTemplate);
			toast("Datasource template updated successfully");
		}
		setOptionsOpen(false);
	};

	const addTag = () => {
		if (newTag.trim() && !editedTemplate.tags.includes(newTag.trim())) {
			setEditedTemplate((prev) => ({
				...prev,
				tags: [...prev.tags, newTag.trim()],
			}));
			setNewTag("");
		}
	};

	const removeTag = (tagToRemove: string) => {
		setEditedTemplate((prev) => ({
			...prev,
			tags: prev.tags.filter((tag) => tag !== tagToRemove),
		}));
	};

	return (
		<div
			key={templateId}
			className="flex items-center justify-between p-2 border-b border-gray-200"
		>
			<div className="flex gap-2">
				{template.name}
				{template.public && (
					<Badge variant="secondary" className="ml-2">
						Public
					</Badge>
				)}
			</div>
			<div className="flex gap-2">
				{template.yours && (
					<Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
						<DialogTrigger asChild>
							<Button variant="ghost" size="sm">
								<SettingsIcon className="h-4 w-4" />
							</Button>
						</DialogTrigger>
						<DialogContent className="max-w-md">
							<DialogHeader>
								<DialogTitle>
									Edit Datasource Template
								</DialogTitle>
							</DialogHeader>
							<div className="space-y-4">
								<div>
									<Label htmlFor="name">Name</Label>
									<Input
										id="name"
										value={editedTemplate.name}
										onChange={(e) =>
											setEditedTemplate((prev) => ({
												...prev,
												name: e.target.value,
											}))
										}
									/>
								</div>
								<div className="flex items-center space-x-2">
									<Switch
										id="public"
										checked={editedTemplate.public}
										onCheckedChange={(checked) =>
											setEditedTemplate((prev) => ({
												...prev,
												public: checked,
											}))
										}
									/>
									<Label htmlFor="public">Public</Label>
								</div>
								<div>
									<Label>Tags</Label>
									<div className="flex flex-wrap gap-1 mt-1">
										{editedTemplate.tags.map((tag) => (
											<Badge
												key={tag}
												variant="outline"
												className="cursor-pointer"
												onClick={() => removeTag(tag)}
											>
												{tag} ×
											</Badge>
										))}
									</div>
									<div className="flex gap-2 mt-2">
										<Input
											placeholder="Add tag"
											value={newTag}
											onChange={(e) =>
												setNewTag(e.target.value)
											}
											onKeyPress={(e) =>
												e.key === "Enter" && addTag()
											}
										/>
										<Button onClick={addTag}>Add</Button>
									</div>
								</div>
							</div>
							<DialogFooter>
								<Button onClick={handleSaveOptions}>
									Save Changes
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				)}

				{template.yours && (
					<ActionDialog
						title="Remove datasource template"
						message="Are you certain?"
						actions={[
							{
								title: <XIcon />,
								action: () => {},
							},
							{
								title: <CheckIcon />,
								action: () => props.removeTemplate(templateId),
							},
						]}
						trigger={
							<Button variant="destructive">
								<TrashIcon />
							</Button>
						}
					/>
				)}

				<Button
					variant="outline"
					onClick={() => {
						// Find the datasource definition
						const definition = availableDatasources.find(
							(d) => d.id === template.datasource.datasource_id,
						);
						if (!definition) {
							toast(
								"Datasource unavailable: " +
									template.datasource.datasource_id,
							);
							return;
						}

						props.addDatasource(
							definition.id,
							template.datasource.settings,
						);
					}}
				>
					<PlusIcon />
				</Button>
			</div>
		</div>
	);
};

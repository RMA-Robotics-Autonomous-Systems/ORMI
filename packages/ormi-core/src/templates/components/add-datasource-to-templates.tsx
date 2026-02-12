"use client";
import { BookTemplateIcon } from "lucide-react";

import { useState } from "react";
import { useTemplates } from "../templates-provider";
import { DatasourceTemplate } from "../templates-types";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@workspace/ui/components/dialog";
import { DatasourceDefinition, Datasource } from "../../datasources";

/**
 * Button to save a datasource configuration as a template.
 * @param props - Component props.
 * @returns React element.
 */
export function AddDatasourceToTemplatesBtn(props: {
	datasource: Datasource;
	definition: DatasourceDefinition;
	addTemplate: (template: DatasourceTemplate, key?: string) => void;
}) {
	const [open, setOpen] = useState(false);

	const handleSaveTemplate = () => {
		const template: DatasourceTemplate = {
			name: props.datasource.title || props.definition.name,
			type: "datasource",
			datasource: props.datasource,
			public: false,
			tags: [],
			yours: true,
		};

		props.addTemplate(template);
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost">
					Save to templates{" "}
					<BookTemplateIcon className="ml-2 h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Save Datasource to Templates</DialogTitle>
					<DialogDescription>
						Are you sure you want to save this datasource
						configuration to your templates?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button onClick={handleSaveTemplate}>Save</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

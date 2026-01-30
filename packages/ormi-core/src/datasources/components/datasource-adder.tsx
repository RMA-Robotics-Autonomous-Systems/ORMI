"use client";

import { useState } from "react";

import { PlusIcon } from "lucide-react";

import { DatasourceDefinition } from "../datasource-interface";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@workspace/ui/components/dialog";
import {
	PluginsHooks,
	PluginsManager,
	usePluginsManager,
} from "@workspace/ormi-plugins";

const DatasourceAdder = (props: {
	handleAdd: (datasource_id: string) => void;
}) => {
	const pluginsManager = usePluginsManager() as PluginsManager;
	const datasources_definitions = pluginsManager.applyFilter<
		DatasourceDefinition[]
	>(PluginsHooks.DATASOURCES_LIST, []);

	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<PlusIcon />
				</Button>
			</DialogTrigger>
			<DialogContent size="large" className="">
				<DialogHeader>
					<DialogTitle>Add new datasource</DialogTitle>
					<DialogDescription>
						Datasource configuration
					</DialogDescription>
				</DialogHeader>
				<div>
					<div className="flex gap-3">
						{datasources_definitions.map((datasource_def) => (
							<Button
								key={datasource_def.id}
								variant={"ghost"}
								onClick={() => {
									props.handleAdd(datasource_def.id);
									setOpen(false);
								}}
							>
								<PlusIcon />
								<p>{datasource_def.name}</p>
							</Button>
						))}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default DatasourceAdder;

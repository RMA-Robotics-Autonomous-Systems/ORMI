"use client";

import { ChevronDownIcon, PlusIcon } from "lucide-react";

import { DatasourceDefinition } from "../datasource-interface";
import { Button } from "@workspace/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
	PluginsHooks,
	PluginsManager,
	usePluginsManager,
} from "@workspace/ormi-plugins";

/** Props for {@link DatasourceAdder}. */
interface DatasourceAdderProps {
	/** Adds a datasource instance for the given definition id. */
	handleAdd: (datasource_id: string) => void;
	/**
	 * Whether this workspace already has a datasource.
	 *
	 * Decides which half of the dialog is the content and which is the action.
	 * With nothing configured, adding is the only thing to do and the catalogue
	 * is the page. With something configured, the operator came to look at or
	 * fix what they have, and a catalogue of every integration in the build
	 * out-weighing their own robots is the imbalance this flag exists to
	 * correct.
	 */
	hasDatasources?: boolean;
}

/**
 * Inline picker listing every datasource definition available in this build.
 *
 * Rendered inside the datasources dialog rather than behind its own dialog:
 * a nested dialog for a short list buries the choice and costs an extra
 * unlabelled trigger. Each entry shows the definition name and its
 * `description`, which is what distinguishes otherwise similarly named
 * integrations from one another.
 *
 * @param props - Component props.
 * @returns React element.
 */
const DatasourceAdder = (props: DatasourceAdderProps) => {
	const pluginsManager = usePluginsManager() as PluginsManager;
	const datasources_definitions = pluginsManager.applyFilter<
		DatasourceDefinition[]
	>(PluginsHooks.DATASOURCES_LIST, []);

	const collapsible = props.hasDatasources === true;

	const catalogue =
		datasources_definitions.length === 0 ? (
			<p className="text-muted-foreground text-sm">
				No datasource plugins are available in this build.
			</p>
		) : (
			<div className="grid gap-2 sm:grid-cols-2">
				{datasources_definitions.map((datasource_def) => (
					<Button
						key={datasource_def.id}
						variant="outline"
						aria-label={`Add ${datasource_def.name} datasource`}
						className="h-auto w-full justify-start gap-3 py-3 text-left whitespace-normal"
						onClick={() => props.handleAdd(datasource_def.id)}
					>
						<PlusIcon className="size-4 shrink-0" aria-hidden />
						<span className="flex min-w-0 flex-col gap-0.5">
							<span className="font-medium">
								{datasource_def.name}
							</span>
							{datasource_def.description ? (
								<span className="text-muted-foreground text-xs font-normal">
									{datasource_def.description}
								</span>
							) : null}
						</span>
					</Button>
				))}
			</div>
		);

	if (!collapsible) {
		return (
			<section
				aria-labelledby="datasource-adder-heading"
				className="flex flex-col gap-2"
			>
				<div>
					<h3
						id="datasource-adder-heading"
						className="text-sm font-medium"
					>
						Add a datasource
					</h3>
					<p className="text-muted-foreground text-xs">
						Pick the integration that matches the system you want to
						connect. You can configure it right after adding it.
					</p>
				</div>
				{catalogue}
			</section>
		);
	}

	return (
		<Collapsible className="flex flex-col gap-2">
			<CollapsibleTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="w-full justify-start gap-2 [&[data-state=open]>svg:last-child]:rotate-180"
				>
					<PlusIcon className="size-4 shrink-0" aria-hidden />
					Add another datasource
					<ChevronDownIcon
						className="ml-auto size-4 shrink-0 transition-transform"
						aria-hidden
					/>
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col gap-2">
				<p className="text-muted-foreground text-xs">
					Pick the integration that matches the system you want to
					connect. You can configure it right after adding it.
				</p>
				{catalogue}
			</CollapsibleContent>
		</Collapsible>
	);
};

export default DatasourceAdder;

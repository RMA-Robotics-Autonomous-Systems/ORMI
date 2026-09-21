"use client";

import { useEffect } from "react";
import { ChevronDownIcon, PlusIcon } from "lucide-react";

import { DatasourceDefinition } from "../datasource-interface";
import { useKnownDatasources } from "../known-datasources-provider";
import { KnownDatasourceSection } from "./known-datasource-list";
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

	// Fetched when this mounts, which inside the datasources dialog is when
	// the operator opens it: the dialog content unmounts on close, and what
	// they configured in another dashboard is exactly what changes between
	// two opens. The provider holds a short freshness window, so a run of
	// opens still costs one request. A surface with no provider above it
	// hands back a no-op and this costs nothing.
	const { state: knownState, refresh: refreshKnown } = useKnownDatasources();

	useEffect(() => {
		refreshKnown();
	}, [refreshKnown]);

	const known = (() => {
		switch (knownState.status) {
			case "loading":
				// Never "you have no saved configurations" — an operator who
				// reads that retypes a configuration that was about to appear.
				return (
					<p className="text-muted-foreground text-xs">
						Looking for datasources you have already configured…
					</p>
				);
			case "ready":
				return knownState.configs.length > 0 ? (
					<KnownDatasourceSection
						configs={knownState.configs}
						definitions={datasources_definitions}
					/>
				) : null;
			case "error":
				// The catalogue above is untouched: this list is a
				// convenience, and a failed read of it must not cost the
				// operator the ability to add a datasource.
				return (
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-muted-foreground text-xs">
							Could not load datasources from your other
							dashboards.
						</p>
						<Button
							variant="ghost"
							size="sm"
							onClick={refreshKnown}
							aria-label="Retry loading datasources from your other dashboards"
						>
							Retry
						</Button>
					</div>
				);
			case "idle":
			default:
				return null;
		}
	})();

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

	// Each block is named and ruled off from the other. The two render the
	// same outline rows, the same plus icons and the same two-column grid, so
	// without a heading apiece they read as one list — which is how the
	// from-scratch catalogue came to look as though it had been removed.
	const catalogueSection = (
		<section
			aria-labelledby="datasource-catalogue-heading"
			className="flex flex-col gap-2"
		>
			<div>
				<h4
					id="datasource-catalogue-heading"
					className="text-sm font-medium"
				>
					Set up a new one
				</h4>
				<p className="text-muted-foreground text-xs">
					Pick the integration that matches the system you want to
					connect. You can configure it right after adding it.
				</p>
			</div>
			{catalogue}
		</section>
	);

	// The reuse list sits second and carries the rule, so it is separated
	// from the catalogue without a stray line above an empty workspace's
	// only block.
	const knownSection = known ? (
		<div className="flex flex-col gap-2 border-t pt-3">{known}</div>
	) : null;

	if (!collapsible) {
		return (
			<section
				aria-labelledby="datasource-adder-heading"
				className="flex flex-col gap-2"
			>
				<h3
					id="datasource-adder-heading"
					className="text-sm font-medium"
				>
					Add a datasource
				</h3>
				{catalogueSection}
				{knownSection}
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
				{catalogueSection}
				{knownSection}
			</CollapsibleContent>
		</Collapsible>
	);
};

export default DatasourceAdder;

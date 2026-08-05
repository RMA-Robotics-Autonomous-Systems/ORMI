import React, { useState } from "react";
import { withJsonFormsControlProps } from "@jsonforms/react";
import {
	ControlProps,
	rankWith,
	isControl,
	and,
	uiTypeIs,
} from "@jsonforms/core";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Settings, ChevronDown } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

import { SelectedTopic } from "../datasources/datasource-interface";
import { DataRequirements } from "../widgets/widget-interface";
import { TopicSelectionDialog } from "./topic-selection/topic-selection-dialog";

/**
 * JsonForms renderer for selecting a datasource topic.
 * @param props - JsonForms control props.
 * @returns React element.
 */
const TopicSelectRenderer = (props: ControlProps) => {
	const { data, handleChange, path, uischema, label } = props;
	const [dialogOpen, setDialogOpen] = useState(false);

	// Extract data requirements from uischema options (new system)
	const dataRequirements = uischema.options?.dataRequirements as
		| DataRequirements
		| undefined;

	// Legacy support: detect old-style options
	const isLegacyMode =
		!dataRequirements &&
		(uischema.options?.asyncFunction ||
			uischema.options?.canSelectProperty !== undefined ||
			uischema.options?.propertyType);

	// Current selected topic
	const selectedTopic = data as SelectedTopic | undefined;

	const handleTopicSelect = (selection: SelectedTopic) => {
		handleChange(path, selection);
		setDialogOpen(false);
	};

	const getDisplayText = () => {
		if (!selectedTopic) {
			return "Select a topic...";
		}

		const parts = [selectedTopic.topic];

		if (selectedTopic.property) {
			parts.push(selectedTopic.property);
		}

		return parts.join(" → ");
	};

	const getTypeInfo = () => {
		if (!selectedTopic) return null;

		return (
			<div className="flex gap-1 mt-1">
				{selectedTopic.type && (
					<Badge variant="secondary" className="text-xs">
						{selectedTopic.type}
					</Badge>
				)}
				{selectedTopic.rawType &&
					selectedTopic.rawType !== selectedTopic.type && (
						<Badge variant="outline" className="text-xs">
							{selectedTopic.rawType}
						</Badge>
					)}
				{selectedTopic.bufferSize && selectedTopic.bufferSize !== 1 && (
					<Badge variant="outline" className="text-xs">
						Buffer: {selectedTopic.bufferSize}
					</Badge>
				)}
			</div>
		);
	};

	return (
		<div className="space-y-2">
			<Label>{label}</Label>

			<Button
				variant="outline"
				className={cn(
					"w-full justify-between h-auto p-3",
					!selectedTopic && "text-muted-foreground",
				)}
				onClick={() => setDialogOpen(true)}
			>
				<div className="flex flex-col items-start gap-1 flex-1 min-w-0">
					<span className="truncate text-left">
						{getDisplayText()}
					</span>
					{getTypeInfo()}
				</div>

				<div className="flex items-center gap-2 ml-2">
					<Settings className="w-4 h-4" />
				</div>
			</Button>

			{/* Requirements Display */}
			{process.env.NODE_ENV === "development" && (
				<div className="text-xs text-muted-foreground p-2 bg-muted rounded">
					{dataRequirements ? (
						<span>
							<strong>Requirements:</strong>{" "}
							{[
								...dataRequirements.accepts,
								...(dataRequirements.acceptsRaw ?? []),
							].join(", ")}
						</span>
					) : (
						<span>
							<strong>No Requirements:</strong> Any topic can be
							selected
						</span>
					)}
				</div>
			)}

			<TopicSelectionDialog
				isOpen={dialogOpen}
				onClose={() => setDialogOpen(false)}
				onSelect={handleTopicSelect}
				requirements={dataRequirements}
				initialValue={selectedTopic}
				label={label || "Select Topic"}
			/>
		</div>
	);
};

export default withJsonFormsControlProps(TopicSelectRenderer);

/** JsonForms tester for the TopicSelect UI schema type. */
const topicSelectTester = rankWith(10, and(isControl, uiTypeIs("TopicSelect")));

export { topicSelectTester };

/** UI schema element for TopicSelect. */
export interface TopicSelectElement {
	type: "TopicSelect";
	scope: string;
	options?: {
		dataRequirements?: DataRequirements;
		// Legacy options (deprecated but still supported)
		asyncFunction?: () => Promise<any[]>;
		buffer?: number;
		canSelectProperty?: boolean;
		propertyType?: string;
	};
}

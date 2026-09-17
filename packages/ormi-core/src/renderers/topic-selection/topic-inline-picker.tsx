import React from "react";
import {
	RadioGroup,
	RadioGroupItem,
} from "@workspace/ui/components/radio-group";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Settings } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

import {
	DatasourceTopic,
	SelectedTopic,
} from "../../datasources/datasource-interface";
import { topicKey } from "./topic-auto-select";
import { TopicCandidatePool } from "./topic-inline-candidates";

/** Props for {@link TopicInlinePicker}. */
export interface TopicInlinePickerProps {
	/** Candidate pool for the slot; only `direct` is rendered. */
	pool: TopicCandidatePool;
	/** The slot's current binding, if any. */
	value?: SelectedTopic;
	/** Called with the topic the operator picked. */
	onSelect: (topic: DatasourceTopic) => void;
	/** Opens the full selection dialog. */
	onBrowse: () => void;
	/** Unique prefix for the radio input ids; the JsonForms control path. */
	idPrefix: string;
}

/**
 * Inline radio list of the topics a slot can be bound to in one click.
 *
 * Rendered in place of the settled-value button when the candidate set is small
 * enough to take in at a glance (see `resolveTopicPickerMode`). Every list keeps
 * a way through to the full picker: the inline rows only offer whole topics, and
 * an operator who needs a nested property, a topic details pane or the topic
 * creator must never be stuck behind them.
 *
 * @param props - Component props.
 * @returns React element.
 */
export const TopicInlinePicker: React.FC<TopicInlinePickerProps> = ({
	pool,
	value,
	onSelect,
	onBrowse,
	idPrefix,
}) => {
	const selectedKey =
		value?.topic && value.source?.id && !value.property
			? topicKey(value)
			: "";

	const behindDialog = pool.compatibleCount - pool.direct.length;

	return (
		<div className="space-y-2">
			<RadioGroup
				value={selectedKey}
				onValueChange={(next) => {
					const picked = pool.direct.find(
						(topic) => topicKey(topic) === next,
					);
					if (picked) onSelect(picked);
				}}
				className="gap-0 rounded-md border p-1"
			>
				{pool.direct.map((topic) => {
					const key = topicKey(topic);
					const id = `${idPrefix}::${key}`;
					const isSelected = key === selectedKey;

					return (
						<Label
							key={key}
							htmlFor={id}
							className={cn(
								"hover:bg-accent/60 flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 font-normal",
								isSelected && "bg-accent",
							)}
						>
							<RadioGroupItem
								id={id}
								value={key}
								className="mt-0.5"
							/>
							<span className="flex min-w-0 flex-1 flex-col gap-1">
								<span className="truncate font-medium">
									{topic.topic}
								</span>
								<span className="flex min-w-0 flex-wrap items-center gap-1">
									{(topic.type || topic.rawType) && (
										<Badge
											variant="secondary"
											className="text-xs"
										>
											{topic.type || topic.rawType}
										</Badge>
									)}
									<span className="text-muted-foreground truncate text-xs">
										{topic.source.title}
									</span>
								</span>
							</span>
						</Label>
					);
				})}
			</RadioGroup>

			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs">
					{behindDialog > 0
						? `${behindDialog} other ${behindDialog === 1 ? "topic" : "topics"} can supply this through a property.`
						: null}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onBrowse}
				>
					<Settings className="mr-2 h-4 w-4" />
					Browse all topics
				</Button>
			</div>
		</div>
	);
};

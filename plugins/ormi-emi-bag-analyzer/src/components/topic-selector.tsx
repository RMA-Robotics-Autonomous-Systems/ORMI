"use client";

import React from "react";
import type { BagTopicInfo } from "../bag-reader/bag-types";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";

interface TopicSelectorProps {
	topics: BagTopicInfo[];
	selected: string[];
	gpsTopicName: string;
	onSelectionChange: (selected: string[]) => void;
	onGpsTopicChange: (topic: string) => void;
	onVisualize: () => void;
	loading: boolean;
}

export function TopicSelector({
	topics,
	selected,
	gpsTopicName,
	onSelectionChange,
	onGpsTopicChange,
	onVisualize,
	loading,
}: TopicSelectorProps) {
	const toggle = (name: string) => {
		onSelectionChange(
			selected.includes(name)
				? selected.filter((t) => t !== name)
				: [...selected, name],
		);
	};

	return (
		<div className="flex flex-col gap-3 rounded-lg border p-4">
			<h2 className="text-sm font-semibold">Topics</h2>
			<div className="max-h-64 overflow-y-auto flex flex-col gap-1">
				{topics.map((t) => (
					<div key={t.name} className="flex items-center gap-2">
						<Checkbox
							id={`topic-${t.id}`}
							checked={selected.includes(t.name)}
							onCheckedChange={() => toggle(t.name)}
						/>
						<Label
							htmlFor={`topic-${t.id}`}
							className="flex flex-1 cursor-pointer items-center justify-between text-xs"
						>
							<span className="truncate">{t.name}</span>
							<span className="ml-2 shrink-0 text-muted-foreground">
								{t.messageCount.toLocaleString()} msgs
							</span>
						</Label>
					</div>
				))}
			</div>

			<div className="flex flex-col gap-1">
				<Label className="text-xs text-muted-foreground">
					GPS topic
				</Label>
				<Input
					value={gpsTopicName}
					onChange={(e) => onGpsTopicChange(e.target.value)}
					placeholder="/gps/fix"
					className="h-7 text-xs"
				/>
			</div>

			<Button
				size="sm"
				onClick={onVisualize}
				disabled={loading || selected.length === 0}
			>
				{loading ? "Reading…" : "Visualize"}
			</Button>
		</div>
	);
}

"use client";

import React from "react";
import type { BagTopicInfo } from "../../bag-reader/bag-types";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";

const NUMERIC_TYPES = new Set([
	"std_msgs/msg/Float32",
	"std_msgs/msg/Float64",
	"std_msgs/msg/Int32",
	"std_msgs/msg/Int64",
	"geometry_msgs/msg/Twist",
	"geometry_msgs/msg/Vector3Stamped",
]);
const EVENT_TYPES = new Set(["sensor_msgs/msg/NavSatFix"]);

interface TopicPanelProps {
	topics: BagTopicInfo[];
	selectedNumeric: string[];
	selectedEvents: string[];
	gpsTopic: string;
	detectionTopic: string;
	onNumericChange: (topics: string[]) => void;
	onEventsChange: (topics: string[]) => void;
	onGpsTopicChange: (topic: string) => void;
	onDetectionTopicChange: (topic: string) => void;
	onLoad: () => void;
	loading: boolean;
}

function Toggle({
	checked,
	onChange,
	label,
	secondary,
	id,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
	secondary?: string;
	id: string;
}) {
	return (
		<div className="flex items-start gap-2 py-0.5">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(v) => onChange(Boolean(v))}
				className="mt-0.5 shrink-0"
			/>
			<Label htmlFor={id} className="cursor-pointer min-w-0">
				<span className="block truncate font-mono text-xs">
					{label}
				</span>
				{secondary && (
					<span className="block text-xs text-muted-foreground">
						{secondary}
					</span>
				)}
			</Label>
		</div>
	);
}

export function TopicPanel({
	topics,
	selectedNumeric,
	selectedEvents,
	gpsTopic,
	detectionTopic,
	onNumericChange,
	onEventsChange,
	onGpsTopicChange,
	onDetectionTopicChange,
	onLoad,
	loading,
}: TopicPanelProps) {
	const numericTopics = topics.filter((t) => NUMERIC_TYPES.has(t.type));
	const eventTopics = topics.filter((t) => EVENT_TYPES.has(t.type));
	const gpsTopics = eventTopics;

	const toggleNumeric = (name: string, on: boolean) => {
		onNumericChange(
			on
				? [...selectedNumeric, name]
				: selectedNumeric.filter((t) => t !== name),
		);
	};

	const toggleEvent = (name: string, on: boolean) => {
		onEventsChange(
			on
				? [...selectedEvents, name]
				: selectedEvents.filter((t) => t !== name),
		);
	};

	return (
		<div className="flex flex-col gap-3">
			{/* Numeric topics */}
			<div>
				<p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
					Numeric topics
				</p>
				<ScrollArea className="h-48 rounded border p-2">
					<div className="flex flex-col gap-0.5">
						{numericTopics.length === 0 && (
							<p className="text-xs text-muted-foreground">
								No numeric topics found
							</p>
						)}
						{numericTopics.map((t) => (
							<Toggle
								key={t.name}
								id={`num-${t.name}`}
								checked={selectedNumeric.includes(t.name)}
								onChange={(on) => toggleNumeric(t.name, on)}
								label={t.name}
								secondary={t.type.split("/").pop()}
							/>
						))}
					</div>
				</ScrollArea>
			</div>

			{/* Event / fix topics */}
			<div>
				<p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
					Event topics (vertical lines)
				</p>
				<ScrollArea className="h-32 rounded border p-2">
					<div className="flex flex-col gap-0.5">
						{eventTopics.length === 0 && (
							<p className="text-xs text-muted-foreground">
								No NavSatFix topics found
							</p>
						)}
						{eventTopics.map((t) => (
							<Toggle
								key={t.name}
								id={`evt-${t.name}`}
								checked={selectedEvents.includes(t.name)}
								onChange={(on) => toggleEvent(t.name, on)}
								label={t.name}
								secondary={`${t.messageCount} msgs`}
							/>
						))}
					</div>
				</ScrollArea>
			</div>

			{/* GPS topic */}
			<div>
				<p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
					GPS track topic
				</p>
				<Select
					value={gpsTopic || "__none__"}
					onValueChange={(v) =>
						onGpsTopicChange(v === "__none__" ? "" : v)
					}
				>
					<SelectTrigger className="h-7 text-xs">
						<SelectValue placeholder="(none)" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__none__">(none)</SelectItem>
						{gpsTopics.map((t) => (
							<SelectItem key={t.name} value={t.name}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Detection source topic */}
			<div>
				<p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
					Detection source topic
				</p>
				<Select
					value={detectionTopic}
					onValueChange={onDetectionTopicChange}
				>
					<SelectTrigger className="h-7 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{numericTopics.map((t) => (
							<SelectItem key={t.name} value={t.name}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<Button
				className="mt-1 w-full"
				disabled={loading || selectedNumeric.length === 0}
				onClick={onLoad}
			>
				{loading ? "Loading…" : "Load data"}
			</Button>
		</div>
	);
}

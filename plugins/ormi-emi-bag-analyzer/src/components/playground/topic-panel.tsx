"use client";

import React from "react";
import type { BagTopicInfo } from "../../bag-reader/bag-types";

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
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
	secondary?: string;
}) {
	return (
		<label className="flex cursor-pointer items-start gap-2 py-0.5">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="mt-0.5 shrink-0 accent-blue-500"
			/>
			<span className="min-w-0">
				<span className="block truncate text-sm font-mono text-xs">
					{label}
				</span>
				{secondary && (
					<span className="block text-xs text-muted-foreground">
						{secondary}
					</span>
				)}
			</span>
		</label>
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
				<div className="max-h-48 overflow-y-auto rounded border p-2 flex flex-col gap-0.5">
					{numericTopics.length === 0 && (
						<p className="text-xs text-muted-foreground">
							No numeric topics found
						</p>
					)}
					{numericTopics.map((t) => (
						<Toggle
							key={t.name}
							checked={selectedNumeric.includes(t.name)}
							onChange={(on) => toggleNumeric(t.name, on)}
							label={t.name}
							secondary={t.type.split("/").pop()}
						/>
					))}
				</div>
			</div>

			{/* Event / fix topics */}
			<div>
				<p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
					Event topics (vertical lines)
				</p>
				<div className="max-h-32 overflow-y-auto rounded border p-2 flex flex-col gap-0.5">
					{eventTopics.length === 0 && (
						<p className="text-xs text-muted-foreground">
							No NavSatFix topics found
						</p>
					)}
					{eventTopics.map((t) => (
						<Toggle
							key={t.name}
							checked={selectedEvents.includes(t.name)}
							onChange={(on) => toggleEvent(t.name, on)}
							label={t.name}
							secondary={`${t.messageCount} msgs`}
						/>
					))}
				</div>
			</div>

			{/* GPS topic */}
			<div>
				<p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
					GPS track topic
				</p>
				<select
					value={gpsTopic}
					onChange={(e) => onGpsTopicChange(e.target.value)}
					className="w-full rounded border bg-background px-2 py-1 text-xs"
				>
					<option value="">(none)</option>
					{gpsTopics.map((t) => (
						<option key={t.name} value={t.name}>
							{t.name}
						</option>
					))}
				</select>
			</div>

			{/* Detection source topic */}
			<div>
				<p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
					Detection source topic
				</p>
				<select
					value={detectionTopic}
					onChange={(e) => onDetectionTopicChange(e.target.value)}
					className="w-full rounded border bg-background px-2 py-1 text-xs"
				>
					{numericTopics.map((t) => (
						<option key={t.name} value={t.name}>
							{t.name}
						</option>
					))}
				</select>
			</div>

			<button
				type="button"
				disabled={loading || selectedNumeric.length === 0}
				onClick={onLoad}
				className="mt-1 w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
			>
				{loading ? "Loading…" : "Load data"}
			</button>
		</div>
	);
}

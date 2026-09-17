"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	CloudCog,
	Gamepad2,
	Loader2,
} from "lucide-react";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useAutoFocus } from "@workspace/ui/hooks/use-autofocus";
import { requestDatasourceConfiguration } from "@workspace/ui/components/datasource-offline";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";

import type { DatasourceTopic } from "../../../datasources/datasource-interface";
import DatasourceAdder from "../../../datasources/components/datasource-adder";
import { NEW_DATASOURCE_TITLE } from "../../../datasources/datasource-configured";
import { TopicCreatorDialog } from "../../../renderers/topic-selection/topic-creator-dialog";
import { countTopicReachable } from "../../../widgets/topic-reachability";
import { datasourcesAtom } from "../../atoms";
import { useAvailableTopics } from "../../state/use-available-topics";
import { useDashboardActions } from "../../state/use-dashboard-actions";
import {
	useTopicRouter,
	type TopicRouting,
} from "../../state/use-topic-router";
import { useDashboardRegistry } from "../../shell/dashboard-shell";
import { TopicRouteButton } from "../topic-route-button";
import { TopicPreviewHover } from "./topic-preview-hover";
import type { TopicPreviewRegistry } from "./topic-preview-registry";
import { useTopicPreviews } from "./use-topic-previews";
import {
	selectTopics,
	type TopicSortDirection,
	type TopicSortKey,
} from "./topic-sort";

/** One topic row. */
const TopicRow = memo(
	function TopicRow({
		topic,
		routing,
		previews,
		onRouted,
	}: {
		topic: DatasourceTopic;
		routing: TopicRouting;
		previews: TopicPreviewRegistry;
		onRouted?: () => void;
	}) {
		return (
			<TableRow>
				<TableCell className="max-w-[12rem] truncate font-medium">
					<span title={topic.source.title}>{topic.source.title}</span>
				</TableCell>
				<TableCell className="max-w-[22rem] font-medium">
					<TopicPreviewHover topic={topic} previews={previews} />
				</TableCell>
				<TableCell>
					{topic.type ? (
						<Badge variant="secondary" className="text-xs">
							{topic.type}
						</Badge>
					) : (
						<span className="text-muted-foreground text-xs">—</span>
					)}
				</TableCell>
				<TableCell className="text-muted-foreground max-w-[16rem] truncate text-xs">
					<span title={topic.rawType}>{topic.rawType}</span>
				</TableCell>
				<TableCell className="text-right">
					<TopicRouteButton
						topic={topic}
						routing={routing}
						onRouted={onRouted}
					/>
				</TableCell>
			</TableRow>
		);
	},
	// Only the topic's identity and the routing context change what a row
	// renders; the topic objects themselves are re-created by every poll.
	(previous, next) =>
		previous.topic.topic === next.topic.topic &&
		previous.topic.datasource_id === next.topic.datasource_id &&
		previous.topic.type === next.topic.type &&
		previous.topic.rawType === next.topic.rawType &&
		// The row renders the datasource's title, so it is a compared field.
		// Leaving it out meant a rename reached the topic list and stopped at
		// the row, which looked exactly like the datasource not reporting it.
		previous.topic.source?.title === next.topic.source?.title &&
		previous.routing === next.routing &&
		previous.previews === next.previews &&
		previous.onRouted === next.onRouted,
);

/** Column headers, in table order. */
const COLUMNS: { key: TopicSortKey; label: string }[] = [
	{ key: "datasource", label: "Datasource" },
	{ key: "topic", label: "Topic" },
	{ key: "type", label: "Type" },
	{ key: "rawType", label: "Raw type" },
];

/** Props for {@link TopicsPanel}. */
export interface TopicsPanelProps {
	/**
	 * Called once a topic has been placed on the dashboard.
	 *
	 * A host that covers the dashboard (a dialog) uses it to get out of the
	 * way so the operator sees what they just added; a host that sits on the
	 * dashboard (the topics-list widget) passes nothing and stays put.
	 */
	onRouted?: () => void;
	/**
	 * Called to send the operator to the widget catalogue.
	 *
	 * Optional because the panel has no tab strip of its own: a host that has
	 * one (the launcher dialog) passes this and the footer's mention of the
	 * widgets list becomes the way there, while a host that does not (the
	 * topics-list widget) passes nothing and the footer stays prose. An
	 * affordance that cannot lead anywhere must not look like it can.
	 */
	onShowWidgets?: () => void;
	/**
	 * Whether the search box should take focus when the panel mounts.
	 *
	 * Off by default, and that default is the important half: this panel is
	 * also a dashboard widget, and a widget that grabs the caret while the
	 * workspace is loading steals it from whatever the operator was doing and
	 * swallows their next keystrokes. Only a surface the operator deliberately
	 * opened — the launcher dialog — has the right to assume they came here to
	 * type.
	 */
	autoFocusSearch?: boolean;
}

/**
 * Every live topic, one click from being on the dashboard.
 *
 * The single topic list in the product: the dialog and the topics-list widget
 * render this same panel, so sorting, search, hover previews and the routing
 * action behave identically wherever an operator meets a topic. Two lists that
 * drifted apart is what this replaces.
 *
 * The cold start is a first step rather than a dead end: with no datasource
 * configured the panel offers the datasource types directly and opens the
 * settings on the instance it just added, so "empty workspace" leads to
 * "connected robot" without the operator having to find the navbar.
 *
 * Incompatible topics keep their row with a disabled action — see
 * {@link TopicRouteButton}. Hiding them turns "why is my topic not listed?"
 * into a permanent support question.
 *
 * @param props - Component props.
 * @returns React element.
 */
export const TopicsPanel: React.FC<TopicsPanelProps> = ({
	onRouted,
	onShowWidgets,
	autoFocusSearch = false,
}) => {
	const searchRef = useAutoFocus<HTMLInputElement>(autoFocusSearch);
	const topics = useAvailableTopics();
	const routing = useTopicRouter();
	const previews = useTopicPreviews();
	const datasources = useAtomValue(datasourcesAtom);
	const { widgetDefinitions } = useDashboardRegistry();
	const { addDatasource } = useDashboardActions();

	const [query, setQuery] = useState("");
	const [sortKey, setSortKey] = useState<TopicSortKey>("topic");
	const [sortDirection, setSortDirection] =
		useState<TopicSortDirection>("asc");
	const [isCreatorOpen, setIsCreatorOpen] = useState(false);

	const visibleTopics = useMemo(
		() => selectTopics(topics, { query, sortKey, sortDirection }),
		[topics, query, sortKey, sortDirection],
	);

	const handleSort = useCallback((key: TopicSortKey) => {
		setSortKey((current) => {
			if (current === key) {
				setSortDirection((direction) =>
					direction === "asc" ? "desc" : "asc",
				);
				return current;
			}
			setSortDirection("asc");
			return key;
		});
	}, []);

	const handleTopicCreated = useCallback((topic: DatasourceTopic) => {
		// The creator registered it, so the poll already has it. Search for it
		// so the operator lands on the row they just made instead of hunting
		// for it in a list of several hundred — the name is one they typed a
		// second ago, so narrowing to it is not a surprising place to be left.
		setQuery(topic.topic);
		setSortKey("topic");
		setSortDirection("asc");
	}, []);

	const handleAddDatasource = useCallback(
		(datasourceId: string) => {
			addDatasource(datasourceId);
			// The instance exists but has no URL yet, so send the operator
			// straight to the form instead of leaving an unconfigured card.
			requestDatasourceConfiguration(NEW_DATASOURCE_TITLE);
		},
		[addDatasource],
	);

	// Recomputed per render on purpose: widgetDefinitions is a new array every
	// shell render, so a memo keyed on it would never hit anyway, and the claim
	// index it is counted against is memoised inside `useTopicRouter`.
	const reachableCount = countTopicReachable(
		widgetDefinitions,
		routing.claims,
	);

	if (datasources.size === 0) {
		return (
			<div className="flex flex-col gap-3 p-3">
				<div className="text-muted-foreground flex flex-col items-center gap-2 text-center">
					<CloudCog className="size-8 opacity-60" aria-hidden />
					<p className="text-sm">
						Topics appear here once a datasource is connected.
					</p>
				</div>
				<DatasourceAdder handleAdd={handleAddDatasource} />
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					ref={searchRef}
					type="search"
					className="min-w-40 max-w-md flex-1"
					placeholder="Search topics, datasource, type…"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					aria-label="Search topics"
				/>
				{/* A topic the operator commands does not exist until they say
				    it does, so creating one is an action of this list rather
				    than something reached from inside a widget's topic picker.
				    It carries the gamepad marker the command vocabulary uses
				    everywhere else. */}
				<Button
					variant="outline"
					size="sm"
					className="shrink-0"
					onClick={() => setIsCreatorOpen(true)}
				>
					<Gamepad2 className="size-4" aria-hidden />
					New publish topic
				</Button>
			</div>

			<TopicCreatorDialog
				isOpen={isCreatorOpen}
				onClose={() => setIsCreatorOpen(false)}
				onTopicCreated={handleTopicCreated}
				purpose="publish"
			/>

			<div className="min-h-0 flex-1 overflow-auto">
				{visibleTopics.length === 0 ? (
					<div className="text-muted-foreground flex flex-col items-center gap-2 p-4 text-center text-sm">
						{topics.length === 0 ? (
							<>
								<Loader2
									className="size-5 animate-spin"
									aria-hidden
								/>
								<p>
									Waiting for topics from the connected
									datasources.
								</p>
							</>
						) : (
							<p>No topic matches your search.</p>
						)}
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								{COLUMNS.map((column) => (
									<TableHead key={column.key}>
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												handleSort(column.key)
											}
											aria-label={`Sort by ${column.label}`}
										>
											{column.label}
											{sortKey !== column.key ? (
												<ArrowUpDown
													className="text-muted-foreground size-4"
													aria-hidden
												/>
											) : sortDirection === "asc" ? (
												<ArrowUp
													className="size-4"
													aria-hidden
												/>
											) : (
												<ArrowDown
													className="size-4"
													aria-hidden
												/>
											)}
										</Button>
									</TableHead>
								))}
								<TableHead className="w-24 text-right">
									<span className="sr-only">
										Display or command
									</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleTopics.map((topic) => (
								<TopicRow
									key={`${topic.datasource_id}-${topic.topic}`}
									topic={topic}
									routing={routing}
									previews={previews}
									onRouted={onRouted}
								/>
							))}
						</TableBody>
					</Table>
				)}
			</div>

			{/* Tracks `isTopicReachable`: a widget is counted when a plugin
			    claims it for some topic type, controls included, so they must
			    not be listed here as the exceptions. */}
			<p className="text-muted-foreground border-t pt-2 text-xs">
				{reachableCount} of {widgetDefinitions.length} widgets open from
				a topic, controls included. The rest — iframes, mission panels —
				are added from{" "}
				{onShowWidgets ? (
					<button
						type="button"
						onClick={onShowWidgets}
						className="text-foreground underline underline-offset-2"
					>
						the widgets list
					</button>
				) : (
					"the widgets list"
				)}
				.
			</p>
		</div>
	);
};

"use client";

import { useMemo } from "react";
import { AlertTriangle, XCircle } from "lucide-react";

import { useAgents } from "../state/c2-agents-store";
import { useFeatureNames } from "../state/c2-catalog-store";
import { focusGraphNode } from "../state/graph-focus-store";
import { useMissionAssets } from "../state/mission-assets-store";
import { useMissionGraph } from "../state/mission-graph-store";
import type { MissionConfigIssue } from "../types/mission-config-validation";
import { assetFeatureTypes, assetId } from "./mission-assets";
import { type MissionGraph, compileMissionGraph } from "./mission-graph";
import {
	issueNodeTags,
	sortIssuesBySeverity,
} from "./mission-graph-editor-helpers";
import {
	type IssueNames,
	type StepIssue,
	configStepIssues,
	graphStepIssues,
	issueValueText,
} from "./step-issues";

/**
 * The one way the C2 widgets list a mission's problems ({@link StepIssue}):
 * a row per problem, naming the value it is about, and a click through to
 * its step.
 *
 * A click selects the step's node in the node editor and asks it to bring
 * the node into view (`focusGraphNode`, an explicit reveal), and the map then
 * outlines what that step targets as related. A row that is about no one
 * step is plain text, never a button that selects something nearby.
 */

/**
 * React hook: the names a mission's issues are resolved through: its own
 * assets, then the map catalogue, and the robot roster.
 * @param missionId - The mission.
 * @returns The lookups.
 */
export function useIssueNames(
	missionId: string | null | undefined,
): IssueNames {
	const assets = useMissionAssets(missionId);
	const catalogue = useFeatureNames();
	const agents = useAgents();
	return useMemo(() => {
		const features: Record<string, string> = { ...catalogue };
		for (const feature of assets?.features ?? []) {
			const name = feature.properties?.name;
			if (typeof name === "string" && name.trim())
				features[assetId(feature)] = name;
		}
		const robots: Record<string, string> = {};
		for (const agent of agents) robots[agent.agent_id] = agent.name;
		return { features, agents: robots };
	}, [assets, catalogue, agents]);
}

/**
 * React hook: what stops a mission's graph from being submitted, live: its
 * compile errors, against the mission's own assets, as the node editor
 * compiles it. Empty while the graph is not loaded.
 * @param missionId - The mission.
 * @returns The errors, as step issues.
 */
export function useGraphBlockers(
	missionId: string | null | undefined,
): StepIssue[] {
	const graph = useMissionGraph(missionId);
	const assets = useMissionAssets(missionId);
	return useMemo(() => {
		if (!graph) return [];
		const compiled = compileMissionGraph(
			graph,
			assets ? assetFeatureTypes(assets) : undefined,
		);
		return graphStepIssues(
			sortIssuesBySeverity(compiled.issues).filter(
				(issue) => issue.severity === "error",
			),
		);
	}, [graph, assets]);
}

/**
 * The mission config check's issues ({@link configStepIssues}), with a
 * heading, each tied to its step where its path leads to one.
 */
export function MissionConfigIssueList(props: {
	missionId: string | null | undefined;
	issues: readonly MissionConfigIssue[];
	/** The config the issues were raised on. */
	config: unknown;
	title: string;
}) {
	const graph = useMissionGraph(props.missionId);
	const { issues, config } = props;
	const steps = useMemo(
		() => configStepIssues(issues, config, graph),
		[issues, config, graph],
	);
	if (steps.length === 0) return null;
	return (
		<div className="flex shrink-0 flex-col gap-1 text-xs">
			<span className="font-medium">{props.title}</span>
			<StepIssueList
				missionId={props.missionId}
				issues={steps}
				graph={graph}
				label={props.title}
			/>
		</div>
	);
}

/** Props for {@link StepIssueList}. */
export interface StepIssueListProps {
	/** The mission the issues are about. */
	missionId: string | null | undefined;
	issues: readonly StepIssue[];
	/** Its graph; read from the mission graph store when not given. */
	graph?: MissionGraph | null;
	/** Called after a row led to its step (to close a popover, say). */
	onShown?: () => void;
	/** Accessible name of the list. */
	label?: string;
	className?: string;
}

/**
 * The issues, one row each, errors and warnings as given.
 */
export function StepIssueList(props: StepIssueListProps) {
	const stored = useMissionGraph(props.missionId);
	const graph = props.graph === undefined ? stored : props.graph;
	const names = useIssueNames(props.missionId);
	const { issues } = props;
	const tags = useMemo(
		() =>
			graph
				? issueNodeTags(
						graph,
						issues.flatMap((issue) =>
							issue.nodeId ? [issue.nodeId] : [],
						),
					)
				: new Map<string, string>(),
		[graph, issues],
	);
	if (issues.length === 0) return null;
	return (
		<ul
			aria-label={props.label}
			className={`flex flex-col gap-1 ${props.className ?? ""}`}
		>
			{issues.map((issue, index) => (
				<li key={`${issue.nodeId ?? "mission"}-${index}`}>
					<StepIssueRow
						issue={issue}
						missionId={
							graph?.nodes.some(
								(node) => node.id === issue.nodeId,
							)
								? (props.missionId ?? null)
								: null
						}
						tag={issue.nodeId ? tags.get(issue.nodeId) : undefined}
						value={
							issue.value
								? issueValueText(issue.value, names)
								: undefined
						}
						onShown={props.onShown}
					/>
				</li>
			))}
		</ul>
	);
}

/** One row: a button to its step when it has one, plain text otherwise. */
function StepIssueRow(props: {
	issue: StepIssue;
	/** The mission to show the step in; null when the row leads nowhere. */
	missionId: string | null;
	/** Where the step is, e.g. `Alpha · step 3`. */
	tag?: string;
	/** The value it names, resolved. */
	value?: string;
	onShown?: () => void;
}) {
	const { issue } = props;
	const error = issue.severity === "error";
	const nodeId = props.missionId ? issue.nodeId : null;
	const tone = error
		? "border-destructive/40 bg-destructive/10"
		: "border-warning/40 bg-warning/10";
	const body = (
		<>
			{error ? (
				<XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
			) : (
				<AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-text" />
			)}
			<span className="flex min-w-0 flex-col">
				{props.tag && <span className="font-medium">{props.tag}</span>}
				{props.value && (
					<span className="font-medium break-words">
						{props.value}
					</span>
				)}
				<span className="break-words">{issue.message}</span>
			</span>
		</>
	);
	const shape = `flex w-full items-start gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] text-foreground any-pointer-coarse:min-h-11 ${tone}`;
	if (!nodeId || !props.missionId) {
		return <div className={shape}>{body}</div>;
	}
	const missionId = props.missionId;
	return (
		<button
			type="button"
			className={`${shape} cursor-pointer outline-none hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50`}
			title="Show the step"
			onClick={() => {
				focusGraphNode(missionId, nodeId);
				props.onShown?.();
			}}
		>
			{body}
		</button>
	);
}

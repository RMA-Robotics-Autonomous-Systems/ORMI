"use client";

import React, { useMemo, useState } from "react";
import {
	LocalDataSourcesProvider,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import type { SelectedTopic } from "@workspace/ormi-core/datasources";
import type { RemoteCallDefinition } from "@workspace/ormi-core/datasources";
import {
	useRemoteCall,
	useAvailableRemoteCalls,
} from "@workspace/ormi-core/datasources";
import { DatasourceGate } from "@workspace/ui/components/datasource-gate";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";

// ============================================================================
// Types
// ============================================================================

interface RosDiagnosticStatus {
	level: number;
	name: string;
	message: string;
	hardware_id: string;
	values: { key: string; value: string }[];
}

interface RosDiagnosticArray {
	header: { stamp: { sec: number; nanosec: number }; frame_id: string };
	status: RosDiagnosticStatus[];
}

interface ContainerStatus {
	name: string;
	id: string;
	state: string;
	health: string;
	image: string;
	uptime: string;
	restartCount: number;
	level: number; // 0=OK, 1=WARN, 2=ERROR
}

// ============================================================================
// Helpers
// ============================================================================

function getKV(values: { key: string; value: string }[], key: string): string {
	return values.find((v) => v.key === key)?.value ?? "";
}

function parseContainers(latest: unknown): ContainerStatus[] {
	if (!latest || typeof latest !== "object") return [];
	const msg = latest as RosDiagnosticArray;
	if (!Array.isArray(msg.status)) return [];
	return msg.status.map((s) => {
		const values = s.values ?? [];
		return {
			name: s.name ?? "unknown",
			id: getKV(values, "id") || s.hardware_id || "",
			state: getKV(values, "state") || s.message || "",
			health: getKV(values, "health"),
			image: getKV(values, "image"),
			uptime: getKV(values, "uptime"),
			restartCount: parseInt(getKV(values, "restart_count") || "0", 10),
			level: s.level ?? 0,
		};
	});
}

// ============================================================================
// ActionButton — owns its own useRemoteCall state
// ============================================================================

interface ActionButtonProps {
	definition: RemoteCallDefinition;
	request: unknown;
	label: string;
	variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
}

/** Outcome of the operation as reported inside the response body. */
interface CallOutcome {
	ok: boolean;
	message: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({
	definition,
	request,
	label,
	variant = "outline",
}) => {
	const { execute, isExecuting, feedback, error, status } =
		useRemoteCall(definition);
	const feedbackStatus = (feedback as { status?: string } | null)?.status;
	const [outcome, setOutcome] = useState<CallOutcome | null>(null);

	const onClick = async () => {
		setOutcome(null);
		const result = await execute(request);
		if (!result.success) {
			// Transport/datasource-level failure (handled below via `error`).
			return;
		}
		// The call reached ROSTainer; the real success is in the response body
		// (`{ success, message }`), not the transport-level result.success.
		const body = result.data as
			| { success?: boolean; message?: string }
			| undefined;
		setOutcome({
			ok: body?.success ?? true,
			message: body?.message ?? "",
		});
	};

	return (
		<div className="flex flex-col gap-1">
			<Button
				size="sm"
				variant={variant}
				disabled={isExecuting}
				onClick={onClick}
				className="h-7 text-xs"
			>
				{isExecuting ? (
					<span className="flex items-center gap-1">
						<span className="animate-spin">⟳</span>
						{label}…
					</span>
				) : (
					label
				)}
			</Button>
			{isExecuting && feedbackStatus && (
				<p className="text-xs text-muted-foreground truncate max-w-[120px]">
					{feedbackStatus}
				</p>
			)}
			{status === "failed" && error && (
				<p
					className="text-xs text-destructive truncate max-w-[120px]"
					title={error}
				>
					{error}
				</p>
			)}
			{!isExecuting && outcome && (
				<p
					className={`text-xs truncate max-w-[120px] ${
						outcome.ok
							? "text-green-600 dark:text-green-400"
							: "text-destructive"
					}`}
					title={outcome.message}
				>
					{outcome.message || (outcome.ok ? "Done" : "Failed")}
				</p>
			)}
		</div>
	);
};

// ============================================================================
// ContainerCard
// ============================================================================

interface ContainerCardProps {
	container: ContainerStatus;
	restartDef?: RemoteCallDefinition;
	pullDef?: RemoteCallDefinition;
}

const ContainerCard: React.FC<ContainerCardProps> = ({
	container,
	restartDef,
	pullDef,
}) => {
	const isRunning = container.level === 0;
	const dotColor = isRunning ? "bg-green-500" : "bg-yellow-500";

	return (
		<div className="rounded-lg border bg-card p-3 flex flex-col gap-2 text-sm">
			{/* Header row */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<span
						className={`shrink-0 h-2 w-2 rounded-full ${dotColor}`}
						aria-label={isRunning ? "running" : "stopped"}
					/>
					<span
						className="font-medium truncate"
						title={container.name}
					>
						{container.name}
					</span>
				</div>
				<Badge
					variant={isRunning ? "default" : "secondary"}
					className="shrink-0 text-xs capitalize"
				>
					{container.state}
				</Badge>
			</div>

			{/* Details */}
			<div className="text-muted-foreground text-xs space-y-0.5">
				<p className="truncate" title={container.image}>
					{container.image || "—"}
				</p>
				<p>
					{container.uptime
						? `up ${container.uptime}`
						: "not running"}
					{container.health && ` · ${container.health}`}
					{` · restarted ${container.restartCount}×`}
				</p>
			</div>

			{/* Actions */}
			{(restartDef || pullDef) && (
				<div className="flex flex-wrap gap-2 pt-1">
					{restartDef && (
						<ActionButton
							definition={restartDef}
							request={{ container: container.name }}
							label="Restart"
						/>
					)}
					{pullDef && (
						<ActionButton
							definition={pullDef}
							request={{ image: container.image, recreate: true }}
							label="Pull & Recreate"
							variant="secondary"
						/>
					)}
				</div>
			)}
		</div>
	);
};

// ============================================================================
// Widget body — inside LocalDataSourcesProvider
// ============================================================================

const RostainerStatusBody: React.FC<{ topic: SelectedTopic }> = ({ topic }) => {
	const { sources, health } = useLocalDataSource();
	const { calls } = useAvailableRemoteCalls({
		datasource_id: topic.datasource_id,
	});

	// ROSTainer exposes the actions `<ns>/docker/restart` and `<ns>/docker/pull`.
	// Anchor on the trailing segment so sibling calls like `restart_all` or
	// `pull_logs` can never be fired by mistake.
	const restartDef = useMemo(
		() => calls.find((c) => /(^|\/)docker\/restart$/i.test(c.name)),
		[calls],
	);
	const pullDef = useMemo(
		() => calls.find((c) => /(^|\/)docker\/pull$/i.test(c.name)),
		[calls],
	);

	const containers = useMemo(() => {
		for (const source of sources.values()) {
			if (source.data.length > 0) {
				return parseContainers(source.data[source.data.length - 1]);
			}
		}
		return [];
	}, [sources]);

	return (
		<DatasourceGate health={health} title={topic.topic}>
			<div className="h-full overflow-y-auto p-2 flex flex-col gap-2">
				{containers.length === 0 ? (
					<p className="text-sm text-muted-foreground text-center pt-4">
						No containers reported
					</p>
				) : (
					containers.map((c) => (
						<ContainerCard
							key={c.id || c.name}
							container={c}
							restartDef={restartDef}
							pullDef={pullDef}
						/>
					))
				)}
			</div>
		</DatasourceGate>
	);
};

// ============================================================================
// Widget container — stable module-level ref (Pattern #10)
// ============================================================================

export interface RostainerStatusWidgetProps extends Record<string, unknown> {
	title: string;
	topic: SelectedTopic;
}

const RostainerStatusWidget: React.FC<RostainerStatusWidgetProps> = (props) => {
	return (
		<LocalDataSourcesProvider
			SelectedTopics={[props.topic]}
			buffersSize={1}
		>
			<RostainerStatusBody topic={props.topic} />
		</LocalDataSourcesProvider>
	);
};

export { RostainerStatusWidget };

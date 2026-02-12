"use client";

import { ControlElement, JsonSchema, VerticalLayout } from "@jsonforms/core";
import { JsonForms } from "@jsonforms/react";
import {
	RemoteCallDefinition,
	RemoteCallStatus,
	useRemoteCall,
	useAvailableRemoteCalls,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { shadcnRenderer, shadcnCells } from "@workspace/ormi-jsonforms";
import { Button } from "@workspace/ui/components/button";
import { Progress } from "@workspace/ui/components/progress";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import {
	PhoneCall,
	Play,
	Square,
	RefreshCw,
	CheckCircle2,
	XCircle,
	Clock,
	Loader2,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";

// ============================================================================
// Types
// ============================================================================

/** Props for RemoteCallExplorer widget. */
interface RemoteCallWidgetProps {
	title: string;
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: RemoteCallStatus }) {
	const config: Record<
		RemoteCallStatus,
		{
			variant: "default" | "secondary" | "destructive" | "outline";
			icon: React.ReactNode;
			label: string;
		}
	> = {
		pending: {
			variant: "secondary",
			icon: <Clock className="w-3 h-3" />,
			label: "Pending",
		},
		executing: {
			variant: "default",
			icon: <Loader2 className="w-3 h-3 animate-spin" />,
			label: "Executing",
		},
		succeeded: {
			variant: "default",
			icon: <CheckCircle2 className="w-3 h-3" />,
			label: "Succeeded",
		},
		failed: {
			variant: "destructive",
			icon: <XCircle className="w-3 h-3" />,
			label: "Failed",
		},
		canceled: {
			variant: "outline",
			icon: <Square className="w-3 h-3" />,
			label: "Canceled",
		},
	};

	const { variant, icon, label } = config[status];

	return (
		<Badge variant={variant} className="flex items-center gap-1">
			{icon}
			{label}
		</Badge>
	);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Safely stringify a value, handling BigInt by converting to string
 */
function safeStringify(value: unknown, space?: number): string {
	return JSON.stringify(
		value,
		(_key, val) => (typeof val === "bigint" ? val.toString() : val),
		space,
	);
}

// ============================================================================
// Feedback Display Component
// ============================================================================

interface FeedbackDisplayProps {
	feedback: unknown;
	feedbackType?: string;
	feedbackSchema?: JsonSchema;
}

function FeedbackDisplay({
	feedback,
	feedbackType,
	feedbackSchema,
}: FeedbackDisplayProps) {
	if (feedback === null || feedback === undefined) {
		return null;
	}

	// Determine display type based on webapp type or actual value
	const displayType = useMemo(() => {
		// Check by feedbackType (webapp type)
		if (feedbackType) {
			const lowerType = feedbackType.toLowerCase();
			if (
				lowerType.includes("number") ||
				lowerType.includes("float") ||
				lowerType.includes("int") ||
				lowerType.includes("progress")
			) {
				return "progress";
			}
			if (lowerType.includes("string") || lowerType.includes("text")) {
				return "text";
			}
		}

		// Check by actual value type
		if (typeof feedback === "number") {
			return "progress";
		}
		if (typeof feedback === "string") {
			return "text";
		}

		return "json";
	}, [feedback, feedbackType]);

	return (
		<div className="space-y-2">
			<h4 className="text-sm font-medium text-muted-foreground">
				Feedback
			</h4>
			{displayType === "progress" && (
				<div className="space-y-1">
					<Progress
						value={Math.min(100, Math.max(0, Number(feedback)))}
						className="h-2"
					/>
					<p className="text-xs text-muted-foreground text-right">
						{Number(feedback).toFixed(1)}%
					</p>
				</div>
			)}
			{displayType === "text" && (
				<p className="text-sm bg-muted p-2 rounded-md">
					{String(feedback)}
				</p>
			)}
			{displayType === "json" && (
				<pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-32">
					{safeStringify(feedback, 2)}
				</pre>
			)}
		</div>
	);
}

// ============================================================================
// Result Display Component
// ============================================================================

interface ResultDisplayProps {
	result: unknown;
	error?: string | null;
	duration?: number | null;
	status: RemoteCallStatus;
}

function ResultDisplay({
	result,
	error,
	duration,
	status,
}: ResultDisplayProps) {
	const [collapsed, setCollapsed] = useState(false);

	if (status === "pending" || status === "executing") {
		return null;
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<h4 className="text-sm font-medium text-muted-foreground">
					Result
				</h4>
				<div className="flex items-center gap-2">
					{duration !== null && duration !== undefined && (
						<span className="text-xs text-muted-foreground">
							{duration}ms
						</span>
					)}
					<Button
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						onClick={() => setCollapsed(!collapsed)}
					>
						{collapsed ? (
							<ChevronDown className="h-4 w-4" />
						) : (
							<ChevronUp className="h-4 w-4" />
						)}
					</Button>
				</div>
			</div>

			{!collapsed && (
				<>
					{error ? (
						<div className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
							{error}
						</div>
					) : (
						<pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-48">
							{safeStringify(result, 2)}
						</pre>
					)}
				</>
			)}
		</div>
	);
}

// ============================================================================
// Call Executor Component
// ============================================================================

interface CallExecutorProps {
	definition: RemoteCallDefinition;
}

function CallExecutor({ definition }: CallExecutorProps) {
	const {
		execute,
		cancel,
		reset,
		status,
		isExecuting,
		feedback,
		error,
		lastDuration,
	} = useRemoteCall(definition);

	const [requestData, setRequestData] = useState<Record<string, unknown>>({});
	const [lastResult, setLastResult] = useState<unknown>(null);
	const [showRequestForm, setShowRequestForm] = useState(true);

	// Reset request data when definition changes
	useEffect(() => {
		setRequestData({});
		setLastResult(null);
		reset();
	}, [definition.name, definition.datasource_id]);

	const handleExecute = useCallback(async () => {
		const result = await execute(requestData);
		if (result.success) {
			setLastResult(result.data);
		}
	}, [execute, requestData]);

	const handleReset = useCallback(() => {
		setRequestData({});
		setLastResult(null);
		reset();
	}, [reset]);

	// Default schema if none provided
	const requestSchema: JsonSchema = definition.requestSchema || {
		type: "object",
		properties: {},
		additionalProperties: true,
	};

	const hasRequestFields =
		requestSchema.properties &&
		Object.keys(requestSchema.properties).length > 0;

	return (
		<div className="space-y-4">
			{/* Call Info */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<StatusBadge status={status} />
					{definition.feedbackType && (
						<Badge variant="outline" className="text-xs">
							Has Feedback
						</Badge>
					)}
					{definition.cancelable && (
						<Badge variant="outline" className="text-xs">
							Cancelable
						</Badge>
					)}
				</div>
			</div>

			{/* Request Form */}
			{hasRequestFields && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h4 className="text-sm font-medium text-muted-foreground">
							Request
						</h4>
						<Button
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0"
							onClick={() => setShowRequestForm(!showRequestForm)}
						>
							{showRequestForm ? (
								<ChevronUp className="h-4 w-4" />
							) : (
								<ChevronDown className="h-4 w-4" />
							)}
						</Button>
					</div>

					{showRequestForm && (
						<div className="border rounded-md p-3">
							<JsonForms
								schema={requestSchema}
								uischema={definition.requestUiSchema}
								data={requestData}
								renderers={shadcnRenderer}
								cells={shadcnCells}
								onChange={({ data }) =>
									setRequestData(data || {})
								}
							/>
						</div>
					)}
				</div>
			)}

			{/* Action Buttons */}
			<div className="flex items-center gap-2">
				<Button
					onClick={handleExecute}
					disabled={isExecuting}
					className="flex-1"
				>
					{isExecuting ? (
						<>
							<Loader2 className="w-4 h-4 mr-2 animate-spin" />
							Executing...
						</>
					) : (
						<>
							<Play className="w-4 h-4 mr-2" />
							Execute
						</>
					)}
				</Button>

				{cancel && isExecuting && (
					<Button variant="destructive" onClick={cancel}>
						<Square className="w-4 h-4 mr-2" />
						Cancel
					</Button>
				)}

				<Button
					variant="outline"
					onClick={handleReset}
					disabled={isExecuting}
				>
					<RefreshCw className="w-4 h-4" />
				</Button>
			</div>

			<Separator />

			{/* Feedback */}
			{definition.feedbackType && (
				<FeedbackDisplay
					feedback={feedback}
					feedbackType={definition.feedbackType}
					feedbackSchema={definition.feedbackSchema}
				/>
			)}

			{/* Result */}
			<ResultDisplay
				result={lastResult}
				error={error}
				duration={lastDuration}
				status={status}
			/>
		</div>
	);
}

// ============================================================================
// Service Card Component (Accordion-style)
// ============================================================================

interface ServiceCardProps {
	definition: RemoteCallDefinition;
	isExpanded: boolean;
	onToggle: () => void;
}

function ServiceCard({ definition, isExpanded, onToggle }: ServiceCardProps) {
	// Extract just the service name (last part after /)
	const shortName = definition.name.split("/").pop() || definition.name;

	return (
		<div className="border rounded-lg overflow-hidden">
			{/* Header - Always visible */}
			<button
				className={`w-full text-left p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors ${
					isExpanded ? "bg-muted/30 border-b" : ""
				}`}
				onClick={onToggle}
			>
				<PhoneCall className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
				<div className="flex-1 min-w-0">
					<p
						className="font-medium text-sm truncate"
						title={definition.name}
					>
						{shortName}
					</p>
					<p
						className="text-xs text-muted-foreground truncate"
						title={definition.name}
					>
						{definition.name}
					</p>
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					{definition.feedbackType && (
						<Badge variant="outline" className="text-xs">
							Action
						</Badge>
					)}
					{isExpanded ? (
						<ChevronUp className="w-4 h-4 text-muted-foreground" />
					) : (
						<ChevronDown className="w-4 h-4 text-muted-foreground" />
					)}
				</div>
			</button>

			{/* Expanded Content */}
			{isExpanded && (
				<div className="p-3 space-y-3 bg-muted/10">
					{/* Type Info */}
					<div className="text-xs space-y-1">
						<div className="flex gap-2">
							<span className="text-muted-foreground w-16">
								Request:
							</span>
							<code
								className="bg-muted px-1 rounded truncate flex-1"
								title={definition.rawRequestType}
							>
								{definition.rawRequestType || "unknown"}
							</code>
						</div>
						<div className="flex gap-2">
							<span className="text-muted-foreground w-16">
								Response:
							</span>
							<code
								className="bg-muted px-1 rounded truncate flex-1"
								title={definition.rawResponseType}
							>
								{definition.rawResponseType || "unknown"}
							</code>
						</div>
					</div>

					<Separator />

					{/* Executor */}
					<CallExecutor definition={definition} />
				</div>
			)}
		</div>
	);
}

// ============================================================================
// Main Widget Component
// ============================================================================

/**
 * Remote call explorer widget body.
 * @returns React element.
 */
function RemoteCallExplorer({}: RemoteCallWidgetProps) {
	// Use the event-driven atom-based hook - no polling needed!
	const { calls, count, isEmpty } = useAvailableRemoteCalls();
	const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

	// Group calls by datasource
	const groupedCalls = useMemo(() => {
		const groups = new Map<string, RemoteCallDefinition[]>();
		for (const call of calls) {
			const key = call.source?.title || call.datasource_id;
			if (!groups.has(key)) {
				groups.set(key, []);
			}
			groups.get(key)!.push(call);
		}
		return groups;
	}, [calls]);

	// Clear selection if expanded call is no longer available
	useEffect(() => {
		if (expandedCallId) {
			const [dsId, ...nameParts] = expandedCallId.split("::");
			const name = nameParts.join("::");
			const stillExists = calls.some(
				(c) => c.name === name && c.datasource_id === dsId,
			);
			if (!stillExists) {
				setExpandedCallId(null);
			}
		}
	}, [calls, expandedCallId]);

	const getCallId = (call: RemoteCallDefinition) =>
		`${call.datasource_id}::${call.name}`;

	const handleToggle = (call: RemoteCallDefinition) => {
		const callId = getCallId(call);
		setExpandedCallId((prev) => (prev === callId ? null : callId));
	};

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* Header */}
			<div className="p-3 border-b flex items-center justify-between flex-shrink-0">
				<div className="flex items-center gap-2">
					<h3 className="font-semibold">Remote Calls</h3>
					<Badge variant="secondary">{count}</Badge>
				</div>
				<Badge variant="outline" className="text-xs">
					{isEmpty ? "No datasources" : "Live"}
				</Badge>
			</div>

			{/* Service List */}
			<div className="flex-1 min-h-0 overflow-auto">
				<div className="p-3 space-y-4">
					{Array.from(groupedCalls.entries()).map(
						([datasource, dsCalls]) => (
							<div key={datasource} className="space-y-2">
								{/* Datasource Header */}
								<div className="flex items-center gap-2 px-1">
									<div className="h-px flex-1 bg-border" />
									<span className="text-xs font-medium text-muted-foreground">
										{datasource}
									</span>
									<Badge
										variant="secondary"
										className="text-xs"
									>
										{dsCalls.length}
									</Badge>
									<div className="h-px flex-1 bg-border" />
								</div>

								{/* Service Cards */}
								<div className="space-y-2">
									{dsCalls.map((call) => (
										<ServiceCard
											key={getCallId(call)}
											definition={call}
											isExpanded={
												expandedCallId ===
												getCallId(call)
											}
											onToggle={() => handleToggle(call)}
										/>
									))}
								</div>
							</div>
						),
					)}

					{isEmpty && (
						<div className="text-center text-muted-foreground py-12">
							<PhoneCall className="w-12 h-12 mx-auto mb-3 opacity-30" />
							<p className="font-medium">
								No remote calls available
							</p>
							<p className="text-xs mt-1">
								Connect a datasource with services
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// Widget Definition
// ============================================================================

/**
 * Widget definition for remote call explorer.
 * @returns Widget definition.
 */
export function RemoteCallExplorerDefinition(): WidgetDefinition {
	return {
		id: "remote-call-explorer-widget",
		name: "Remote Call Explorer",
		description:
			"List and execute available remote calls (services/actions)",
		titleProp: "title",
		icon: <PhoneCall />,

		schema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					title: "Title",
				},
			},
			required: ["title"],
		},

		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
			],
		} as VerticalLayout,

		data: {
			title: "Remote Calls",
		},

		Component: (data: RemoteCallWidgetProps) => (
			<RemoteCallExplorer {...data} />
		),
	} as WidgetDefinition;
}

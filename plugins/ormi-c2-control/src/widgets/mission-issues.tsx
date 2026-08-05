"use client";

import { AlertTriangle, XCircle } from "lucide-react";

import { MissionConfigIssue } from "../types/mission-config-validation";

/**
 * Shared presentational helper for rendering mission-config validation issues
 * (used by F4 mission browser and F8 control panel). Module-level stable
 * component (Pattern #10). Purely presentational — no validation logic here.
 */

/** Props for {@link MissionIssueList}. */
interface MissionIssueListProps {
	issues: MissionConfigIssue[];
	/** Optional heading shown above the list. */
	title?: string;
}

/**
 * Render a list of validation issues, errors first, each with its JSON path and
 * operator-facing message. Renders nothing when there are no issues.
 */
const MissionIssueList: React.FC<MissionIssueListProps> = ({
	issues,
	title,
}) => {
	if (issues.length === 0) return null;

	const errors = issues.filter((i) => i.severity === "error");
	const warnings = issues.filter((i) => i.severity === "warning");
	const ordered = [...errors, ...warnings];

	return (
		<div className="text-xs rounded-md border border-destructive/40 bg-destructive/5 p-2 shrink-0 flex flex-col gap-1">
			{title && (
				<div className="font-medium text-destructive">{title}</div>
			)}
			<ul className="flex flex-col gap-1">
				{ordered.map((issue, index) => {
					const isError = issue.severity === "error";
					return (
						<li
							key={`${issue.severity}-${issue.path}-${index}`}
							className={`flex items-start gap-1.5 ${
								isError ? "text-destructive" : "text-warning"
							}`}
						>
							{isError ? (
								<XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
							) : (
								<AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
							)}
							<span className="min-w-0">
								{issue.path && (
									<code className="font-mono opacity-80">
										{issue.path}
									</code>
								)}
								{issue.path && " — "}
								{issue.message}
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
};

export { MissionIssueList };

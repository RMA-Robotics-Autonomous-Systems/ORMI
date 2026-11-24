"use client";

import { Button } from "@workspace/ui/components/button";
import { Undo2, X } from "lucide-react";

import { useMissionUndoState } from "../state/mission-history-store";
import { undoMission } from "../state/mission-undo";
import { isUndoNoticeLive, type UndoNotice } from "./undo-notice";

/**
 * "Deleted 3 steps", with Undo: shown while the deletion is still the step
 * on top of the mission's history ({@link isUndoNoticeLive}), and gone the
 * moment anything else is done to the mission.
 *
 * @param props.notice - The deletion, or null.
 * @param props.missionId - The mission shown: a notice of another one is not shown.
 * @param props.frozen - View only: the history is frozen, Undo is disabled.
 * @param props.onDismiss - Close the notice.
 * @param props.className - Placement and surface.
 */
export function UndoNoticeBar(props: {
	notice: UndoNotice | null;
	missionId: string | null | undefined;
	frozen?: boolean;
	onDismiss: () => void;
	className?: string;
}) {
	const history = useMissionUndoState(props.missionId);
	const { notice, onDismiss } = props;
	if (!isUndoNoticeLive(notice, props.missionId, history)) return null;
	return (
		<div
			role="status"
			aria-label="Deleted"
			className={`flex items-center gap-2 text-xs ${props.className ?? ""}`}
		>
			<span className="min-w-0 flex-1 truncate">{notice.text}</span>
			<Button
				size="sm"
				variant="outline"
				className="h-7 any-pointer-coarse:min-h-11"
				aria-label="Undo deletion"
				disabled={props.frozen}
				onClick={() => {
					undoMission(notice.missionId);
					onDismiss();
				}}
			>
				<Undo2 />
				Undo
			</Button>
			<Button
				size="icon-sm"
				variant="ghost"
				className="any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11"
				aria-label="Dismiss"
				onClick={onDismiss}
			>
				<X />
			</Button>
		</div>
	);
}

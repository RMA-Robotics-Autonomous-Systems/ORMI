"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@workspace/ui/components/hover-card";

import type { DatasourceTopic } from "../../../datasources/datasource-interface";
import {
	resolveTopicPreview,
	type TopicPreviewRegistry,
} from "./topic-preview-registry";

/** Delay before a hover is taken as intent to preview. */
const SHOW_DELAY_MS = 100;

/** How long the card stays mounted after the pointer leaves. */
const HIDE_DELAY_MS = 500;

/** Props for {@link TopicPreviewHover}. */
export interface TopicPreviewHoverProps {
	/** Topic the row describes. */
	topic: DatasourceTopic;
	/** Previews contributed by plugins. */
	previews: TopicPreviewRegistry;
}

/**
 * The topic name, with a live preview of the topic behind a hover.
 *
 * A preview is a real widget — an image decoder, a chart, a point-cloud scene —
 * and mounting one subscribes to the topic. The card is therefore not merely
 * hidden until hover: it is not **mounted** until the pointer has rested on the
 * row, or a list of two hundred topics would subscribe to two hundred streams
 * to render a table. It stays mounted briefly after the pointer leaves so
 * moving into the card does not tear the subscription down and rebuild it.
 *
 * @param props - Component props.
 * @returns React element.
 */
export const TopicPreviewHover: React.FC<TopicPreviewHoverProps> = ({
	topic,
	previews,
}) => {
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (showTimer.current) clearTimeout(showTimer.current);
			if (hideTimer.current) clearTimeout(hideTimer.current);
			showTimer.current = null;
			hideTimer.current = null;
		};
	}, []);

	const handleEnter = useCallback(() => {
		if (hideTimer.current) {
			clearTimeout(hideTimer.current);
			hideTimer.current = null;
		}
		setOpen(true);
		if (showTimer.current) clearTimeout(showTimer.current);
		showTimer.current = setTimeout(() => {
			setMounted(true);
			showTimer.current = null;
		}, SHOW_DELAY_MS);
	}, []);

	const handleLeave = useCallback(() => {
		setOpen(false);
		if (showTimer.current) {
			clearTimeout(showTimer.current);
			showTimer.current = null;
		}
		if (hideTimer.current) clearTimeout(hideTimer.current);
		hideTimer.current = setTimeout(() => {
			setMounted(false);
			hideTimer.current = null;
		}, HIDE_DELAY_MS);
	}, []);

	const preview = resolveTopicPreview(previews, topic);

	const label = (
		<span className="flex min-w-0 items-center gap-2">
			<span className="min-w-0 truncate" title={topic.topic}>
				{topic.topic}
			</span>
			{preview ? (
				<Info
					className="text-muted-foreground size-3 shrink-0"
					aria-hidden
				/>
			) : null}
		</span>
	);

	if (!preview) return label;

	return (
		<span
			className="inline-flex min-w-0 cursor-pointer items-center gap-2"
			onMouseEnter={handleEnter}
			onMouseLeave={handleLeave}
		>
			{mounted ? (
				<HoverCard open={open} openDelay={200}>
					<HoverCardTrigger asChild>{label}</HoverCardTrigger>
					<HoverCardContent
						side="right"
						style={{
							width: "min(400px, 90vw)",
							minHeight: preview.minHeight,
						}}
					>
						{preview.component(topic)}
					</HoverCardContent>
				</HoverCard>
			) : (
				label
			)}
		</span>
	);
};

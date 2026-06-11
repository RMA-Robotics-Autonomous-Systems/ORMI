"use client";

import React, { useMemo } from "react";
import { withJsonFormsControlProps } from "@jsonforms/react";
import {
	ControlProps,
	rankWith,
	isControl,
	and,
	uiTypeIs,
} from "@jsonforms/core";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import type { TransformEdge } from "@workspace/ormi-core/types";
import {
	useTransformEdges,
	frameRawName,
} from "@workspace/ormi-core/transforms";

/**
 * Collect selectable (bare) frame names from the transform edges.
 *
 * Keys are namespaced `${source}::${frame}`, but the picker shows/stores bare names; a bare
 * selection resolves back to the right edge via raw-name matching. Unobserved parents
 * (e.g. a fixed "map" root) are included so they remain selectable.
 *
 * @param edges - Transform edges.
 * @returns Sorted, de-duplicated bare frame names.
 */
const collectFrames = (edges: TransformEdge[]): string[] => {
	const frames: string[] = [];
	for (const edge of edges) {
		frames.push(edge.rawFrameId);
		if (edge.parentId && edge.parentId !== "") {
			frames.push(frameRawName(edge.parentId));
		}
	}
	return Array.from(new Set(frames)).sort();
};

/**
 * JsonForms renderer for selecting a transform frame.
 * @param props - JsonForms control props.
 * @returns React element.
 */
const FrameSelectRenderer = (props: ControlProps) => {
	const { data, handleChange, path, uischema, label } = props;
	const edges = useTransformEdges();

	const placeholder = uischema.options?.placeholder || "Select frame";

	const frames = useMemo(() => collectFrames(edges), [edges]);

	const currentValue = useMemo(
		() => (typeof data === "string" ? data : ""),
		[data],
	);

	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Select
				value={currentValue}
				onValueChange={(value) => handleChange(path, value)}
			>
				<SelectTrigger>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{frames.map((frame) => (
						<SelectItem key={frame} value={frame}>
							{frame}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
};

export default withJsonFormsControlProps(FrameSelectRenderer);

/** JsonForms tester for the FrameSelect UI schema type. */
const frameSelectTester = rankWith(10, and(isControl, uiTypeIs("FrameSelect")));

export { frameSelectTester };

"use client";

import React from "react";
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
import { useTransformFrameIds } from "@workspace/ormi-core/transforms";

/**
 * JsonForms renderer for selecting a transform frame.
 * @param props - JsonForms control props.
 * @returns React element.
 */
const FrameSelectRenderer = (props: ControlProps) => {
	const { data, handleChange, path, uischema, label } = props;
	const frames = useTransformFrameIds();

	const placeholder = uischema.options?.placeholder || "Select frame";
	const currentValue = typeof data === "string" ? data : "";

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

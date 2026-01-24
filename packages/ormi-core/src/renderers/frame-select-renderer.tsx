"use client";

import React, { useMemo } from "react";
import { withJsonFormsControlProps } from "@jsonforms/react";
import { ControlProps, rankWith, isControl, and, uiTypeIs } from "@jsonforms/core";
import { Label } from "@workspace/ui/components/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@workspace/ui/components/select";
import { TransformTree } from "@workspace/ormi-core/types";
import { useTransformSource } from "@workspace/ormi-core/transforms";

const collectFrames = (trees: Map<string, TransformTree>): string[] => {
    const frames: string[] = [];

    const walk = (node: TransformTree) => {
        frames.push(node.id);
        node.children.forEach(walk);
    };

    trees.forEach((tree) => walk(tree));

    return Array.from(new Set(frames)).sort();
};

const FrameSelectRenderer = (props: ControlProps) => {
    const { data, handleChange, path, uischema, label } = props;
    const { transformsTrees } = useTransformSource();

    const placeholder = uischema.options?.placeholder || "Select frame";

    const frames = useMemo(() => collectFrames(transformsTrees), [transformsTrees]);

    const currentValue = useMemo(() => (typeof data === "string" ? data : ""), [data]);

    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Select value={currentValue} onValueChange={(value) => handleChange(path, value)}>
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

const frameSelectTester = rankWith(10, and(isControl, uiTypeIs("FrameSelect")));

export { frameSelectTester };
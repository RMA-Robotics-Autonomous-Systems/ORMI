"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import { TransformTree } from "@workspace/ormi-core/types";

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
  const pluginsManager = usePluginsManager();
  const [frames, setFrames] = useState<string[]>([]);

  const placeholder = uischema.options?.placeholder || "Select frame";

  useEffect(() => {
    let isMounted = true;

    const fetchFrames = async () => {
      try {
        const trees = await pluginsManager.applyFilterAsync<Map<string, TransformTree>>(
          PluginsHooks.TRANSFORM_TREE,
          new Map<string, TransformTree>()
        );

        if (!isMounted || !trees) return;
        setFrames(collectFrames(trees));
      } catch (error) {
        console.error("Error fetching transform frames:", error);
      }
    };

    fetchFrames();
    const intervalId = setInterval(fetchFrames, 1000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [pluginsManager]);

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
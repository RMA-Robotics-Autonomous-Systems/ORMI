"use client";

import React, { useCallback, useRef } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import type { FilterConfig } from "../filters/filter-types";

interface VisualizationPreset {
	selectedTopics: string[];
	gpsTopicName: string;
	filterConfig: FilterConfig;
}

interface PresetControlsProps {
	config: VisualizationPreset;
	onLoad: (config: VisualizationPreset) => void;
}

export function PresetControls({ config, onLoad }: PresetControlsProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSave = useCallback(() => {
		const json = JSON.stringify(config, null, 2);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "emi-bag-preset.json";
		a.click();
		URL.revokeObjectURL(url);
	}, [config]);

	const handleLoad = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (ev) => {
				try {
					const preset = JSON.parse(
						ev.target?.result as string,
					) as VisualizationPreset;
					onLoad(preset);
				} catch {
					// ignore malformed files
				}
			};
			reader.readAsText(file);
			// Reset input so the same file can be loaded again
			e.target.value = "";
		},
		[onLoad],
	);

	return (
		<div className="flex gap-2">
			<Button variant="outline" size="sm" onClick={handleSave}>
				<Download className="mr-1 h-3 w-3" />
				Save preset
			</Button>
			<Button
				variant="outline"
				size="sm"
				onClick={() => inputRef.current?.click()}
			>
				<Upload className="mr-1 h-3 w-3" />
				Load preset
			</Button>
			<input
				ref={inputRef}
				type="file"
				accept=".json"
				className="hidden"
				onChange={handleLoad}
			/>
		</div>
	);
}

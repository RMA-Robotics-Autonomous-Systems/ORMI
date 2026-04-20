"use client";

import React from "react";
import type { FilterConfig } from "../filters/filter-types";
import { Label } from "@workspace/ui/components/label";
import { Slider } from "@workspace/ui/components/slider";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";

interface FilterControlsProps {
	config: FilterConfig;
	onChange: (config: FilterConfig) => void;
}

export function FilterControls({ config, onChange }: FilterControlsProps) {
	const set = <K extends keyof FilterConfig>(
		key: K,
		value: FilterConfig[K],
	) => onChange({ ...config, [key]: value });

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm">Filter</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<Label className="text-xs text-muted-foreground">
						Type
					</Label>
					<Select
						value={config.kind}
						onValueChange={(v) =>
							set("kind", v as FilterConfig["kind"])
						}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">None (raw)</SelectItem>
							<SelectItem value="lowpass">
								Lowpass (EMA)
							</SelectItem>
							<SelectItem value="kalman">Kalman</SelectItem>
							<SelectItem value="dezerolizer">
								Dezerolizer
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{config.kind === "lowpass" && (
					<SliderRow
						label={`Alpha — ${config.lowpassAlpha.toFixed(2)}`}
						value={config.lowpassAlpha}
						min={0.01}
						max={1}
						step={0.01}
						onChange={(v) => set("lowpassAlpha", v)}
					/>
				)}

				{config.kind === "kalman" && (
					<>
						<SliderRow
							label={`Process noise — ${config.kalmanProcessNoise.toFixed(1)}`}
							value={config.kalmanProcessNoise}
							min={0.1}
							max={100}
							step={0.1}
							onChange={(v) => set("kalmanProcessNoise", v)}
						/>
						<SliderRow
							label={`Measurement noise — ${config.kalmanMeasurementNoise.toFixed(2)}`}
							value={config.kalmanMeasurementNoise}
							min={0.1}
							max={100}
							step={0.01}
							onChange={(v) => set("kalmanMeasurementNoise", v)}
						/>
						<SliderRow
							label={`Initial covariance — ${config.kalmanInitialCovariance.toFixed(0)}`}
							value={config.kalmanInitialCovariance}
							min={1}
							max={1000}
							step={1}
							onChange={(v) => set("kalmanInitialCovariance", v)}
						/>
					</>
				)}

				{config.kind === "dezerolizer" && (
					<SliderRow
						label={`Decay — ${config.dezeroliserDecay.toFixed(2)}`}
						value={config.dezeroliserDecay}
						min={0.5}
						max={0.999}
						step={0.001}
						onChange={(v) => set("dezeroliserDecay", v)}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function SliderRow({
	label,
	value,
	min,
	max,
	step,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			<Label className="text-xs text-muted-foreground">{label}</Label>
			<Slider
				value={[value]}
				min={min}
				max={max}
				step={step}
				onValueChange={([v]) => v !== undefined && onChange(v)}
			/>
		</div>
	);
}

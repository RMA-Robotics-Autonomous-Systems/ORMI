"use client";

import React from "react";
import type {
	CUSUMConfig,
	DetectionConfig,
	MADConfig,
	RSDConfig,
} from "../../algorithms/detection-types";
import { Slider } from "@workspace/ui/components/slider";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";

interface SliderRowProps {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (v: number) => void;
	disabled?: boolean;
	fmt?: (v: number) => string;
}

function SliderRow({
	label,
	value,
	min,
	max,
	step = 1,
	onChange,
	disabled,
	fmt,
}: SliderRowProps) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex justify-between text-xs">
				<span className="text-muted-foreground">{label}</span>
				<span className="font-mono">{fmt ? fmt(value) : value}</span>
			</div>
			<Slider
				value={[value]}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				onValueChange={([v]) => onChange(v!)}
			/>
		</div>
	);
}

function SelectRow({
	label,
	value,
	options,
	onChange,
	disabled,
}: {
	label: string;
	value: string;
	options: string[];
	onChange: (v: string) => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex items-center gap-2 text-xs">
			<span className="w-24 shrink-0 text-muted-foreground">{label}</span>
			<Select value={value} onValueChange={onChange} disabled={disabled}>
				<SelectTrigger className="h-7 flex-1 text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o} value={o}>
							{o}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function AlgoSection({
	title,
	config,
	onChange,
	enabled,
}: {
	title: string;
	config: MADConfig | RSDConfig;
	onChange: (patch: Partial<MADConfig>) => void;
	enabled: boolean;
}) {
	return (
		<Card>
			<CardContent className="pt-4 flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<Switch
						checked={config.enabled}
						onCheckedChange={(v) => onChange({ enabled: v })}
						disabled={!enabled}
						id={`algo-${title}`}
					/>
					<Label
						htmlFor={`algo-${title}`}
						className="text-sm font-medium"
					>
						{title}
					</Label>
				</div>
				{config.enabled && enabled && (
					<>
						<SliderRow
							label="Baseline"
							value={config.baselineSize}
							min={64}
							max={2048}
							step={64}
							onChange={(v) => onChange({ baselineSize: v })}
						/>
						<SliderRow
							label="Window"
							value={config.detectionSize}
							min={4}
							max={128}
							step={4}
							onChange={(v) => onChange({ detectionSize: v })}
						/>
						<SliderRow
							label="Threshold"
							value={config.threshold}
							min={0.1}
							max={100}
							step={0.1}
							onChange={(v) => onChange({ threshold: v })}
							fmt={(v) => v.toFixed(1)}
						/>
						<SliderRow
							label="Min samples"
							value={config.minSamples}
							min={32}
							max={512}
							step={32}
							onChange={(v) => onChange({ minSamples: v })}
						/>
						<SliderRow
							label="Cooldown (samples)"
							value={config.cooldownSamples}
							min={0}
							max={300}
							step={5}
							onChange={(v) => onChange({ cooldownSamples: v })}
						/>
						{"detectionPercentile" in config && (
							<SliderRow
								label="Detection pctile"
								value={
									(config as MADConfig).detectionPercentile
								}
								min={0.5}
								max={1}
								step={0.05}
								onChange={(v) =>
									onChange({
										detectionPercentile: v,
									} as Partial<MADConfig>)
								}
								fmt={(v) => `${Math.round(v * 100)}%`}
							/>
						)}
						<div className="flex items-center gap-2">
							<Checkbox
								id={`show-internals-${title}`}
								checked={config.showInternals}
								onCheckedChange={(v) =>
									onChange({ showInternals: Boolean(v) })
								}
							/>
							<Label
								htmlFor={`show-internals-${title}`}
								className="text-xs text-muted-foreground"
							>
								Show threshold / deviation
							</Label>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}

interface DetectionPanelProps {
	config: DetectionConfig;
	onChange: (patch: Partial<DetectionConfig>) => void;
}

const FILTER_TYPES = ["none", "lowpass", "kalman", "dezerolizer"];

export function DetectionPanel({ config, onChange }: DetectionPanelProps) {
	const {
		enabled,
		filterType,
		filterParams,
		showFiltered,
		mad,
		rsd,
		clustering,
	} = config;

	const patchMad = (patch: Partial<MADConfig>) =>
		onChange({ mad: { ...mad, ...patch } });
	const patchRsd = (patch: Partial<RSDConfig>) =>
		onChange({ rsd: { ...rsd, ...patch } });
	const patchCusum = (patch: Partial<CUSUMConfig>) =>
		onChange({ cusum: { ...config.cusum, ...patch } });
	const patchFilter = (patch: Partial<typeof filterParams>) =>
		onChange({ filterParams: { ...filterParams, ...patch } });
	const patchCluster = (patch: Partial<typeof clustering>) =>
		onChange({ clustering: { ...clustering, ...patch } });

	return (
		<div className="flex flex-col gap-3">
			{/* Master toggle */}
			<div className="flex items-center gap-2">
				<Switch
					id="enable-detection"
					checked={enabled}
					onCheckedChange={(v) => onChange({ enabled: v })}
				/>
				<Label
					htmlFor="enable-detection"
					className="font-medium text-sm"
				>
					Enable detection
				</Label>
			</div>

			{/* Pre-processing filter */}
			<Card>
				<CardContent className="pt-4 flex flex-col gap-2">
					<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
						Pre-processing filter
					</p>
					<SelectRow
						label="Filter"
						value={filterType}
						options={FILTER_TYPES}
						onChange={(v) =>
							onChange({
								filterType: v as DetectionConfig["filterType"],
							})
						}
						disabled={!enabled}
					/>
					{enabled && filterType === "lowpass" && (
						<SliderRow
							label="Alpha"
							value={filterParams.lowpassAlpha}
							min={0.01}
							max={1}
							step={0.01}
							onChange={(v) => patchFilter({ lowpassAlpha: v })}
							fmt={(v) => v.toFixed(2)}
						/>
					)}
					{enabled && filterType === "kalman" && (
						<>
							<SliderRow
								label="Process noise"
								value={filterParams.kalmanProcessNoise}
								min={0.1}
								max={100}
								step={0.1}
								onChange={(v) =>
									patchFilter({ kalmanProcessNoise: v })
								}
								fmt={(v) => v.toFixed(1)}
							/>
							<SliderRow
								label="Meas. noise"
								value={filterParams.kalmanMeasurementNoise}
								min={0.1}
								max={100}
								step={0.1}
								onChange={(v) =>
									patchFilter({ kalmanMeasurementNoise: v })
								}
								fmt={(v) => v.toFixed(1)}
							/>
						</>
					)}
					{enabled && filterType === "dezerolizer" && (
						<SliderRow
							label="Decay"
							value={filterParams.dezeroliserDecay}
							min={0.8}
							max={1}
							step={0.01}
							onChange={(v) =>
								patchFilter({ dezeroliserDecay: v })
							}
							fmt={(v) => v.toFixed(2)}
						/>
					)}
					{enabled && filterType !== "none" && (
						<div className="flex items-center gap-2">
							<Checkbox
								id="show-filtered"
								checked={showFiltered}
								onCheckedChange={(v) =>
									onChange({ showFiltered: Boolean(v) })
								}
							/>
							<Label
								htmlFor="show-filtered"
								className="text-xs text-muted-foreground"
							>
								Show filtered signal
							</Label>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Algorithms */}
			<AlgoSection
				title="MAD"
				config={mad}
				onChange={patchMad}
				enabled={enabled}
			/>
			<AlgoSection
				title="RSD"
				config={rsd}
				onChange={patchRsd}
				enabled={enabled}
			/>

			{/* CUSUM */}
			<Card>
				<CardContent className="pt-4 flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Switch
							id="cusum-enabled"
							checked={config.cusum.enabled}
							onCheckedChange={(v) => patchCusum({ enabled: v })}
							disabled={!enabled}
						/>
						<Label
							htmlFor="cusum-enabled"
							className="text-sm font-medium"
						>
							CUSUM
						</Label>
					</div>
					{config.cusum.enabled && enabled && (
						<>
							<SliderRow
								label="Baseline"
								value={config.cusum.baselineSize}
								min={64}
								max={1024}
								step={32}
								onChange={(v) =>
									patchCusum({ baselineSize: v })
								}
							/>
							<SliderRow
								label="Min samples"
								value={config.cusum.minSamples}
								min={32}
								max={512}
								step={32}
								onChange={(v) => patchCusum({ minSamples: v })}
							/>
							<SliderRow
								label="Slack factor"
								value={config.cusum.slackFactor}
								min={0.1}
								max={2}
								step={0.1}
								onChange={(v) => patchCusum({ slackFactor: v })}
								fmt={(v) => v.toFixed(1)}
							/>
							<SliderRow
								label="Threshold (σ)"
								value={config.cusum.threshold}
								min={0.5}
								max={20}
								step={0.5}
								onChange={(v) => patchCusum({ threshold: v })}
								fmt={(v) => v.toFixed(1)}
							/>
							<SliderRow
								label="Cooldown (samples)"
								value={config.cusum.cooldownSamples}
								min={0}
								max={300}
								step={5}
								onChange={(v) =>
									patchCusum({ cooldownSamples: v })
								}
							/>
							<div className="flex items-center gap-2">
								<Checkbox
									id="show-cusum-internals"
									checked={config.cusum.showInternals}
									onCheckedChange={(v) =>
										patchCusum({
											showInternals: Boolean(v),
										})
									}
								/>
								<Label
									htmlFor="show-cusum-internals"
									className="text-xs text-muted-foreground"
								>
									Show accumulator / threshold
								</Label>
							</div>
						</>
					)}
				</CardContent>
			</Card>

			{/* Clustering */}
			<Card>
				<CardContent className="pt-4 flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Switch
							id="clustering-enabled"
							checked={clustering.enabled}
							onCheckedChange={(v) =>
								patchCluster({ enabled: v })
							}
							disabled={!enabled}
						/>
						<Label
							htmlFor="clustering-enabled"
							className="text-xs font-semibold"
						>
							Event clustering
						</Label>
					</div>
					{clustering.enabled && enabled && (
						<>
							<SliderRow
								label="Time gap (s)"
								value={clustering.timeThresholdMs / 1000}
								min={0.5}
								max={30}
								step={0.5}
								onChange={(v) =>
									patchCluster({ timeThresholdMs: v * 1000 })
								}
								fmt={(v) => v.toFixed(1)}
							/>
							<SliderRow
								label="Distance (m)"
								value={clustering.distanceThresholdM}
								min={1}
								max={100}
								step={1}
								onChange={(v) =>
									patchCluster({ distanceThresholdM: v })
								}
							/>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

"use client";

import React from "react";
import type {
	DetectionConfig,
	MADConfig,
	RSDConfig,
} from "../../algorithms/detection-types";

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
		<label className="flex flex-col gap-0.5">
			<span className="flex justify-between text-xs">
				<span className="text-muted-foreground">{label}</span>
				<span className="font-mono">{fmt ? fmt(value) : value}</span>
			</span>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(Number(e.target.value))}
				className="accent-blue-500 disabled:opacity-40"
			/>
		</label>
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
		<label className="flex items-center gap-2 text-xs">
			<span className="w-24 shrink-0 text-muted-foreground">{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				className="flex-1 rounded border bg-background px-1 py-0.5 text-xs disabled:opacity-40"
			>
				{options.map((o) => (
					<option key={o} value={o}>
						{o}
					</option>
				))}
			</select>
		</label>
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
		<div className="rounded border p-2 flex flex-col gap-1">
			<label className="flex items-center gap-2 text-sm font-medium">
				<input
					type="checkbox"
					checked={config.enabled}
					onChange={(e) => onChange({ enabled: e.target.checked })}
					className="accent-blue-500"
					disabled={!enabled}
				/>
				{title}
			</label>
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
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							checked={config.showInternals}
							onChange={(e) =>
								onChange({ showInternals: e.target.checked })
							}
							className="accent-blue-500"
						/>
						Show threshold / deviation
					</label>
				</>
			)}
		</div>
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
	const patchFilter = (patch: Partial<typeof filterParams>) =>
		onChange({ filterParams: { ...filterParams, ...patch } });
	const patchCluster = (patch: Partial<typeof clustering>) =>
		onChange({ clustering: { ...clustering, ...patch } });

	return (
		<div className="flex flex-col gap-3">
			{/* Master toggle */}
			<label className="flex items-center gap-2 font-medium text-sm">
				<input
					type="checkbox"
					checked={enabled}
					onChange={(e) => onChange({ enabled: e.target.checked })}
					className="accent-blue-500"
				/>
				Enable detection
			</label>

			{/* Pre-processing filter */}
			<div className="rounded border p-2 flex flex-col gap-1.5">
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
						onChange={(v) => patchFilter({ dezeroliserDecay: v })}
						fmt={(v) => v.toFixed(2)}
					/>
				)}
				{enabled && filterType !== "none" && (
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							checked={showFiltered}
							onChange={(e) =>
								onChange({ showFiltered: e.target.checked })
							}
							className="accent-blue-500"
						/>
						Show filtered signal
					</label>
				)}
			</div>

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

			{/* Clustering */}
			<div className="rounded border p-2 flex flex-col gap-1.5">
				<label className="flex items-center gap-2 text-xs font-semibold">
					<input
						type="checkbox"
						checked={clustering.enabled}
						onChange={(e) =>
							patchCluster({ enabled: e.target.checked })
						}
						className="accent-blue-500"
						disabled={!enabled}
					/>
					Event clustering
				</label>
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
			</div>
		</div>
	);
}

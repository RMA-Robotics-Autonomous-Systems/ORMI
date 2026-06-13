/**
 * Imperative point-cloud layer for the 3D scene engine.
 *
 * Owns a `THREE.Points` object, its streamed `BufferGeometry`, a themed
 * `ShaderMaterial`, and either a {@link RingPointBuffer} (rolling accumulation)
 * or grow-only scratch arrays (latest-message mode). The three engine planes
 * stay disjoint:
 *
 * - {@link PointCloudLayer.ingest} writes the typed vertex buffers only.
 * - {@link PointCloudLayer.resolveTransform} writes the `pointTransform` shader
 *   uniform only (chain collapse), never touching buffers.
 * - {@link PointCloudLayer.flush} performs the partial GPU upload and refreshes
 *   the decay-time uniform on demanded frames.
 *
 * The geometry's transform is applied in the vertex shader, so frustum culling
 * is disabled and a permanent coarse bounding sphere stands in for CPU bounds.
 */

import * as THREE from "three";
import type {
	PointsCloud,
	Transform,
	TransformTable,
} from "@workspace/ormi-core/types";
import { findTransformChain } from "@workspace/ormi-core/transforms";
import { RingPointBuffer, metrics } from "@workspace/utils";
import { themeShaders } from "../../utils/theme-shaders";
import { buildTransformMatrix } from "../transform-resolve";
import {
	applyWriteSpans,
	clampRollingCapacity,
	nextPowerOfTwo,
	setStreamedAttributes,
} from "../streamed-geometry";
import { qualifyFrame } from "../../components/scene-transform-context";
import { SCENE3D } from "../scene-metrics";
import type {
	LayerDirty,
	LayerSample,
	LayerTransformStatus,
	SceneLayer,
} from "../scene-layer";
import type { PointCloudTheme } from "../../types/scene-3d-types";

/** Seconds of relative time before the rolling buffer rebases for float32 precision. */
const TIME_RESET_SECONDS = 300;

/** Grow-only scratch buffers for the latest-message (non-rolling) path. */
interface NonRollingScratch {
	positions: Float32Array | null;
	colors: Float32Array | null;
	intensities: Float32Array | null;
	timestamps: Float32Array | null;
	capacity: number;
	count: number;
}

/**
 * Primitive, human-rate configuration for a point-cloud layer. The bridge
 * destructures these from the widget config and passes only primitives, so a
 * change is a real dependency rather than an object-identity churn.
 */
export interface PointCloudLayerSetConfig {
	pointSize: number;
	decayTime: number;
	rollingBuffer: boolean;
	theme: PointCloudTheme;
	colorMode: "source" | "reflectivity";
	customColor: string;
	useTransparency: boolean;
	maxPoints: number | undefined;
	/** Target frame all layers resolve into (the scene's data target frame). */
	targetFrame: string;
	/** Datasource id owning the topic, used to qualify the reference frame. */
	datasourceId?: string;
	/** Optional deduped status sink for the control-panel badge. */
	onStatus?: (status: LayerTransformStatus) => void;
}

export class PointCloudLayer implements SceneLayer {
	readonly id: string;
	readonly kind = "pointcloud" as const;
	readonly object3d: THREE.Points;
	readonly topicKey: string | null;

	private readonly geometry: THREE.BufferGeometry;
	private readonly material: THREE.ShaderMaterial;

	private geometryDirty = false;
	private readonly transform = new THREE.Matrix4();
	private readonly customColorScratch = new THREE.Color();

	private rollingRing: RingPointBuffer | null = null;
	private readonly nonRolling: NonRollingScratch = {
		positions: null,
		colors: null,
		intensities: null,
		timestamps: null,
		capacity: 0,
		count: 0,
	};
	// Grow-only fill arrays reused for messages missing colors / intensities.
	private fillColors: Float32Array | null = null;
	private fillIntensities: Float32Array | null = null;

	private lastProcessedTime = 0;
	private startTime = 0;

	// Config state (human-rate), applied by setConfig.
	private pointSize = 0.05;
	private decayTime = 0;
	private rollingBuffer = false;
	private rollingCapacity = clampRollingCapacity(undefined);
	private theme: PointCloudTheme = "Default";
	private useTransparency = false;
	private customColor = "#ffffff";
	private colorMode: "source" | "reflectivity" = "source";
	private targetFrame = "";
	private datasourceId: string | undefined = undefined;
	private onStatus: ((status: LayerTransformStatus) => void) | undefined;
	private lastStatus: LayerTransformStatus | null = null;

	// Latest TF inputs, cached so ingest can re-resolve on first-data / frame change.
	private tableRef: TransformTable | null = null;
	private hasData = false;
	private refFrame = "";

	private disposed = false;

	constructor(id: string, topicKey: string) {
		this.id = id;
		this.topicKey = topicKey;

		this.startTime = Date.now();

		const geometry = new THREE.BufferGeometry();
		geometry.setDrawRange(0, 0);
		// Empty placeholders until the first ingest binds the real arrays.
		setStreamedAttributes(geometry, {
			positions: new Float32Array(0),
			colors: new Float32Array(0),
			intensities: new Float32Array(0),
			timestamps: new Float32Array(0),
		});
		// The TF is applied in the vertex shader, so CPU-side bounds cannot track
		// what is drawn. Use a permanent coarse sphere instead of recomputing per
		// upload; frustum culling is disabled on the points object.
		geometry.boundingSphere = new THREE.Sphere(
			new THREE.Vector3(0, 0, 0),
			1e9,
		);
		this.geometry = geometry;

		const shaders =
			themeShaders[this.theme as keyof typeof themeShaders] ||
			themeShaders.Default;
		const material = new THREE.ShaderMaterial({
			uniforms: {
				pointSize: { value: this.pointSize },
				useTransparency: { value: this.useTransparency },
				customColor: { value: new THREE.Vector3(1, 1, 1) },
				useIntensity: { value: this.colorMode === "reflectivity" },
				pointTransform: { value: new THREE.Matrix4() },
				nowTime: { value: 0 },
				decayTime: { value: this.decayTime || 0 },
			},
			vertexShader: shaders.vertexShader,
			fragmentShader: shaders.fragmentShader,
			transparent: this.useTransparency,
			depthWrite: !this.useTransparency,
			depthTest: true,
			vertexColors: true,
		});
		this.material = material;

		const points = new THREE.Points(geometry, material);
		points.frustumCulled = false;
		this.object3d = points;
	}

	/**
	 * Apply human-rate config: material uniforms, theme shader swap, and rolling /
	 * capacity selection. Returns `data: true` when a rebind is forced (the
	 * rolling mode or the capacity changed) so the next flush re-aliases the
	 * buffers; cosmetic changes return `config: true` only.
	 */
	setConfig(config: PointCloudLayerSetConfig): Partial<LayerDirty> {
		const prevRolling = this.rollingBuffer;
		const prevCapacity = this.rollingCapacity;

		this.pointSize = config.pointSize ?? 0.05;
		this.decayTime = config.decayTime ?? 0;
		this.rollingBuffer = config.rollingBuffer ?? false;
		this.rollingCapacity = clampRollingCapacity(config.maxPoints);
		this.theme = config.theme ?? "Default";
		this.useTransparency = config.useTransparency ?? false;
		this.customColor = config.customColor ?? "#ffffff";
		this.colorMode = config.colorMode ?? "source";
		this.targetFrame = config.targetFrame ?? "";
		this.datasourceId = config.datasourceId;
		this.onStatus = config.onStatus;

		const mat = this.material;
		if (mat.uniforms.pointSize)
			mat.uniforms.pointSize.value = this.pointSize;
		if (mat.uniforms.useTransparency)
			mat.uniforms.useTransparency.value = this.useTransparency;
		if (mat.uniforms.useIntensity)
			mat.uniforms.useIntensity.value = this.colorMode === "reflectivity";
		if (mat.uniforms.decayTime)
			mat.uniforms.decayTime.value = this.decayTime / 1000.0;

		const customCol = this.customColorScratch.set(this.customColor);
		if (mat.uniforms.customColor)
			mat.uniforms.customColor.value.set(
				customCol.r,
				customCol.g,
				customCol.b,
			);

		const shaders =
			themeShaders[this.theme as keyof typeof themeShaders] ||
			themeShaders.Default;
		if (mat.vertexShader !== shaders.vertexShader) {
			mat.vertexShader = shaders.vertexShader;
			mat.fragmentShader = shaders.fragmentShader;
			mat.needsUpdate = true;
		}

		mat.transparent =
			this.useTransparency || (this.rollingBuffer && this.decayTime > 0);
		mat.depthWrite = !(
			this.useTransparency ||
			(this.rollingBuffer && this.decayTime > 0)
		);

		const rebind =
			prevRolling !== this.rollingBuffer ||
			prevCapacity !== this.rollingCapacity;
		if (rebind) {
			// Mode / capacity changed: drop the old ring (or build a fresh one) and
			// reset the dedupe cursor so the next flush re-aliases the buffers.
			this.rollingRing = this.rollingBuffer
				? new RingPointBuffer(this.rollingCapacity)
				: null;
			this.lastProcessedTime = 0;
			this.geometryDirty = true;
		}

		return rebind ? { config: true, data: true } : { config: true };
	}

	/**
	 * Ingest buffered messages into the typed vertex buffers. Never reads the
	 * transform table. Re-resolves the chain internally only when first-data or
	 * the reference frame changed, matching the renderer's data-effect semantics.
	 */
	ingest(sample: LayerSample): boolean {
		const dataArray = (sample.data ?? []) as Array<PointsCloud | undefined>;
		const timesArray = sample.times ?? [];

		const hadData = this.hasData;
		const prevRefFrame = this.refFrame;
		this.hasData = dataArray.length > 0;
		this.refFrame = sample.referenceFrameId ?? "";

		let ingested = false;

		if (dataArray.length > 0) {
			const nowMs = sample.receivedAtMs;
			let nowSeconds = (nowMs - this.startTime) / 1000.0;
			if (this.rollingRing && nowSeconds > TIME_RESET_SECONDS) {
				// Rebase relative time for float32 precision; rewrites all
				// timestamps, so the ring marks the full buffer for upload.
				this.rollingRing.shiftTimestamps(nowSeconds);
				this.startTime = nowMs;
				nowSeconds = 0;
				ingested = true;
			}

			if (this.rollingBuffer) {
				if (!this.rollingRing) {
					this.rollingRing = new RingPointBuffer(
						this.rollingCapacity,
					);
				}

				let latestRawTime = this.lastProcessedTime;
				let pushedCount = 0;

				for (let i = 0; i < dataArray.length; i++) {
					const cloud = dataArray[i];
					if (!cloud?.points?.length) continue;

					if (!(cloud.points instanceof Float32Array)) {
						console.warn(
							"PointsCloud expects packed Float32Array points. Skipping source",
							this.id,
						);
						continue;
					}

					const pointCount = Math.floor(cloud.points.length / 3);
					if (pointCount === 0) continue;

					if (cloud.convention && cloud.convention !== "THREE") {
						console.warn(
							"PointsCloud convention is not THREE. Converter should output THREE coordinates.",
						);
						continue;
					}

					const rawTime = Number.isFinite(timesArray[i])
						? (timesArray[i] as number)
						: i;
					if (rawTime === this.lastProcessedTime) {
						continue;
					}

					const hasColors =
						cloud.colors instanceof Float32Array &&
						cloud.colors.length >= pointCount * 3;
					const hasIntensities =
						cloud.intensities instanceof Float32Array &&
						cloud.intensities.length >= pointCount;

					let colors = hasColors ? cloud.colors! : null;
					let intensities = hasIntensities
						? cloud.intensities!
						: null;

					if (!colors) {
						// Reused, grow-only white fill (values are constant 1s).
						if (
							!this.fillColors ||
							this.fillColors.length < pointCount * 3
						) {
							this.fillColors = new Float32Array(
								nextPowerOfTwo(pointCount) * 3,
							);
							this.fillColors.fill(1);
						}
						colors = this.fillColors;
					}

					if (!intensities) {
						// Reused, grow-only zero fill (Float32Array is zeroed).
						if (
							!this.fillIntensities ||
							this.fillIntensities.length < pointCount
						) {
							this.fillIntensities = new Float32Array(
								nextPowerOfTwo(pointCount),
							);
						}
						intensities = this.fillIntensities;
					}

					const messageTimeSeconds =
						(nowMs - this.startTime) / 1000.0;

					this.rollingRing.push(
						cloud.points,
						colors,
						intensities,
						pointCount,
						messageTimeSeconds,
					);

					pushedCount++;
					latestRawTime = rawTime;
				}

				if (pushedCount > 0) {
					this.lastProcessedTime = latestRawTime;
					ingested = true;
				}
			} else {
				ingested =
					this.ingestLatestMessage(
						dataArray,
						timesArray,
						nowSeconds,
					) || ingested;
			}
		}

		if (ingested) {
			this.geometryDirty = true;
		}

		// First data / reference-frame changes affect the transform chain too.
		if (hadData !== this.hasData || prevRefFrame !== this.refFrame) {
			if (this.tableRef) {
				this.resolveTransform(this.tableRef, this.targetFrame);
			} else if (!this.hasData) {
				this.reportStatus("no-data");
			}
		}

		return ingested;
	}

	/** Latest-message (non-rolling) ingest path. Returns whether it wrote new data. */
	private ingestLatestMessage(
		dataArray: Array<PointsCloud | undefined>,
		timesArray: number[],
		nowSeconds: number,
	): boolean {
		const latestIndex = dataArray.length - 1;
		const cloud = dataArray[latestIndex];
		if (!cloud?.points?.length) return false;

		if (!(cloud.points instanceof Float32Array)) {
			console.warn(
				"PointsCloud expects packed Float32Array points. Skipping source",
				this.id,
			);
			return false;
		}

		const pointCount = Math.floor(cloud.points.length / 3);
		if (pointCount === 0) return false;

		if (cloud.convention && cloud.convention !== "THREE") {
			console.warn(
				"PointsCloud convention is not THREE. Converter should output THREE coordinates.",
			);
			return false;
		}

		const rawTime = Number.isFinite(timesArray[latestIndex])
			? (timesArray[latestIndex] as number)
			: NaN;
		if (Number.isFinite(rawTime) && rawTime === this.lastProcessedTime) {
			return false;
		}

		const scratch = this.nonRolling;
		if (!scratch.positions || scratch.capacity < pointCount) {
			const capacity = nextPowerOfTwo(pointCount);
			scratch.positions = new Float32Array(capacity * 3);
			scratch.colors = new Float32Array(capacity * 3);
			scratch.intensities = new Float32Array(capacity);
			scratch.timestamps = new Float32Array(capacity);
			scratch.capacity = capacity;
		}

		scratch.positions.set(cloud.points.subarray(0, pointCount * 3));

		const hasColors =
			cloud.colors instanceof Float32Array &&
			cloud.colors.length >= pointCount * 3;
		if (hasColors) {
			scratch.colors!.set(cloud.colors!.subarray(0, pointCount * 3));
		} else {
			scratch.colors!.fill(1, 0, pointCount * 3);
		}

		const hasIntensities =
			cloud.intensities instanceof Float32Array &&
			cloud.intensities.length >= pointCount;
		if (hasIntensities) {
			scratch.intensities!.set(
				cloud.intensities!.subarray(0, pointCount),
			);
		} else {
			scratch.intensities!.fill(0, 0, pointCount);
		}

		scratch.timestamps!.fill(nowSeconds, 0, pointCount);
		scratch.count = pointCount;

		if (Number.isFinite(rawTime)) {
			this.lastProcessedTime = rawTime;
		}
		return true;
	}

	/**
	 * Resolve the frame chain to `targetFrame` and write only the `pointTransform`
	 * shader uniform. Caches the table so {@link ingest} can re-resolve on a
	 * first-data / reference-frame change. Never touches geometry buffers.
	 */
	resolveTransform(
		table: TransformTable,
		targetFrame: string,
	): LayerTransformStatus {
		this.tableRef = table;
		this.targetFrame = targetFrame;

		if (!this.hasData) {
			this.reportStatus("no-data");
			return "no-data";
		}

		let status: LayerTransformStatus;
		let transformChain: Transform[] = [];
		const refFrame = qualifyFrame(this.datasourceId, this.refFrame);
		if (!targetFrame || targetFrame === "" || refFrame === targetFrame) {
			status = "resolved";
		} else {
			// Target-frame fallback: if the target isn't reachable from this layer's
			// frame, render it in its own root (identity) instead of hiding it.
			const chain = findTransformChain(table, refFrame, targetFrame);
			status = chain === null ? "fallback" : "resolved";
			transformChain = (chain ?? []) as Transform[];
		}

		this.transform.copy(buildTransformMatrix(transformChain));
		if (this.material.uniforms.pointTransform) {
			this.material.uniforms.pointTransform.value.copy(this.transform);
		}

		this.reportStatus(status);
		return status;
	}

	/**
	 * Flush pending buffer writes to the GPU and refresh the decay time uniform.
	 * A no-op for the geometry unless {@link ingest}/{@link setConfig} marked it
	 * dirty; uploads cover only written spans and the draw range only filled slots.
	 */
	flush(nowMs: number): void {
		if (this.material.uniforms.nowTime) {
			this.material.uniforms.nowTime.value =
				(nowMs - this.startTime) / 1000.0;
		}
		this.uploadGeometry();
	}

	private uploadGeometry(): void {
		const geometry = this.geometry;
		if (!this.geometryDirty) return;
		this.geometryDirty = false;

		if (this.rollingBuffer) {
			const ring = this.rollingRing;
			if (!ring) {
				geometry.setDrawRange(0, 0);
				return;
			}
			const spans = ring.drainWriteSpans();
			const data = ring.getData();
			const posAttr = geometry.getAttribute("position") as
				| THREE.BufferAttribute
				| undefined;
			if (!posAttr || posAttr.array !== data.positions) {
				// New ring instance: alias its arrays directly (one full upload).
				setStreamedAttributes(geometry, data);
			} else if (spans.length > 0) {
				applyWriteSpans(geometry, spans);
				this.accountUpload(spans);
			}
			geometry.setDrawRange(0, ring.getFillCount());
		} else {
			const scratch = this.nonRolling;
			if (!scratch.positions || scratch.count === 0) {
				geometry.setDrawRange(0, 0);
				return;
			}
			const posAttr = geometry.getAttribute("position") as
				| THREE.BufferAttribute
				| undefined;
			if (!posAttr || posAttr.array !== scratch.positions) {
				// Scratch grew (or mode switched): rebind (one full upload).
				setStreamedAttributes(geometry, {
					positions: scratch.positions,
					colors: scratch.colors!,
					intensities: scratch.intensities!,
					timestamps: scratch.timestamps!,
				});
			} else {
				const spans = [{ start: 0, count: scratch.count }];
				applyWriteSpans(geometry, spans);
				this.accountUpload(spans);
			}
			geometry.setDrawRange(0, scratch.count);
		}
	}

	/** Account uploaded bytes across the four streamed attributes (12 floats / point). */
	private accountUpload(
		spans: ReadonlyArray<{ start: number; count: number }>,
	): void {
		// position(3) + color(3) + intensity(1) + timestamp(1) = 8 floats * 4 bytes.
		const BYTES_PER_POINT = 8 * 4;
		let points = 0;
		for (const span of spans) points += span.count;
		if (points > 0)
			metrics.add(SCENE3D.uploadBytes, points * BYTES_PER_POINT);
	}

	/** A rolling buffer with positive decay needs the engine's refresh ticker. */
	needsTick(): boolean {
		return this.rollingBuffer && this.decayTime > 0;
	}

	setVisible(visible: boolean): void {
		this.object3d.visible = visible;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.geometry.dispose();
		this.material.dispose();
	}

	/** Forward a status to the sink only when it changed since the last report. */
	private reportStatus(status: LayerTransformStatus): void {
		if (this.lastStatus === status) return;
		this.lastStatus = status;
		this.onStatus?.(status);
	}
}

/** Factory for a {@link PointCloudLayer} keyed by its bridge id and topic key. */
export function makePointCloudLayer(
	id: string,
	topicKey: string,
): PointCloudLayer {
	return new PointCloudLayer(id, topicKey);
}

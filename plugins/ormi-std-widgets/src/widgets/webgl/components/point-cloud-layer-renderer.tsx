import React from "react";
import { PointCloudSourceRenderer } from "./point-cloud-source-renderer";
import { PointCloudLayerConfig } from "../types/scene-3d-types";

// ============================================================================
// Point Cloud Layer Renderer
// ============================================================================
interface PointCloudLayerRendererProps extends Record<string, unknown> {
	layer: PointCloudLayerConfig;
	layers: PointCloudLayerConfig[];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sourcesData: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	transformsTrees: any;
	targetFrame: string;
	frameTimeRef: React.MutableRefObject<number>;
}

export const PointCloudLayerRenderer: React.FC<
	PointCloudLayerRendererProps
> = ({ layer, sourcesData, transformsTrees, targetFrame, frameTimeRef }) => {
	if (!layer.enabled) {
		return null;
	}

	const topic = layer.topic ?? null;

	const sourceElements = () => {
		const topicInfo = topic;
		if (!topicInfo) return null;

		const source = (sourcesData?.[
			`${topicInfo.datasource_id}/${topicInfo.topic}`
		] ??
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(sourcesData as any)[
				`${topicInfo.datasource_id}/${topicInfo.topic}`.replace(
					/_/g,
					"/",
				)
			]) as
			| { data: unknown[]; times: unknown[]; referenceFrameId?: string }
			| undefined;

		if (!source || !source.data || source.data.length === 0) {
			return null;
		}

		const sourceId = `${topicInfo.datasource_id}/${topicInfo.topic}`;

		return (
			<PointCloudSourceRenderer
				key={sourceId}
				sourceId={sourceId}
				source={source}
				transformsTrees={transformsTrees}
				config={layer}
				targetFrame={targetFrame}
				frameTimeRef={frameTimeRef}
			/>
		);
	};

	return <>{sourceElements()}</>;
};

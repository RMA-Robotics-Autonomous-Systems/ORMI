"use client";
/**
 * Feeds buffered topic data into the imperative {@link SceneEngine}.
 *
 * This is the single component that subscribes to the local data sources: it
 * re-renders on the 30 Hz pump's `sources` Map identity change, then in an
 * effect routes each source to the engine via {@link SceneEngine.ingest}. The
 * engine drops samples for topics no layer consumes, so the bridge can iterate
 * every source without first checking layer registration.
 *
 * It must render inside both `LocalDataSourcesProvider` (for `useLocalDataSource`)
 * and `SceneEngineProvider` (for the engine). It holds no other state.
 */

import { useEffect } from "react";
import { useLocalDataSource } from "@workspace/ormi-core/datasources";
import { useSceneEngine } from "./scene-engine-context";

/**
 * Route every local data source into the engine on each 30 Hz pump tick. The
 * `topicKey` is `dsId::topic[::property]`; the layer qualifies its reference
 * frame with the datasource id from its own config, so the sample's
 * `datasourceId` here is informational only.
 */
export function DataBridge() {
	const engine = useSceneEngine();
	const { sources } = useLocalDataSource();

	useEffect(() => {
		const now = engine.nowMs;
		for (const [topicKey, source] of sources) {
			engine.ingest(topicKey, {
				data: source.data,
				times: source.times,
				referenceFrameId: source.referenceFrameId,
				datasourceId: topicKey.split("::")[0],
				receivedAtMs: now,
			});
		}
	}, [engine, sources]);

	return null;
}

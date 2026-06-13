"use client";
/**
 * React bridge between R3F and the imperative {@link SceneEngine}.
 *
 * The {@link SceneEngineProvider} creates exactly one engine per scene, capturing
 * R3F's `invalidate` so the engine can demand repaints. It must render **inside**
 * the `<Canvas>` (it calls `useThree`). It mounts the engine's root group via
 * `<primitive>` and disposes the engine on unmount.
 *
 * {@link FramePump} runs one `useFrame` callback that drives the engine's render
 * plane on every demanded frame: it refreshes the engine clock and flushes any
 * pending GPU uploads. It renders nothing.
 */

import React, { useEffect, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { createSafeContext } from "@workspace/utils";
import { SceneEngine } from "../scene-engine";

const [SceneEngineContextProvider, useSceneEngine] =
	createSafeContext<SceneEngine>("SceneEngine");

export { useSceneEngine };

interface SceneEngineProviderProps {
	children: React.ReactNode;
}

/**
 * Provide a single {@link SceneEngine} to descendant layer bridges and mount its
 * root group into the scene. Must be rendered inside a `<Canvas>`.
 */
export function SceneEngineProvider({ children }: SceneEngineProviderProps) {
	const invalidate = useThree((state) => state.invalidate);

	// One engine per provider instance. The initializer runs once; React 19 /
	// StrictMode never re-creates it, and the host's `invalidate` is identity
	// stable for the canvas lifetime.
	const [engine] = useState(() => new SceneEngine({ invalidate }));

	useEffect(() => {
		return () => engine.dispose();
	}, [engine]);

	return (
		<SceneEngineContextProvider value={engine}>
			<primitive object={engine.root} />
			{children}
		</SceneEngineContextProvider>
	);
}

/**
 * Drive the engine's render plane once per demanded frame: refresh the clock and
 * flush pending uploads. Renders nothing.
 */
export function FramePump() {
	const engine = useSceneEngine();
	useFrame(() => {
		engine.onFrame(Date.now());
	});
	return null;
}

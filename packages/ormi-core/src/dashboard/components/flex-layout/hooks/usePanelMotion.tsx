import React, { useLayoutEffect, useMemo, useState } from "react";
import { TabSetNode } from "flexlayout-react";
import type { BorderNode, ITabSetRenderValues, Model } from "flexlayout-react";
import { PanelMotionController } from "../panel-motion-controller";

/**
 * Rendered by FlexLayout at the head of every tabset's tab strip (it renders
 * nothing), so its layout effect runs inside every FlexLayout commit, after
 * the DOM mutations and BEFORE any of FlexLayout's measuring layout effects
 * in that tabset: the tab buttons, the tab-overflow hook and the tabset
 * itself all run after it. That is the one point that sees every commit,
 * whichever path caused it (an internal action, a rebuilt model, or an
 * unrelated re-render while panels are moving), early enough to take the
 * motion off the elements before anything is measured. It lives in the
 * `leading` slot and not among the toolbar buttons for exactly that reason:
 * the toolbar comes after the tab buttons, whose rects were then measured
 * mid-flight and fed to the overflow scroll, which shifted every moving
 * panel's tab titles sideways.
 * @param props - Controller and the model being rendered.
 * @returns Nothing.
 */
function PanelMotionProbe({
	controller,
	model,
}: {
	controller: PanelMotionController;
	model: Model;
}) {
	// No dependency list on purpose: it must run on every commit.
	useLayoutEffect(() => {
		controller.afterCommit(model);
	});
	return null;
}

/**
 * Build FlexLayout's `onRenderTabSet` for a controller. A module-level
 * factory, not an inline callback, so the probe element is created fresh on
 * every FlexLayout render and nothing memoises it away (a memoised element
 * would skip the probe's re-render, and with it the commit notification).
 * Border tabsets are skipped: they never move.
 * @param controller - The dashboard's motion controller.
 * @returns The render callback.
 */
function createPanelMotionTabSetRenderer(controller: PanelMotionController) {
	return (
		node: TabSetNode | BorderNode,
		renderValues: ITabSetRenderValues,
	): void => {
		if (!(node instanceof TabSetNode)) return;
		const probe = React.createElement(PanelMotionProbe, {
			key: "ormi-panel-motion-probe",
			controller,
			model: node.getModel(),
		});
		renderValues.leading = renderValues.leading
			? React.createElement(
					React.Fragment,
					null,
					probe,
					renderValues.leading,
				)
			: probe;
	};
}

/**
 * Panel motion for a FlexLayout dashboard.
 * @returns `areaRef` (a callback ref for the positioned element FlexLayout
 * fills, which must contain the `.ormi-motion-metrics` element),
 * `captureBefore` (call before any layout change is applied) and
 * `onRenderTabSet` (pass to `<Layout>`).
 */
export function usePanelMotion() {
	const [controller] = useState(() => new PanelMotionController());

	// A callback ref, not an effect: the area only exists once the model has
	// loaded, which is renders after the dashboard mounts.
	const areaRef = useMemo(
		() => (el: HTMLElement | null) => {
			if (!el) return;
			return controller.attach(el);
		},
		[controller],
	);
	const onRenderTabSet = useMemo(
		() => createPanelMotionTabSetRenderer(controller),
		[controller],
	);
	const captureBefore = useMemo(
		() => (model: Model) => controller.captureBefore(model),
		[controller],
	);

	return { areaRef, captureBefore, onRenderTabSet };
}

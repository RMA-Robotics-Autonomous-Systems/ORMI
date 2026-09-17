import type {
	IJsonRowNode,
	IJsonTabNode,
	IJsonTabSetNode,
	Model,
} from "flexlayout-react";

/**
 * Where a newly added widget goes in a FlexLayout tree.
 *
 * A robotics dashboard exists to show several things at once — an operator
 * watching a camera, a map and a battery gauge needs all three on screen, not
 * three tabs of one panel. So adding a widget *splits* the layout: the largest
 * panel is halved along its longer axis, which grows 1 → 2 side by side → 3 in
 * an L → 4 in a grid without special-casing any count.
 *
 * Splitting stops when the halves would be too small to read, at which point a
 * tab is genuinely the better home and the widget stacks instead.
 *
 * The decision is a pure function of the layout JSON plus the measured panel
 * sizes so it can be tested: layout logic that is silently wrong is invisible
 * in a running dashboard.
 */

/**
 * Rendered size of a layout node, in CSS pixels.
 *
 * Only the extent matters to a placement decision, so positions are not
 * carried: a split changes how much room a panel has, never whether its
 * position makes it readable.
 */
export interface PanelSize {
	width: number;
	height: number;
}

/**
 * Narrowest a panel may end up and still be worth splitting into, in CSS
 * pixels.
 *
 * 320px is the narrowest viewport the rest of the UI is designed against — it
 * is where a topic name and its value still sit on one line and a shadcn card
 * keeps its padding. Below it a widget starts truncating the very label that
 * says what it is showing, and a tab strip entry carrying the full title is
 * more informative than the panel.
 */
export const MIN_SPLIT_WIDTH = 320;

/**
 * Shortest a panel may end up and still be worth splitting into, in CSS
 * pixels.
 *
 * 240px is 320 at 4:3 — the smallest frame in which a camera image, a map or a
 * plot still shows its subject rather than a crop of it. The tab strip takes
 * roughly 30px of it, so the widget body floor is about 210px.
 *
 * The floor is deliberately measured, not counted: a 4K wall display fits far
 * more readable panels than a laptop, and a rule based on the number of
 * widgets would be wrong on both.
 */
export const MIN_SPLIT_HEIGHT = 240;

/** Options for {@link placeNewTabs}. */
export interface PlaceNewTabsOptions {
	/**
	 * Measured size of each row/tabset, keyed by its FlexLayout node id (see
	 * {@link measureFlexLayoutPanels}). Sizes for nodes that are absent are
	 * derived from the nearest measured ancestor and the sibling weights.
	 */
	sizes?: Record<string, PanelSize>;
	/**
	 * Size of the whole layout area, used when the root row itself was not
	 * measured. When neither is known the layout has not been rendered yet and
	 * every split is allowed — there is nothing to compare a floor against.
	 */
	viewport?: PanelSize;
	/** Mirrors FlexLayout's `global.rootOrientationVertical`. */
	rootOrientationVertical?: boolean;
	/** Override for {@link MIN_SPLIT_WIDTH}, in CSS pixels. */
	minWidth?: number;
	/** Override for {@link MIN_SPLIT_HEIGHT}, in CSS pixels. */
	minHeight?: number;
}

type LayoutChild = IJsonRowNode | IJsonTabSetNode;

/**
 * FlexLayout types both node kinds with an optional `type: string`, so the
 * union does not discriminate on its own.
 */
const isTabSet = (node: LayoutChild): node is IJsonTabSetNode =>
	node.type === "tabset";

/** A tabset found during the walk, with its parent row and resolved size. */
interface PanelCandidate {
	parent: IJsonRowNode;
	index: number;
	tabset: IJsonTabSetNode;
	size: PanelSize | null;
	/** Whether the parent row lays its children out left-to-right. */
	parentIsHorizontal: boolean;
}

/** FlexLayout's default node weight when a node declares none. */
const DEFAULT_WEIGHT = 100;

const getWeight = (node: LayoutChild): number =>
	typeof node.weight === "number" && Number.isFinite(node.weight)
		? node.weight
		: DEFAULT_WEIGHT;

/**
 * Split a row's size among its children by weight.
 *
 * FlexLayout also spends a few pixels per splitter; they are ignored because a
 * readability floor of hundreds of pixels cannot turn on them.
 */
const divideSize = (
	row: IJsonRowNode,
	size: PanelSize | null,
	horizontal: boolean,
): (PanelSize | null)[] => {
	if (!size) return row.children.map(() => null);

	const weights = row.children.map(getWeight);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	if (total <= 0) return row.children.map(() => null);

	return weights.map((weight) =>
		horizontal
			? { width: (size.width * weight) / total, height: size.height }
			: { width: size.width, height: (size.height * weight) / total },
	);
};

/**
 * Collect every tabset in the tree, resolving each node's size from its own
 * measurement when there is one and otherwise from its parent and the weights.
 */
const collectPanels = (
	row: IJsonRowNode,
	rowSize: PanelSize | null,
	horizontal: boolean,
	sizes: Map<string, PanelSize>,
	out: PanelCandidate[],
): void => {
	const childSizes = divideSize(row, rowSize, horizontal);

	row.children.forEach((child, index) => {
		const measured = child.id ? sizes.get(child.id) : undefined;
		const size = measured ?? childSizes[index] ?? null;

		if (isTabSet(child)) {
			out.push({
				parent: row,
				index,
				tabset: child,
				size,
				parentIsHorizontal: horizontal,
			});
		} else {
			collectPanels(child, size, !horizontal, sizes, out);
		}
	});
};

/** Resolve the root row's size: its own measurement, else the viewport. */
const resolveRootSize = (
	layout: IJsonRowNode,
	sizes: Map<string, PanelSize>,
	viewport?: PanelSize,
): PanelSize | null => {
	const measured = layout.id ? sizes.get(layout.id) : undefined;
	return measured ?? viewport ?? null;
};

/**
 * Pick the panel a new widget should claim: the largest by rendered area, with
 * document order breaking ties so the result is deterministic. Unmeasured
 * panels only occur before the first render, when every panel is unmeasured.
 */
const pickLargest = (panels: PanelCandidate[]): PanelCandidate | undefined => {
	let best: PanelCandidate | undefined;
	let bestArea = -1;

	for (const panel of panels) {
		const area = panel.size ? panel.size.width * panel.size.height : -1;
		if (area > bestArea) {
			best = panel;
			bestArea = area;
		}
	}

	return best ?? panels[0];
};

/**
 * Halve a panel, in the JSON, along the given axis.
 *
 * FlexLayout rows alternate orientation with depth, so a split either adds a
 * sibling (when the parent row already runs along the split axis) or wraps the
 * panel in a new row that does. Either way the panel's own weight is what gets
 * divided, so siblings keep their share of the parent untouched.
 */
const splitPanel = (
	panel: PanelCandidate,
	newTabset: IJsonTabSetNode,
	sideBySide: boolean,
): void => {
	const { parent, index, tabset } = panel;
	const weight = getWeight(tabset);

	if (panel.parentIsHorizontal === sideBySide) {
		tabset.weight = weight / 2;
		newTabset.weight = weight / 2;
		parent.children.splice(index + 1, 0, newTabset);
		return;
	}

	const wrapper: IJsonRowNode = {
		type: "row",
		weight,
		children: [tabset, newTabset],
	};
	tabset.weight = 50;
	newTabset.weight = 50;
	parent.children[index] = wrapper;
};

/**
 * Append a tab to a tabset and show it.
 *
 * A tabset keeps its previous selection across a rebuild, so without the
 * selection the new widget is appended behind whatever tab was already showing
 * and adding it reads as nothing happening. Tabset selection is runtime state
 * and is stripped on serialization, so this never reaches a saved layout.
 */
const appendTab = (tabset: IJsonTabSetNode, tab: IJsonTabNode): void => {
	tabset.children.push(tab);
	tabset.selected = tabset.children.length - 1;
};

/** Wrap a single tab in a fresh tabset. */
const asTabset = (tab: IJsonTabNode): IJsonTabSetNode => ({
	type: "tabset",
	children: [tab],
	selected: 0,
});

/** Place one tab, mutating the working layout and its measurements. */
const placeOne = (
	layout: IJsonRowNode,
	tab: IJsonTabNode,
	sizes: Map<string, PanelSize>,
	rootSize: PanelSize | null,
	rootIsHorizontal: boolean,
	minWidth: number,
	minHeight: number,
): void => {
	const panels: PanelCandidate[] = [];
	collectPanels(layout, rootSize, rootIsHorizontal, sizes, panels);

	// No panel at all: the layout is empty, so the widget makes the first one.
	if (panels.length === 0) {
		layout.children.push(asTabset(tab));
		return;
	}

	// An empty panel is a hole in the layout, not something to split — splitting
	// it would leave a half nobody asked for, which FlexLayout then prunes.
	const empty = panels.find((panel) => panel.tabset.children.length === 0);
	if (empty) {
		appendTab(empty.tabset, tab);
		return;
	}

	const target = pickLargest(panels);
	if (!target) {
		layout.children.push(asTabset(tab));
		return;
	}

	// Split the longer axis: a wide panel becomes left/right, a tall one
	// top/bottom. That is what turns repeated splits into a grid rather than a
	// row of slivers.
	const size = target.size;
	const sideBySide = !size || size.width >= size.height;

	// Only the axis being split shrinks, so only that axis is tested: refusing a
	// side-by-side split because the panel is short would penalise it for a
	// constraint the split does not cause.
	const fits =
		!size ||
		(sideBySide
			? size.width / 2 >= minWidth
			: size.height / 2 >= minHeight);

	if (!fits) {
		appendTab(target.tabset, tab);
		return;
	}

	// The target's measurement describes the panel before this split; drop it so
	// the next placement in this pass measures the half it actually became,
	// rather than splitting the same panel over and over into slivers.
	if (target.tabset.id) sizes.delete(target.tabset.id);

	splitPanel(target, asTabset(tab), sideBySide);
};

/**
 * Clear the maximized flag from every tabset in a layout.
 *
 * FlexLayout lets one tabset be maximized, covering the whole surface. A widget
 * added while that is on takes its own panel correctly and is then invisible
 * behind the maximized one, so adding it reads as nothing happening — the same
 * failure the `selected` write below exists to prevent, one level up. Restoring
 * is the honest answer: the operator asked for a new thing, so show it.
 *
 * `maximized` is runtime state that `cleanLayout` already strips on save, so
 * clearing it changes nothing about what a workspace persists. It only reaches
 * this function at all because the model is rebuilt from an uncleaned
 * `Model.toJson()`.
 *
 * @param node - Layout node to walk.
 */
const clearMaximized = (node: IJsonRowNode | IJsonTabSetNode): void => {
	if (node.type === "tabset") {
		delete (node as IJsonTabSetNode).maximized;
	}
	for (const child of node.children ?? []) {
		clearMaximized(child as IJsonRowNode | IJsonTabSetNode);
	}
};

/**
 * Place new widget tabs into a FlexLayout tree, splitting rather than stacking
 * while the resulting panels stay readable.
 *
 * Pure: the input layout is not mutated, and nothing but structure, weights and
 * (runtime-only, serializer-stripped) tab selection is written.
 *
 * @param layout - The model's root row, as `Model.toJson().layout`.
 * @param tabs - Tabs to place, in order. Each is placed against the layout the
 * previous one produced.
 * @param options - Measured sizes and split floors.
 * @returns A new root row with the tabs placed.
 */
export function placeNewTabs(
	layout: IJsonRowNode,
	tabs: IJsonTabNode[],
	options: PlaceNewTabsOptions = {},
): IJsonRowNode {
	const next = structuredClone(layout) as IJsonRowNode;
	if (tabs.length === 0) return next;

	const sizes = new Map<string, PanelSize>(
		Object.entries(options.sizes ?? {}),
	);
	const rootSize = resolveRootSize(next, sizes, options.viewport);
	const rootIsHorizontal = !options.rootOrientationVertical;
	const minWidth = options.minWidth ?? MIN_SPLIT_WIDTH;
	const minHeight = options.minHeight ?? MIN_SPLIT_HEIGHT;

	if (!Array.isArray(next.children)) next.children = [];

	// A panel the operator maximized would hide whatever we add.
	clearMaximized(next);

	for (const tab of tabs) {
		placeOne(
			next,
			tab,
			sizes,
			rootSize,
			rootIsHorizontal,
			minWidth,
			minHeight,
		);
	}

	return next;
}

/**
 * Read the rendered size of every row and tabset out of a live FlexLayout
 * model, keyed by node id, for {@link placeNewTabs}.
 *
 * Nodes that have not been laid out yet report a zero rect and are omitted, so
 * an unrendered model simply yields no measurements.
 *
 * @param model - A FlexLayout model.
 * @returns Measured sizes by node id.
 */
export function measureFlexLayoutPanels(
	model: Model,
): Record<string, PanelSize> {
	const sizes: Record<string, PanelSize> = {};

	model.visitNodes((node) => {
		const type = node.getType();
		if (type !== "row" && type !== "tabset") return;

		const rect = node.getRect();
		if (!rect || rect.width <= 0 || rect.height <= 0) return;

		sizes[node.getId()] = { width: rect.width, height: rect.height };
	});

	return sizes;
}

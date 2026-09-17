/**
 * Keyboard-safety guards for controls that publish to a robot from a global
 * key listener.
 *
 * Control widgets (`btn`, `toggle`, `cycle`, the cmd_vel keyboard/joystick
 * panels, the Tello command panel) bind a single character and listen on
 * `window`. Without a guard, typing that character into the widget search box,
 * a JSON-forms config field or a workspace name reaches the robot. These
 * helpers answer the only two questions a global key handler needs to ask
 * before acting: *is the operator typing* and *is a modal covering the
 * dashboard*.
 *
 * Every predicate is pure over the node/scope it is handed, so it is unit
 * testable without a DOM, and every one fails closed on a missing DOM
 * (server render, worker) by reporting "not typing, no modal" — the guard
 * never manufactures a block where there is no document to inspect.
 *
 * @module
 */

/**
 * Element tag names that swallow text input. Any `<input>` counts, including
 * `type="checkbox"`, `type="range"` and `type="button"`: those also consume
 * space/enter/arrow keys, and a key that reaches a focused form control is
 * never a key the operator aimed at a robot.
 */
const EDITABLE_TAG_NAMES = new Set(["input", "textarea", "select"]);

/** Matches an element that opts into rich-text editing. */
const CONTENTEDITABLE_SELECTOR =
	'[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]';

/**
 * Matches an open Radix dialog, alert dialog or sheet.
 *
 * `role="dialog"` / `role="alertdialog"` is an ARIA contract that Radix's
 * `Dialog.Content` and `AlertDialog.Content` set themselves, and `data-state`
 * is Radix's documented styling hook — both are stable across versions. The
 * alternatives are worse: `aria-hidden`/`inert` are applied to *background*
 * content, which a window-level listener has no element to test against, and
 * `data-scroll-locked` on `<body>` is an internal detail of a transitive
 * dependency (`react-remove-scroll`) that would also block on every open
 * dropdown and select.
 */
const OPEN_DIALOG_SELECTOR =
	'[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]';

/**
 * The subset of `Element` these guards read. Duck-typed rather than checked
 * with `instanceof` so the predicates keep working for nodes from another
 * document (an iframe) or a shadow root, and so tests can pass plain objects.
 */
export interface EditableTargetProbe {
	/** Element tag name, e.g. `"INPUT"`. */
	tagName?: string;
	/** True on an element inside a `contenteditable` subtree (DOM-inherited). */
	isContentEditable?: boolean;
	/** Nearest-ancestor selector match, used as the `contenteditable` fallback. */
	closest?: (selector: string) => unknown;
}

/**
 * The subset of `Document` these guards read, so callers (and tests) can scope
 * the lookup to something other than the ambient global document.
 */
export interface GuardScope {
	/** Currently focused element, if any. */
	activeElement?: unknown;
	/** Selector lookup used for modal detection. */
	querySelector?: (selector: string) => unknown;
}

/** Returns the ambient document, or `undefined` outside a browser. */
function ambientScope(): GuardScope | undefined {
	return typeof document === "undefined" ? undefined : document;
}

/**
 * Reports whether a node is, or sits inside, an element that accepts typing.
 *
 * Covers `input`, `textarea`, `select`, `[contenteditable]` and any descendant
 * of a `contenteditable` subtree.
 *
 * @param node - Any event target, element or `null`.
 * @returns `true` when a key press aimed at this node is the operator typing.
 */
export function isEditableElement(node: unknown): boolean {
	if (!node || typeof node !== "object") return false;

	const probe = node as EditableTargetProbe;

	if (probe.isContentEditable === true) return true;

	if (
		typeof probe.tagName === "string" &&
		EDITABLE_TAG_NAMES.has(probe.tagName.toLowerCase())
	) {
		return true;
	}

	// `isContentEditable` is inherited in a real DOM, so this only matters for
	// nodes that do not implement it (older engines, test doubles).
	if (typeof probe.closest === "function") {
		try {
			if (probe.closest(CONTENTEDITABLE_SELECTOR)) return true;
		} catch {
			return false;
		}
	}

	return false;
}

/**
 * Reports whether the operator is typing when `event` fires.
 *
 * Inspects `event.composedPath()` when available — that walks *out* of shadow
 * roots and up through `contenteditable` ancestors in one pass, where
 * `event.target` alone is retargeted to the shadow host and would miss a
 * custom element's internal `<input>`. Falls back to `event.target`, and also
 * checks the focused element so a key event dispatched at `document` (rather
 * than bubbling from the field) is still caught.
 *
 * @param event - The keyboard event being considered, if there is one.
 * @param scope - Document to read focus from. Defaults to the ambient document.
 * @returns `true` when the key belongs to a text field, not to a robot.
 */
export function isTypingInEditableElement(
	event?: Pick<Event, "target"> & { composedPath?: () => EventTarget[] },
	scope: GuardScope | undefined = ambientScope(),
): boolean {
	if (event) {
		let path: EventTarget[] | undefined;
		if (typeof event.composedPath === "function") {
			try {
				path = event.composedPath();
			} catch {
				path = undefined;
			}
		}

		if (path && path.length > 0) {
			if (path.some(isEditableElement)) return true;
		} else if (isEditableElement(event.target)) {
			return true;
		}
	}

	return isEditableElement(scope?.activeElement);
}

/**
 * Reports whether a modal dialog is currently open over the dashboard.
 *
 * A key bound to a control widget must not reach the robot while the operator
 * is working in a config dialog, even when focus happens to sit on a
 * non-editable part of it.
 *
 * @param scope - Document to query. Defaults to the ambient document.
 * @returns `true` when an open dialog, alert dialog or sheet is mounted.
 */
export function isModalOpen(
	scope: GuardScope | undefined = ambientScope(),
): boolean {
	if (typeof scope?.querySelector !== "function") return false;
	try {
		return scope.querySelector(OPEN_DIALOG_SELECTOR) != null;
	} catch {
		return false;
	}
}

/**
 * The default keyboard guard for every control that publishes on a key press:
 * act only when the operator is neither typing nor working inside a modal.
 *
 * @param event - The keyboard event being considered.
 * @param scope - Document to inspect. Defaults to the ambient document.
 * @returns `true` when the key press may be treated as a robot command.
 */
export function isSafeRobotControlKeyEvent(
	event?: Pick<Event, "target"> & { composedPath?: () => EventTarget[] },
	scope: GuardScope | undefined = ambientScope(),
): boolean {
	return !isTypingInEditableElement(event, scope) && !isModalOpen(scope);
}

/**
 * The mission editor's keys, and which panel a key belongs to.
 *
 * Two panels author one mission side by side: the mission map and the node
 * editor (with the Assets panel beside them). Each listens for its keys on
 * the window, so a key pressed after a click that left focus on the page
 * body still arrives. That made every key every panel's: Delete with focus
 * on the map deleted the node editor's selected nodes, and Ctrl+Z in the
 * node editor also stepped the map's open edit. A key now belongs to ONE
 * panel ({@link keyPanelId}): the one holding focus, else the one last
 * pressed in. A panel acts on a key only when it is its own
 * ({@link ownsEditorKey}).
 *
 * What a key does is decided by one pure dispatcher ({@link editorKeyAction})
 * from the panel's state, so both panels give the same key the same meaning:
 * - Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes;
 * - Delete / Backspace removes the selected vertex, else deletes the
 *   panel's selection: at once for the mission's own items (one Undo takes
 *   it back), after a question for a stored map feature (final once sent);
 * - Escape takes ONE step outwards: a menu, then a gesture under way, then
 *   unsaved changes, then the selection. Escape never deletes;
 * - Enter saves, when there is something to save.
 *
 * Typing in a field and an open dialog are ruled out by the shared keyboard
 * guard (`packages/ui/src/lib/input-guards.ts`), never re-implemented here.
 */

import {
	isModalOpen,
	isTypingInEditableElement,
} from "@workspace/ui/lib/input-guards";

import { historyKeyAction } from "./map-selection";
import { isVertexDeleteKey } from "./map-vertex-edit";

/** The attribute naming the kind of panel on its root element. */
export const EDITOR_PANEL_ATTRIBUTE = "data-editor-panel";
/** The attribute carrying the panel instance's own id, on the same element. */
export const EDITOR_PANEL_ID_ATTRIBUTE = "data-editor-panel-id";

/** The kinds of panel that take editor keys. */
export type EditorPanelKind = "map" | "graph" | "assets";

/** What a key does in a panel. */
export type EditorKeyAction =
	| "undo"
	| "redo"
	/** Remove the selected vertex of the open shape. */
	| "delete-vertex"
	/** Ask, then delete the selection (stored map features). */
	| "ask-delete"
	/** Delete the selection at once (the mission's own items). */
	| "delete"
	| "save"
	/** One step outwards (see the module comment). */
	| "escape-step";

/** The key press, and where focus was. */
export interface EditorKeyEvent {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	/** Focus is on a button, link or other control that answers Enter. */
	onControl?: boolean;
	/** Focus is inside an open list or menu, which answers its own keys. */
	inPopup?: boolean;
}

/** What the panel has for a key to act on. */
export interface EditorKeyState {
	/** A vertex of the open shape is selected. */
	vertexSelected?: boolean;
	/**
	 * What deleting the panel's selection costs: `"now"` for the mission's
	 * own items, `"ask"` for stored map features, null with nothing to
	 * delete (or in View).
	 */
	deletes?: "now" | "ask" | null;
	/** There are changes Enter would save. */
	canSave?: boolean;
	/** An Undo has a step to take. */
	canUndo?: boolean;
	/** A Redo has a step to take. */
	canRedo?: boolean;
	/** Escape has a step to take. */
	canEscape?: boolean;
}

/**
 * The action a key asks for in a panel. The caller has already ruled out
 * typing in a field, an open dialog and a key that is not the panel's own
 * ({@link shouldHandleEditorKey}).
 *
 * A key with nothing to act on is null, and left to the browser.
 *
 * @param event - The key and its context.
 * @param state - What the panel has for it to act on.
 * @returns The action, or null.
 */
export function editorKeyAction(
	event: EditorKeyEvent,
	state: EditorKeyState,
): EditorKeyAction | null {
	if (event.inPopup) return null;
	const history = historyKeyAction(event);
	if (history === "undo") return state.canUndo ? "undo" : null;
	if (history === "redo") return state.canRedo ? "redo" : null;
	if (isVertexDeleteKey(event)) {
		if (state.vertexSelected) return "delete-vertex";
		if (state.deletes === "now") return "delete";
		if (state.deletes === "ask") return "ask-delete";
		return null;
	}
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	if (event.key === "Escape") return state.canEscape ? "escape-step" : null;
	if (event.key === "Enter" && !event.shiftKey) {
		if (event.onControl) return null;
		return state.canSave ? "save" : null;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/** The part of an element ownership reads. */
interface PanelProbe {
	closest(selector: string): PanelElement | null;
}

/** The part of a panel's root element ownership reads. */
interface PanelElement {
	getAttribute(name: string): string | null;
	isConnected?: boolean;
}

const PANEL_SELECTOR = `[${EDITOR_PANEL_ID_ATTRIBUTE}]`;

/**
 * The id of the panel an element is in.
 * @param node - An element, or anything else (the document, null).
 * @returns The panel's id, or null outside every panel.
 */
export function panelIdOf(node: unknown): string | null {
	if (
		!node ||
		typeof node !== "object" ||
		typeof (node as Partial<PanelProbe>).closest !== "function"
	)
		return null;
	const panel = (node as PanelProbe).closest(PANEL_SELECTOR);
	if (!panel || panel.isConnected === false) return null;
	return panel.getAttribute(EDITOR_PANEL_ID_ATTRIBUTE);
}

/**
 * The panel a key belongs to: the one holding focus, else the one the
 * operator last pressed in (focus falls back to the page body when the
 * element holding it goes, a deleted node for one).
 *
 * @param active - The element holding focus (`document.activeElement`).
 * @param lastPressed - The id of the panel last pressed in, or null.
 * @returns The panel's id, or null when the key is no panel's.
 */
export function keyPanelId(
	active: unknown,
	lastPressed: string | null,
): string | null {
	return panelIdOf(active) ?? lastPressed;
}

/** The panel last pressed in, kept by {@link trackEditorPanels}. */
let lastPressedPanel: string | null = null;
let trackers = 0;

function onPointerDown(event: Event): void {
	// A press outside every panel (the navbar, a dialog) makes the next key
	// no panel's: none of them was being worked in.
	lastPressedPanel = panelIdOf(event.target);
}

/**
 * Keep the panel last pressed in, for as long as one panel needs it. Each
 * editor panel calls this from an effect; the one listener is shared.
 *
 * @returns Stop (the listener goes with the last panel).
 */
export function trackEditorPanels(): () => void {
	if (typeof window === "undefined") return () => {};
	if (trackers === 0)
		window.addEventListener("pointerdown", onPointerDown, true);
	trackers += 1;
	let stopped = false;
	return () => {
		if (stopped) return;
		stopped = true;
		trackers -= 1;
		if (trackers === 0) {
			window.removeEventListener("pointerdown", onPointerDown, true);
			lastPressedPanel = null;
		}
	};
}

/**
 * Whether a key is this panel's.
 * @param panelId - The panel's id ({@link EDITOR_PANEL_ID_ATTRIBUTE}).
 * @returns True when focus is in it, or it was pressed in last.
 */
export function ownsEditorKey(panelId: string): boolean {
	if (typeof document === "undefined") return false;
	return keyPanelId(document.activeElement, lastPressedPanel) === panelId;
}

/**
 * Whether a panel acts on a key at all: it is the panel's own, the operator
 * is not typing in a field, and no dialog is open.
 *
 * @param event - The key event.
 * @param panelId - The panel's id.
 * @returns True when the panel may act on it.
 */
export function shouldHandleEditorKey(
	event: KeyboardEvent,
	panelId: string,
): boolean {
	if (isTypingInEditableElement(event) || isModalOpen()) return false;
	return ownsEditorKey(panelId);
}

/**
 * The root element attributes that make an element an editor panel.
 * @param kind - The kind of panel.
 * @param id - The instance's id (React `useId`).
 * @returns Props to spread on the root.
 */
export function editorPanelProps(
	kind: EditorPanelKind,
	id: string,
): Record<string, string> {
	return {
		[EDITOR_PANEL_ATTRIBUTE]: kind,
		[EDITOR_PANEL_ID_ATTRIBUTE]: id,
	};
}

/** Test-only: forget the panel last pressed in, and the listener count. */
export function __resetEditorKeys(pressed: string | null = null): void {
	lastPressedPanel = pressed;
	trackers = 0;
}

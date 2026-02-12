import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { Widget } from "../widgets/widget-interface";
import { Datasource } from "../datasources/datasource-interface";

/** Atom holding widgets by box id. */
export const widgetsAtom = atom<Map<string, Widget>>(new Map());
/** Atom holding layout state. */
export const layoutsAtom = atom<Record<string, any>>({});
/** Atom indicating whether the dashboard is locked. */
export const lockedAtom = atom<boolean>(false);
/** Atom indicating whether the dashboard has unsaved changes. */
export const hasChangedAtom = atom<boolean>(false);
/** Atom used to force a dashboard reload. */
export const forceReloadAtom = atom<boolean>(false);
/** Atom holding datasources by id. */
export const datasourcesAtom = atom<Map<string, Datasource>>(new Map());

/** Atom family for reading a widget by box id. */
export const widgetAtomFamily = atomFamily((boxId: string) =>
	atom((get) => get(widgetsAtom).get(boxId)),
);

import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { Widget } from "../widgets/widget-interface";
import { Datasource } from "../datasources/datasource-interface";

export const widgetsAtom = atom<Map<string, Widget>>(new Map());
export const layoutsAtom = atom<Record<string, any>>({});
export const lockedAtom = atom<boolean>(false);
export const hasChangedAtom = atom<boolean>(false);
export const forceReloadAtom = atom<boolean>(false);
export const datasourcesAtom = atom<Map<string, Datasource>>(new Map());

export const widgetAtomFamily = atomFamily((boxId: string) =>
  atom((get) => get(widgetsAtom).get(boxId)),
);

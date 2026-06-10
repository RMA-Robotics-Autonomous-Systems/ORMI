"use client";
/*
	ButtonHolder — navbar-style reactive registry.

	A single <ButtonHolderProvider> is mounted ABOVE both dashboard layout
	engines. It holds a two-level store keyed by widget id:

		Map<widgetId, Map<buttonId, ButtonItem>>

	Widgets contribute toolbar buttons via the API-compatible useButtonHolder()
	hook ({ items, setButtonItem, removeButtonItem }). The hook resolves the
	current widget's bucket from the nearest <WidgetScopeProvider> (set by the
	core WidgetHost). A <ButtonHolderHost widgetId> consumer renders a specific
	bucket where the buttons belong (grid tile header / flex tab strip).

	A widget may nest its own <WidgetScopeProvider value={localScopeId}> to get a
	private bucket (e.g. the maps in-map keyed bus between markers and overlays).
*/

import React, { JSX, useCallback, useMemo, useState } from "react";
import { createSafeContext } from "@workspace/utils";

/** A single registered button: the rendered element plus its sort priority. */
export interface ButtonItem {
	component: JSX.Element;
	priority: number;
}

/** Reactive two-level registry: widgetId -> (buttonId -> ButtonItem). */
interface ButtonHolderRegistryContextType {
	registry: Map<string, Map<string, ButtonItem>>;
	setButtonItem: (
		widgetId: string,
		key: string,
		component: JSX.Element,
		priority?: number,
	) => void;
	removeButtonItem: (widgetId: string, key: string) => void;
}

const [ButtonHolderRegistryContextProvider, useButtonHolderRegistryContext] =
	createSafeContext<ButtonHolderRegistryContextType>("ButtonHolderRegistry");

// Stable scope context carrying the current widget id down to widget bodies.
const [WidgetScopeProvider, useWidgetScope] =
	createSafeContext<string>("WidgetScope");

export { WidgetScopeProvider, useWidgetScope };

/**
 * Stable empty bucket so widgets with no registered buttons keep a constant
 * `items` reference across renders (avoids needless re-renders).
 */
const EMPTY_MAP: ReadonlyMap<string, ButtonItem> = new Map();

interface ButtonHolderProviderProps {
	children: React.ReactNode;
}

/**
 * Single reactive ButtonHolder registry. Mount once above both layout engines.
 * @param props - Children rendered inside the provider.
 * @returns React element.
 */
export const ButtonHolderProvider: React.FC<ButtonHolderProviderProps> = ({
	children,
}) => {
	const [registry, setRegistry] = useState<
		Map<string, Map<string, ButtonItem>>
	>(new Map());

	const setButtonItem = useCallback(
		(
			widgetId: string,
			key: string,
			component: JSX.Element,
			priority = 5,
		) => {
			setRegistry((prev) => {
				const nextOuter = new Map(prev);
				const inner = new Map(prev.get(widgetId) ?? new Map());
				inner.set(key, { component, priority });
				nextOuter.set(widgetId, inner);
				return nextOuter;
			});
		},
		[],
	);

	const removeButtonItem = useCallback((widgetId: string, key: string) => {
		setRegistry((prev) => {
			const current = prev.get(widgetId);
			if (!current || !current.has(key)) {
				return prev;
			}

			const nextOuter = new Map(prev);
			const inner = new Map(current);
			inner.delete(key);
			// Prune empty inner maps so the empty case stays clean.
			if (inner.size === 0) {
				nextOuter.delete(widgetId);
			} else {
				nextOuter.set(widgetId, inner);
			}
			return nextOuter;
		});
	}, []);

	const value = useMemo<ButtonHolderRegistryContextType>(
		() => ({ registry, setButtonItem, removeButtonItem }),
		[registry, setButtonItem, removeButtonItem],
	);

	return (
		<ButtonHolderRegistryContextProvider value={value}>
			{children}
		</ButtonHolderRegistryContextProvider>
	);
};

export { useButtonHolderRegistryContext };

/**
 * API-compatible widget-scoped ButtonHolder hook.
 *
 * Resolves the calling widget's bucket from the nearest <WidgetScopeProvider>
 * and returns `{ items, setButtonItem, removeButtonItem }` exactly as before.
 * `items` is the current widget's `Map<buttonId, ButtonItem>` (a stable empty
 * map when nothing is registered).
 * @returns The scoped ButtonHolder API.
 */
export const useButtonHolder = () => {
	const widgetId = useWidgetScope();
	const { registry, setButtonItem, removeButtonItem } =
		useButtonHolderRegistryContext();

	const items = (registry.get(widgetId) ?? EMPTY_MAP) as Map<
		string,
		ButtonItem
	>;

	const scopedSetButtonItem = useCallback(
		(key: string, component: JSX.Element, priority?: number) =>
			setButtonItem(widgetId, key, component, priority),
		[widgetId, setButtonItem],
	);

	const scopedRemoveButtonItem = useCallback(
		(key: string) => removeButtonItem(widgetId, key),
		[widgetId, removeButtonItem],
	);

	return {
		items,
		setButtonItem: scopedSetButtonItem,
		removeButtonItem: scopedRemoveButtonItem,
	};
};

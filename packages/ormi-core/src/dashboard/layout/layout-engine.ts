import React from "react";

/** Contract that every dashboard layout engine must satisfy. */
export interface LayoutEngineDefinition {
	/** Unique identifier (e.g. "GRID", "FLEX", "PANEL"). */
	id: string;
	/** Display name shown in the workspace settings UI. */
	name: string;
	/** Optional description shown alongside the name. */
	description?: string;
	/** Optional icon rendered in selection UI. */
	icon?: React.ReactNode;
	/** Optional badge label ("New", "Classic", …). */
	badge?: string;
	/**
	 * Self-contained layout component.
	 * Reads state via atoms (widgetsAtom, layoutsAtom, lockedAtom, hasChangedAtom).
	 * Writes state via useDashboardActions().
	 * Registers its own navbar items via useNavbar().
	 */
	Component: React.ComponentType;
}

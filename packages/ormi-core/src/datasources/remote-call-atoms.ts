"use client";
/**
 * Remote Call Atoms Store
 *
 * Event-driven remote call system using Jotai atoms.
 * Datasources push available remote calls directly to atoms, widgets subscribe reactively.
 *
 * Architecture:
 * - remoteCallsAtom: Main atom holding all available remote calls from all datasources
 * - addRemoteCalls: Function to add/update remote calls from a datasource
 * - removeRemoteCalls: Function to remove remote calls when datasource disconnects
 */

import { atom } from "jotai";
import { RemoteCallDefinition } from "./remote-call-interface";
import { appStore } from "../store";

// ============================================================================
// Core Atoms
// ============================================================================

/** Main atom holding remote calls grouped by datasource id. */
export const remoteCallsAtom = atom<Map<string, RemoteCallDefinition[]>>(
	new Map<string, RemoteCallDefinition[]>(),
);

/** Derived atom returning a flat array of all remote calls. */
export const allRemoteCallsAtom = atom((get) => {
	const callsByDatasource = get(remoteCallsAtom);
	const allCalls: RemoteCallDefinition[] = [];

	for (const [, calls] of callsByDatasource) {
		allCalls.push(...calls);
	}

	return allCalls;
});

/** Derived atom returning the total count of remote calls. */
export const remoteCallCountAtom = atom((get) => {
	const allCalls = get(allRemoteCallsAtom);
	return allCalls.length;
});

/** Derived atom returning remote calls grouped by datasource. */
export const remoteCallsByDatasourceAtom = atom((get) => {
	return get(remoteCallsAtom);
});

/** Atom tracking datasource ids that registered remote calls. */
export const remoteCallSourcesAtom = atom<Set<string>>(new Set<string>());

// ============================================================================
// Store Access (for use outside React components)
// ============================================================================

/**
 * Get remote calls grouped by datasource (outside React).
 * @returns Remote calls map.
 */
export function getRemoteCalls(): Map<string, RemoteCallDefinition[]> {
	return appStore.get(remoteCallsAtom);
}

/**
 * Get all remote calls as a flat array (outside React).
 * @returns Remote call list.
 */
export function getAllRemoteCalls(): RemoteCallDefinition[] {
	return appStore.get(allRemoteCallsAtom);
}

/**
 * Subscribe to remote call changes (outside React).
 * @param callback - Change callback.
 * @returns Unsubscribe function.
 */
export function subscribeToRemoteCalls(callback: () => void): () => void {
	return appStore.sub(remoteCallsAtom, callback);
}

// ============================================================================
// Remote Call Update Functions
// ============================================================================

/**
 * Replace remote calls for a datasource.
 * @param datasourceId - Datasource id.
 * @param calls - Remote call definitions.
 */
export function setRemoteCalls(
	datasourceId: string,
	calls: RemoteCallDefinition[],
): void {
	const store = appStore;
	const currentCalls = store.get(remoteCallsAtom);
	const newCalls = new Map(currentCalls);

	// Replace calls for this datasource
	newCalls.set(datasourceId, calls);
	store.set(remoteCallsAtom, newCalls);

	// Track datasource
	const sources = store.get(remoteCallSourcesAtom);
	if (!sources.has(datasourceId)) {
		const newSources = new Set(sources);
		newSources.add(datasourceId);
		store.set(remoteCallSourcesAtom, newSources);
	}
}

/**
 * Add or update a single remote call.
 * @param datasourceId - Datasource id.
 * @param call - Remote call definition.
 */
export function addRemoteCall(
	datasourceId: string,
	call: RemoteCallDefinition,
): void {
	const store = appStore;
	const currentCalls = store.get(remoteCallsAtom);
	const newCalls = new Map(currentCalls);

	const datasourceCalls = newCalls.get(datasourceId) || [];
	const existingIndex = datasourceCalls.findIndex(
		(c) => c.name === call.name,
	);

	if (existingIndex >= 0) {
		// Update existing call
		const updatedCalls = [...datasourceCalls];
		updatedCalls[existingIndex] = call;
		newCalls.set(datasourceId, updatedCalls);
	} else {
		// Add new call
		newCalls.set(datasourceId, [...datasourceCalls, call]);
	}

	store.set(remoteCallsAtom, newCalls);

	// Track datasource
	const sources = store.get(remoteCallSourcesAtom);
	if (!sources.has(datasourceId)) {
		const newSources = new Set(sources);
		newSources.add(datasourceId);
		store.set(remoteCallSourcesAtom, newSources);
	}
}

/**
 * Remove a specific remote call from a datasource.
 * @param datasourceId - Datasource id.
 * @param callName - Call name to remove.
 */
export function removeRemoteCall(datasourceId: string, callName: string): void {
	const store = appStore;
	const currentCalls = store.get(remoteCallsAtom);
	const datasourceCalls = currentCalls.get(datasourceId);

	if (!datasourceCalls) return;

	const newCalls = new Map(currentCalls);
	const updatedCalls = datasourceCalls.filter((c) => c.name !== callName);

	if (updatedCalls.length === 0) {
		newCalls.delete(datasourceId);

		// Remove from sources tracking
		const sources = store.get(remoteCallSourcesAtom);
		const newSources = new Set(sources);
		newSources.delete(datasourceId);
		store.set(remoteCallSourcesAtom, newSources);
	} else {
		newCalls.set(datasourceId, updatedCalls);
	}

	store.set(remoteCallsAtom, newCalls);
}

/**
 * Clear all remote calls for a datasource.
 * @param datasourceId - Datasource id.
 */
export function clearRemoteCallsFromDatasource(datasourceId: string): void {
	const store = appStore;
	const currentCalls = store.get(remoteCallsAtom);

	if (!currentCalls.has(datasourceId)) return;

	const newCalls = new Map(currentCalls);
	newCalls.delete(datasourceId);
	store.set(remoteCallsAtom, newCalls);

	// Update sources tracking
	const sources = store.get(remoteCallSourcesAtom);
	if (sources.has(datasourceId)) {
		const newSources = new Set(sources);
		newSources.delete(datasourceId);
		store.set(remoteCallSourcesAtom, newSources);
	}
}

/** Clear all remote calls and sources. */
export function clearAllRemoteCalls(): void {
	const store = appStore;
	store.set(remoteCallsAtom, new Map());
	store.set(remoteCallSourcesAtom, new Set());
}

/**
 * Find a remote call definition by name and optional datasource.
 * @param callName - Call name to find.
 * @param datasourceId - Optional datasource id.
 * @returns Remote call definition or null.
 */
export function findRemoteCall(
	callName: string,
	datasourceId?: string,
): RemoteCallDefinition | null {
	const allCalls = appStore.get(remoteCallsAtom);

	if (datasourceId) {
		const datasourceCalls = allCalls.get(datasourceId);
		return datasourceCalls?.find((c) => c.name === callName) || null;
	}

	// Search all datasources
	for (const [, calls] of allCalls) {
		const found = calls.find((c) => c.name === callName);
		if (found) return found;
	}

	return null;
}

"use client";
/**
 * Shared application Jotai store.
 *
 * A `<Provider>` can bind the React tree to only one store. Several subsystems write atoms
 * from **outside** React (transforms via `processTFMessage`, remote calls via `setRemoteCalls`,
 * …); those writers and the app-wide `<Provider store={appStore}>` must all target this single
 * instance, or in-React reads (`useAtomValue`) resolve against a different store than the writes
 * land in and silently observe empty/stale state.
 *
 * Use this store everywhere a store is needed — never `getDefaultStore()` or an ad-hoc
 * `createStore()`.
 */

import { createStore } from "jotai";

/** The single shared Jotai store for the whole app. */
export const appStore = createStore();

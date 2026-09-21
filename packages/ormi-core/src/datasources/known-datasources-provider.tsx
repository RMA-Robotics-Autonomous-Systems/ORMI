"use client";

import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { createSafeContext } from "@workspace/utils";

import type { KnownDatasourceConfig } from "./datasource-identity";

/**
 * Datasource configurations the operator has already set up elsewhere.
 *
 * A **discriminated union, never a nullable array**: a consumer must narrow
 * before it can reach `configs`, because "still loading" rendered as "you have
 * none" is a lie the operator acts on — they go and retype a configuration
 * that was about to appear.
 *
 * - `idle` — nothing asked for yet, and the state of a surface that mounts no
 *   provider at all.
 * - `loading` — a read is in flight and nothing has been delivered yet.
 * - `ready` — the list, which may legitimately be empty.
 * - `error` — the read failed. The surface that reads this must degrade
 *   quietly: this list is a convenience, never a precondition.
 */
export type KnownDatasourcesState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; configs: KnownDatasourceConfig[] }
	| { status: "error" };

/** Value handed to consumers of the known-datasources context. */
export interface KnownDatasourcesContextValue {
	state: KnownDatasourcesState;
	/**
	 * Ask for the list. Deduplicated against an in-flight read and against a
	 * recent successful one, so opening the dialog repeatedly costs one
	 * request.
	 */
	refresh: () => void;
}

/**
 * How long a delivered list is considered fresh.
 *
 * The dialog fetches on open rather than on mount, and an operator opens it
 * several times while wiring a dashboard up; without a window that is one
 * request per open for a list that changes when they edit *another*
 * dashboard.
 */
const KNOWN_DATASOURCES_FRESH_MS = 30_000;

const [KnownDatasourcesContextProvider, , useKnownDatasourcesContextOptional] =
	createSafeContext<KnownDatasourcesContextValue>("KnownDatasources");

/**
 * What a consumer sees when no provider is mounted above it.
 *
 * Module-level so its identity is stable: a fresh object per render would
 * invalidate every memo and effect downstream on a surface that has no
 * provider at all, which is precisely the surface that must be unaffected.
 */
const NO_PROVIDER: KnownDatasourcesContextValue = {
	state: { status: "idle" },
	refresh: () => {},
};

/** Props for {@link KnownDatasourcesProvider}. */
export interface KnownDatasourcesProviderProps {
	children: React.ReactNode;
	/**
	 * Reads the operator's configurations. Rejecting is a supported outcome
	 * and puts the provider in `error`; it must not throw synchronously.
	 */
	onLoad: () => Promise<KnownDatasourceConfig[]>;
}

/**
 * Supplies the datasource configurations an operator already has in their
 * other workspaces.
 *
 * Persistence is injected as a prop, the way `TemplatesProvider` takes its
 * own: core does not know how a workspace is stored, and the Prisma helpers
 * that do live in `apps/web`.
 *
 * Mounting this is optional by design. A surface that does not mount it — a
 * plugin page assembling its own shell — keeps today's behaviour exactly,
 * because {@link useKnownDatasources} answers `idle` there.
 *
 * @param props - Component props.
 * @returns React element.
 */
export function KnownDatasourcesProvider(props: KnownDatasourcesProviderProps) {
	const [state, setState] = useState<KnownDatasourcesState>({
		status: "idle",
	});

	const onLoadRef = useRef(props.onLoad);
	const inFlightRef = useRef(false);
	const loadedAtRef = useRef(0);
	const mountedRef = useRef(true);

	// Ref syncs live in effects, never in the render body: a render-phase ref
	// write is what the React Compiler's lint rules reject, and silencing one
	// would opt this provider out of compilation entirely.
	useEffect(() => {
		onLoadRef.current = props.onLoad;
	}, [props.onLoad]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const refresh = useCallback(() => {
		if (inFlightRef.current) return;
		if (
			loadedAtRef.current !== 0 &&
			Date.now() - loadedAtRef.current < KNOWN_DATASOURCES_FRESH_MS
		) {
			return;
		}

		inFlightRef.current = true;
		// A refresh over a list already on screen keeps that list: replacing it
		// with a spinner makes rows the operator was about to click disappear.
		setState((prev) =>
			prev.status === "ready" ? prev : { status: "loading" },
		);

		onLoadRef
			.current()
			.then((configs) => {
				loadedAtRef.current = Date.now();
				if (!mountedRef.current) return;
				setState({ status: "ready", configs });
			})
			.catch((error: unknown) => {
				// Deliberately not recorded as fresh, so the next open retries.
				console.error("Failed to load known datasources:", error);
				if (!mountedRef.current) return;
				setState({ status: "error" });
			})
			.finally(() => {
				inFlightRef.current = false;
			});
	}, []);

	const value = useMemo(() => ({ state, refresh }), [state, refresh]);

	return (
		<KnownDatasourcesContextProvider value={value}>
			{props.children}
		</KnownDatasourcesContextProvider>
	);
}

/**
 * Read the known datasource configurations.
 *
 * Tolerates an absent provider: it answers `{ status: "idle" }` and a no-op
 * `refresh`, which is what keeps every surface that does not mount the
 * provider rendering exactly as it does today.
 *
 * @returns The current state and a refresh trigger.
 */
export function useKnownDatasources(): KnownDatasourcesContextValue {
	return useKnownDatasourcesContextOptional() ?? NO_PROVIDER;
}

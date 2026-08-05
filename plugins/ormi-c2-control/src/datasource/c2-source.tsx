"use client";

import { useEffect, useMemo } from "react";
import { usePluginsManager, PluginsHooks } from "@workspace/ormi-plugins";
import {
	RemoteCallDefinition,
	RemoteCallHandle,
	RemoteCallOptions,
	setRemoteCalls,
	clearRemoteCallsFromDatasource,
} from "@workspace/ormi-core/datasources";

import { C2ControlSettings } from "../types/c2-types";
import { buildC2RemoteCalls } from "./remote-calls";
import { executeC2Call } from "./rest";

/**
 * C2 Control datasource Provider (Pattern 5 — plain lifecycle component, no
 * children, no context). It advertises the C2 remote-call catalog and routes
 * executions to the REST transport (`rest.ts`). Live telemetry is NOT handled
 * here — it rides ORMI's rosbridge/foxglove datasource (D2).
 *
 * Health: fires `DATASOURCE_READY` once on mount (so the status badge shows the
 * source and command widgets gate via `WIDGET_LIST_WITH_DATASOURCE`). It does
 * not flap READY/DISPOSED on a reachability probe — per-call REST failures
 * surface through `useRemoteCall().error`. (This datasource has no topics, so it
 * does not gate telemetry widgets.)
 */
export function C2SourceProvider(props: C2ControlSettings) {
	const pluginsManager = usePluginsManager();
	const dsId = props.id;

	// Stable across settings-object identity churn — recompute only on real changes.
	const calls = useMemo(
		() => buildC2RemoteCalls(props),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[dsId, props.missionControlUrl, props.dbUrl, props.title, props.enable],
	);

	// Discovery + readiness: publish defs to the atoms, announce ready, clean up.
	useEffect(() => {
		setRemoteCalls(dsId, calls);
		pluginsManager.doAction(PluginsHooks.DATASOURCE_READY, dsId);
		return () => {
			clearRemoteCallsFromDatasource(dsId);
			pluginsManager.doAction(PluginsHooks.DATASOURCE_DISPOSED, dsId);
		};
	}, [pluginsManager, dsId, calls]);

	// Transport hooks: contribute to AVAILABLE_REMOTE_CALLS + handle executions.
	useEffect(() => {
		const availableHook = `${dsId}-available-remote-calls`;
		const executeHook = `${dsId}-execute-remote-call`;

		pluginsManager.addFilter(PluginsHooks.AVAILABLE_REMOTE_CALLS, {
			id: availableHook,
			priority: 100,
			filter: (existing: RemoteCallDefinition[]) => [
				...existing,
				...calls,
			],
		});

		pluginsManager.addFilter(executeHook, {
			id: executeHook,
			priority: 100,
			filter: (
				initial: RemoteCallHandle | null,
				def: RemoteCallDefinition,
				request: Record<string, unknown> | undefined,
				options?: RemoteCallOptions,
			): RemoteCallHandle | null => {
				if (def.datasource_id !== dsId) return initial; // pass through other datasources
				return executeC2Call(props, def, request, options);
			},
		});

		// Remove on cleanup — addFilter throws on a duplicate id, so the effect
		// must tear down its registrations before a re-run (StrictMode double-
		// invoke, deps change) re-adds them. Mirrors ormi-foxglove ServiceManager.
		return () => {
			pluginsManager.removeFilter(availableHook);
			pluginsManager.removeFilter(executeHook);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pluginsManager, dsId, calls, props.missionControlUrl, props.dbUrl]);

	return null;
}

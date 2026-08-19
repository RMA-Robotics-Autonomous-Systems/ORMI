"use client";

/**
 * The replay datasource: a recording, registered alongside the live ones.
 *
 * Selecting this instead of a foxglove or rosbridge source is the whole of
 * "work offline" — every widget above it subscribes through the same registry
 * and cannot tell the difference.
 *
 * A plain lifecycle component rather than a context provider (pattern 5): data
 * flows through `PluginsManager` hooks, and the context value would be null.
 */

import { useEffect } from "react";
import { PluginsHooks, usePluginsManager } from "@workspace/ormi-plugins";
import { WorkerDatasourceHost } from "@workspace/ormi-core/datasources";
import { getDatasourceSubscriptionRegistry } from "@workspace/utils";
import { getBag, useBag } from "./bag-store";
import {
	asReplayProblemMessage,
	clearReplayProblem,
	setReplayProblem,
} from "./replay-status";
import type { EmiReplaySettings } from "./emi-replay.worker";

/** Datasource definition id, shared by the definition and anything gating on it. */
export const EMI_REPLAY_DATASOURCE_ID = "teodor-emi-replay-source";

/**
 * Lifecycle component. Spawns the worker, hands it the recording, and reports
 * readiness.
 *
 * Subscribes to the bag store rather than reading it once. A datasource is
 * routinely enabled *before* its recording is picked — and a saved dashboard
 * always comes back with a name whose bytes are not in this page's memory yet
 * — so the provider has to notice the file arriving and start then.
 */
const EmiReplayProvider = (props: EmiReplaySettings) => {
	const pluginsManager = usePluginsManager();
	const { id, enable, bagName, rate, autoplay, drain, title } = props;

	// Watch the store rather than reading it once: a datasource is routinely
	// enabled *before* its recording is picked, and a saved dashboard always
	// comes back with a key whose bytes are not in this page's memory yet — so
	// the provider has to notice the file arriving and start then.
	const stored = useBag(bagName);
	const bufferReady = enable && stored !== undefined;

	useEffect(() => {
		if (!bufferReady) return;
		const buffer = getBag(bagName)?.buffer;
		if (!buffer) return;

		let disposed = false;
		// A new attempt: whatever the last recording was refusing to do is no
		// longer what the operator is looking at.
		clearReplayProblem(id);

		// The registry must EXIST before this datasource can go READY.
		//
		// It learns which datasources are ready from its own DATASOURCE_READY
		// listener, registered in its constructor — so a READY fired before the
		// registry was built is a READY it never hears. `subscribe` for an
		// unknown-ready datasource does not fire `-subscribe`; it parks the
		// intent waiting for a READY that has already happened and will not
		// repeat, and the wire stays idle forever.
		//
		// Nothing else on the cockpit page builds it first. The run store builds
		// it inside `startIngest`, which needs a resolved topic bundle, which
		// needs `listTopics`, which needs `init` — the very thing that fires
		// READY. So without this line the registry is *guaranteed* to be born
		// too late, and the symptom is a datasource that connects, enumerates
		// its topics and delivers nothing. The call is memoised per manager, so
		// doing it here is free.
		//
		// This is why the foxglove and rosbridge plugins build it in their own
		// providers too.
		getDatasourceSubscriptionRegistry(pluginsManager);

		const worker = new Worker(
			new URL("./emi-replay.worker", import.meta.url),
			{ type: "module", name: `datasource:${id}` },
		);

		// The worker's failure channel. `init` deliberately resolves even when
		// the recording cannot be opened — rejecting would take AVAILABLE_TOPICS
		// down for every datasource in the app — so without this the only trace
		// of a bad bag is a console line and ten panels reading "offline".
		const onWorkerMessage = (event: MessageEvent) => {
			const problem = asReplayProblemMessage(event.data);
			if (!problem || disposed) return;
			setReplayProblem({
				datasourceId: id,
				title: title || bagName || id,
				kind: problem.kind,
				message: problem.message,
				advice: problem.advice,
			});
		};
		worker.addEventListener("message", onWorkerMessage);

		// The buffer is added HERE and nowhere else. Persisted settings are
		// serialised into the dashboard document on every save, and the worker
		// strips it again before publishing anything back.
		const host = new WorkerDatasourceHost<EmiReplaySettings>({
			worker,
			datasourceId: id,
			settings: {
				id,
				title,
				enable,
				bagName,
				rate,
				autoplay,
				drain,
				buffer,
			},
			pluginsManager,
		});
		host.registerHooks();

		host.init()
			.then(() => {
				if (disposed) return;
				pluginsManager.doAction(PluginsHooks.DATASOURCE_READY, id);
			})
			.catch((err: unknown) => {
				if (disposed) return;
				// The worker no longer rejects `init` for a bad recording — it
				// reports an empty topic list instead, so one unreadable file
				// cannot take topic discovery down for every other datasource.
				// Anything reaching here is a worker that failed to start.
				const detail = err instanceof Error ? err.message : String(err);
				console.error("[EMI replay] worker failed to start:", detail);
				setReplayProblem({
					datasourceId: id,
					title: title || bagName || id,
					kind: "unopenable",
					message: `The replay engine failed to start: ${detail}`,
					advice: "This is usually the SQLite WebAssembly module failing to load — check that `/sql-wasm.wasm` is being served.",
				});
			});

		return () => {
			disposed = true;
			worker.removeEventListener("message", onWorkerMessage);
			clearReplayProblem(id);
			pluginsManager.doAction(PluginsHooks.DATASOURCE_DISPOSED, id);
			host.dispose();
		};
		// `title` is a label, and `rate`/`autoplay` are init-time seeds with a
		// first-class runtime path of their own (`emi.replay.setRate`). Listing
		// any of them here would tear down the worker, re-parse the whole
		// recording and reset the playhead because someone nudged a form field.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pluginsManager, id, bagName, bufferReady]);

	// A lifecycle component, not a view: providers are rendered as bare
	// siblings in the global datasource slot, so anything returned here lands in
	// the app chrome at an arbitrary position. A missing recording shows up as a
	// datasource that never goes READY, which the status badges already report.
	return null;
};

export { EmiReplayProvider };

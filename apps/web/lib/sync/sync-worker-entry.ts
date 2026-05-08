/**
 * sync-worker-entry.ts — worker bundle entry for ormi-sync.
 *
 * This file is loaded as a DedicatedWorker module by SyncClient.init().
 * It simply re-exports the worker implementation from @workspace/ormi-sync.
 *
 * Next.js / webpack will bundle this as a standalone worker chunk when
 * referenced via `new URL('./sync-worker-entry.js', import.meta.url)`.
 */
import "@workspace/ormi-sync/worker";

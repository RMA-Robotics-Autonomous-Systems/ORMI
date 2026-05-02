/**
 * Sync event bus — EventTarget singleton.
 *
 * Decouples the worker message handler from React hooks. The React hook
 * (useTempIdResolution) subscribes to events on this bus; SyncClient calls
 * emitTempIdResolved when it receives TEMP_ID_RESOLVED from the worker.
 *
 * No framework dependency — consumers can use this outside React too.
 */

export const syncEventBus = new EventTarget();

/**
 * Emit a TEMP_ID_RESOLVED event on the bus.
 * Called by SyncClient when the worker reports that a tempId has been assigned a real ID.
 */
export function emitTempIdResolved(
	tempId: string,
	realId: string | number,
): void {
	const event = Object.assign(new Event("tempIdResolved"), {
		tempId,
		realId,
	});
	syncEventBus.dispatchEvent(event);
}

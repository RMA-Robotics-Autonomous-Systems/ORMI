/**
 * Shared zero-copy transfer helper for the worker → host message boundary.
 *
 * Worker datasources emit large binary payloads (point clouds, images). Passed
 * to `postMessage` without a transfer list, every backing `ArrayBuffer` is
 * structure-CLONED — a full copy of each ~1.2 MB point cloud, per message.
 * The core worker context (`ctx.publish(topic, data, time?, frame?, transfer?)`)
 * and `RpcServer.emit(event, payload, transfer?)` already accept a transfer
 * list; this helper is the single place that derives it from a webapp payload.
 *
 * It duck-types the payload (it does NOT import the core `PointsCloud`/`Image`
 * types, to avoid a `utils → ormi-core` dependency edge) and returns the list
 * of buffers that are safe to transfer.
 *
 * ## Ownership contract (caller MUST honor)
 * A transferred buffer is DETACHED (neutered) in the worker the instant
 * `postMessage` runs. Only buffers that are (a) freshly allocated / exclusively
 * owned by this message and (b) never read again after publish may be listed.
 * **Do not touch the payload's buffers after passing them to `publish`/`emit`.**
 * If a worker retains and re-emits a buffer across messages (e.g. a cached,
 * reused colors array), that buffer is NOT owned per-message and must not be
 * passed through this helper — copy it first (e.g. `array.slice()`), then the
 * copy is owned and transferable.
 *
 * The returned list is de-duplicated by backing-buffer identity, so two views
 * over one `ArrayBuffer` collapse to a single entry — this both avoids a
 * duplicate-transferable throw and prevents partially transferring (neutering)
 * a shared buffer.
 *
 * @param payload - The webapp payload about to be published/emitted.
 * @returns Owned buffers to hand to `publish`/`emit` as the transfer list; `[]`
 *   for payloads with no transferable-owned binary (plain JSON, numbers, etc.).
 */
export function transferablesFor(payload: unknown): Transferable[] {
	// Image payload = an ImageBitmap (itself a Transferable). Guarded for SSR /
	// non-DOM environments where ImageBitmap is undefined.
	if (typeof ImageBitmap !== "undefined" && payload instanceof ImageBitmap) {
		return [payload];
	}

	if (payload === null || typeof payload !== "object") {
		return [];
	}

	const record = payload as Record<string, unknown>;

	// PointsCloud: packed positions plus optional colors/intensities. The three
	// arrays are independent allocations in the converters, so all owned buffers
	// are listed. De-dup by buffer identity guards any future shared-buffer
	// packing.
	if (record.points instanceof Float32Array) {
		const buffers = new Set<ArrayBufferLike>();
		buffers.add(record.points.buffer);
		if (record.colors instanceof Float32Array) {
			buffers.add(record.colors.buffer);
		}
		if (record.intensities instanceof Float32Array) {
			buffers.add(record.intensities.buffer);
		}
		return Array.from(buffers) as Transferable[];
	}

	// Compressed image handoff `{ __compressedData: Uint8Array, __format }`
	// (foxglove CompressedImage → async ImageBitmap decode on the host).
	if (record.__compressedData instanceof Uint8Array) {
		return [record.__compressedData.buffer as Transferable];
	}

	return [];
}

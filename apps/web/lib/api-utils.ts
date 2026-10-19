import { NextResponse } from "next/server";

export function apiResponse(data: unknown, status = 200) {
	return NextResponse.json(data, { status });
}

export function ok(data: unknown, status = 200) {
	return apiResponse(data, status);
}

export function err(data: unknown, status = 400) {
	const payload = typeof data === "string" ? { error: data } : data;
	return apiResponse(payload, status);
}

/** Outcome of {@link readJsonBody}. */
export type JsonBodyResult =
	{ ok: true; body: unknown } | { ok: false; response: Response };

/**
 * Read a request body as JSON, refusing one larger than `maxBytes` before it
 * is parsed: a declared `Content-Length` over the limit is refused without
 * reading, and the stream is read with a running count, so a body that lies
 * about (or omits) its length is cut off at the limit. A body that is empty
 * or not JSON reads as `undefined`, for the route's Zod schema to refuse.
 *
 * @param request - The incoming request.
 * @param maxBytes - The largest body accepted.
 * @returns The parsed body, or a 413 response to return as is.
 */
export async function readJsonBody(
	request: Request,
	maxBytes: number,
): Promise<JsonBodyResult> {
	const tooLarge = () => ({
		ok: false as const,
		response: apiResponse({ error: "Request body too large" }, 413),
	});
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();
	if (!request.body) return { ok: true, body: undefined };

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel().catch(() => undefined);
			return tooLarge();
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const text = new TextDecoder().decode(bytes);
	if (text.trim() === "") return { ok: true, body: undefined };
	try {
		return { ok: true, body: JSON.parse(text) as unknown };
	} catch {
		return { ok: true, body: undefined };
	}
}

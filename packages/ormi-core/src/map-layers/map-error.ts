/**
 * Map error logging for map widgets. Pure, React-free.
 *
 * MapLibre's error events (tile, source and style failures) carry the request
 * URL in their message, and a map server's query token rides in that URL. A
 * map that passes no `onError` gets MapLibre's default, which logs the raw
 * error, URL and token included. Every map widget passes
 * {@link handleMapError} as `<Map onError>` instead.
 */

import { stripQueryStrings } from "./raster-overlay-plan";

/** The fields of a MapLibre `ErrorEvent` this module reads. */
export interface MapErrorEventLike {
	/** What failed: usually an `Error`, sometimes a string or an object with `message`. */
	error?: unknown;
	/** Source of a tile or source error. */
	sourceId?: string;
}

/**
 * The message of a map error with every query string removed. Never the raw
 * error object, whose `url` and `stack` may carry the URL verbatim.
 *
 * @param error - The event's `error`.
 * @returns A loggable message.
 */
export function mapErrorMessage(error: unknown): string {
	let message: string;
	if (typeof error === "string") message = error;
	else if (
		error &&
		typeof error === "object" &&
		typeof (error as { message?: unknown }).message === "string"
	)
		message = (error as { message: string }).message;
	else message = "Unknown map error";
	return stripQueryStrings(message);
}

/**
 * Log a MapLibre error without query strings (so a token never reaches the
 * console). A tile or source error (it names a source) is a warning, the
 * map keeps drawing; anything else is an error. Pass as `<Map onError>`.
 *
 * @param event - The MapLibre error event.
 * @example
 * <Map onError={handleMapError} …>
 */
export function handleMapError(event: MapErrorEventLike): void {
	const message = mapErrorMessage(event?.error);
	if (event?.sourceId) {
		console.warn(`Map source "${event.sourceId}": ${message}`);
	} else {
		console.error(`Map error: ${message}`);
	}
}

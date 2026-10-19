import { formatDistance } from "date-fns";

/**
 * Catalogue age of a map server as a short fact. Pure, React-free.
 *
 * A timestamp later than `now` (clock skew between server and browser) reads
 * as "Updated less than a minute ago", never as a time in the future.
 *
 * @param fetchedAt - ISO timestamp of the last discovery, or `null`.
 * @param now - The reference time; defaults to the current time.
 * @returns E.g. "Updated 3 days ago", or "Not discovered yet" for a missing
 * or unreadable timestamp.
 */
export function formatCatalogueAge(
	fetchedAt: string | null,
	now: Date = new Date(),
): string {
	if (!fetchedAt) return "Not discovered yet";
	const date = new Date(fetchedAt);
	if (Number.isNaN(date.getTime())) return "Not discovered yet";
	const at = date.getTime() > now.getTime() ? now : date;
	return `Updated ${formatDistance(at, now, { addSuffix: true })}`;
}

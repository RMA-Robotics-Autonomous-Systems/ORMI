import fs from "fs";
import path from "path";

const devlogsDirectory = path.join(process.cwd(), "content/devlogs");

/**
 * A single devlog entry with its rendered markdown content.
 */
export interface DevlogEntry {
	id: string;
	content: string;
}

/**
 * Returns all devlog IDs sorted newest-first (lexicographic on date-prefixed filenames).
 */
export function getAllDevlogIds(): string[] {
	if (!fs.existsSync(devlogsDirectory)) return [];

	return fs
		.readdirSync(devlogsDirectory)
		.filter((f) => f.endsWith(".md"))
		.map((f) => f.replace(/\.md$/, ""))
		.sort()
		.reverse();
}

/**
 * Returns all devlogs newer than `lastSeenId` (exclusive), newest-first.
 * If `lastSeenId` is null/undefined, returns all devlogs.
 */
export function getDevlogsSince(lastSeenId?: string | null): DevlogEntry[] {
	const ids = getAllDevlogIds();

	const filtered = lastSeenId ? ids.filter((id) => id > lastSeenId) : ids;

	return filtered.map((id) => {
		const filePath = path.join(devlogsDirectory, `${id}.md`);
		const content = fs.readFileSync(filePath, "utf8");
		return { id, content };
	});
}

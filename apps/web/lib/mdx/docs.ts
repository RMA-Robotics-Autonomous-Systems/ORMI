import fs from "fs";
import path from "path";

const docsDirectory = path.join(process.cwd(), "content/docs");

/**
 * Documentation metadata.
 */
export interface DocMetadata {
	title: string;
	description?: string;
	slug: string;
	path: string;
}

/**
 * Documentation content with metadata.
 */
export interface DocContent {
	metadata: DocMetadata;
	content: string;
}

/**
 * Reads and parses a markdown documentation file from the flat wiki structure.
 * @param slug - Document slug (flat filename without .md extension).
 * @returns Document content or null if not found.
 */
export function getDocBySlug(slug: string): DocContent | null {
	try {
		return getDocFromWiki(slug);
	} catch (error) {
		console.error(`Error reading doc: ${slug}`, error);
		return null;
	}
}

/**
 * Gets a document from the flat wiki structure.
 * @param slug - Slug (flat filename without .md extension).
 * @returns Document content or null if not found.
 */
function getDocFromWiki(slug: string): DocContent | null {
	if (!slug || slug === "index" || slug === "" || slug === "home") {
		// Home page
		const filePath = path.join(docsDirectory, "Home.md");
		if (fs.existsSync(filePath)) {
			return parseDocFile(filePath, slug === "home" ? "home" : "index");
		}
		return null;
	}

	const normalizedSlug = slug.toLowerCase();
	const files = fs.readdirSync(docsDirectory);
	for (const file of files) {
		if (
			(file.endsWith(".md") || file.endsWith(".mdx")) &&
			file !== "Home.md" &&
			file !== "_Sidebar.md"
		) {
			const fileSlug = file.replace(/\.(md|mdx)$/, "").toLowerCase();
			if (fileSlug === normalizedSlug) {
				const filePath = path.join(docsDirectory, file);
				return parseDocFile(filePath, slug);
			}
		}
	}

	return null;
}

/**
 * Parses a markdown file and extracts frontmatter and content.
 * @param filePath - Full file path.
 * @param slug - Document slug.
 * @returns Parsed document content.
 */
function parseDocFile(filePath: string, slug: string): DocContent {
	const fileContents = fs.readFileSync(filePath, "utf8");

	// Parse simple frontmatter (YAML between ---)
	const frontmatterMatch = fileContents.match(
		/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/,
	);

	const frontmatter: Record<string, string> = {};
	let content = fileContents;

	if (frontmatterMatch && frontmatterMatch[1] && frontmatterMatch[2]) {
		const frontmatterText = frontmatterMatch[1];
		content = frontmatterMatch[2];

		// Parse simple key: value pairs
		frontmatterText.split("\n").forEach((line) => {
			const match = line.match(/^([^:]+):\s*(.+)$/);
			if (match && match[1] && match[2]) {
				frontmatter[match[1].trim()] = match[2].trim();
			}
		});
	}

	let title = frontmatter.title || "";
	if (!title) {
		const match = content.match(/^##?\s+(.+?)$/m);
		title = match && match[1] ? match[1] : slug;
	}

	return {
		metadata: {
			title,
			description: frontmatter.description,
			slug,
			path: filePath,
		},
		content,
	};
}

/**
 * Gets all documentation files from the flat wiki structure.
 * @returns Array of document metadata.
 */
export function getAllDocs(): DocMetadata[] {
	const docs: DocMetadata[] = [];

	// Get Home.md
	const homeFile = path.join(docsDirectory, "Home.md");
	if (fs.existsSync(homeFile)) {
		try {
			const fileContents = fs.readFileSync(homeFile, "utf8");
			const frontmatterMatch = fileContents.match(
				/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/,
			);

			const frontmatter: Record<string, string> = {};
			let content = fileContents;

			if (
				frontmatterMatch &&
				frontmatterMatch[1] &&
				frontmatterMatch[2]
			) {
				const frontmatterText = frontmatterMatch[1];
				content = frontmatterMatch[2];
				frontmatterText.split("\n").forEach((line) => {
					const match = line.match(/^([^:]+):\s*(.+)$/);
					if (match && match[1] && match[2]) {
						frontmatter[match[1].trim()] = match[2].trim();
					}
				});
			}

			const title =
				frontmatter.title ||
				content.match(/^##?\s+(.+?)$/m)?.[1] ||
				"Home";

			docs.push({
				title,
				description: frontmatter.description,
				slug: "index",
				path: homeFile,
			});
		} catch (error) {
			console.error(`Error loading ${homeFile}:`, error);
		}
	}

	// Get all other .md files
	const files = fs.readdirSync(docsDirectory);
	for (const file of files) {
		if (
			(file.endsWith(".md") || file.endsWith(".mdx")) &&
			file !== "Home.md" &&
			file !== "_Sidebar.md"
		) {
			const filePath = path.join(docsDirectory, file);
			try {
				const fileContents = fs.readFileSync(filePath, "utf8");
				const frontmatterMatch = fileContents.match(
					/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/,
				);

				const frontmatter: Record<string, string> = {};
				let content = fileContents;

				if (
					frontmatterMatch &&
					frontmatterMatch[1] &&
					frontmatterMatch[2]
				) {
					const frontmatterText = frontmatterMatch[1];
					content = frontmatterMatch[2];
					frontmatterText.split("\n").forEach((line) => {
						const match = line.match(/^([^:]+):\s*(.+)$/);
						if (match && match[1] && match[2]) {
							frontmatter[match[1].trim()] = match[2].trim();
						}
					});
				}

				const title =
					frontmatter.title ||
					content.match(/^##?\s+(.+?)$/m)?.[1] ||
					file.replace(/\.(md|mdx)$/, "");
				const slug = file.replace(/\.(md|mdx)$/, "").toLowerCase();

				docs.push({
					title,
					description: frontmatter.description,
					slug,
					path: filePath,
				});
			} catch (error) {
				console.error(`Error loading ${filePath}:`, error);
			}
		}
	}

	return docs;
}

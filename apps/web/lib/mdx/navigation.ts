import fs from "fs";
import path from "path";
import matter from "gray-matter";

const docsDirectory = path.join(process.cwd(), "content/docs");

export interface NavigationItem {
	title: string;
	href: string;
	children?: NavigationItem[];
}

// Legacy alias for backward compatibility
export type NavItem = NavigationItem;

interface FileInfo {
	name: string;
	title: string;
	path: string;
	order: number;
}

/**
 * Build navigation tree from file system
 */
export function buildNavigation(version: string): NavItem[] {
	const versionPath = path.join(docsDirectory, version);

	if (!fs.existsSync(versionPath)) {
		return [];
	}

	return buildNavFromDirectory(versionPath, version, "");
}

function buildNavFromDirectory(
	dir: string,
	version: string,
	basePath: string,
): NavItem[] {
	const items: NavItem[] = [];
	const files = fs.readdirSync(dir);

	const fileInfos: FileInfo[] = [];
	const directories: string[] = [];

	// Separate files and directories
	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
			directories.push(file);
		} else if (file.endsWith(".md") || file.endsWith(".mdx")) {
			const fileContents = fs.readFileSync(filePath, "utf8");
			const { data, content } = matter(fileContents);

			let title = data.title || "";
			if (!title) {
				const match = content.match(/^#\s+(.+)$/m);
				title = match ? match[1] : file.replace(/\.(md|mdx)$/, "");
			}

			fileInfos.push({
				name: file,
				title: formatTitle(title),
				path: filePath,
				order: data.order || 999,
			});
		}
	}

	// Sort files by order, then alphabetically
	fileInfos.sort((a, b) => {
		if (a.order !== b.order) return a.order - b.order;
		return a.title.localeCompare(b.title);
	});

	// Add files to navigation
	for (const fileInfo of fileInfos) {
		const fileName = fileInfo.name.replace(/\.(md|mdx)$/, "");

		// Handle index files specially
		if (fileName === "index" || fileName === "README") {
			// Only add index at the root level (when basePath is empty)
			if (basePath === "") {
				items.push({
					title: fileInfo.title || "Documentation Home",
					href: `/docs/${version}`,
				});
			}
			continue;
		}

		const slug = basePath ? `${basePath}/${fileName}` : fileName;

		items.push({
			title: fileInfo.title,
			href: `/docs/${version}/${slug}`,
		});
	}

	// Process directories
	for (const dirName of directories.sort()) {
		const dirPath = path.join(dir, dirName);
		const slug = basePath ? `${basePath}/${dirName}` : dirName;

		// Check if directory has an index file
		const indexPath = ["index.md", "index.mdx", "README.md"]
			.map((f) => path.join(dirPath, f))
			.find((p) => fs.existsSync(p));

		let title = formatTitle(dirName);
		let order = 999;

		if (indexPath) {
			const fileContents = fs.readFileSync(indexPath, "utf8");
			const { data, content } = matter(fileContents);

			if (data.title) {
				title = data.title;
			} else {
				const match = content.match(/^#\s+(.+)$/m);
				if (match && match[1]) title = match[1];
			}

			order = data.order || 999;
		}

		const children = buildNavFromDirectory(dirPath, version, slug);

		items.push({
			title,
			href: `/docs/${version}/${slug}`,
			children: children.length > 0 ? children : undefined,
		});
	}

	return items;
}

/**
 * Format directory/file name to title
 */
function formatTitle(name: string): string {
	return name
		.replace(/[-_]/g, " ")
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

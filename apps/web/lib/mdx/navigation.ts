import fs from "fs";
import path from "path";

const docsDirectory = path.join(process.cwd(), "content/docs");

/**
 * Navigation item structure for documentation.
 */
export interface NavigationItem {
	title: string;
	href: string;
	children?: NavigationItem[];
}

/**
 * Legacy alias for NavigationItem (backward compatibility).
 */
export type NavItem = NavigationItem;

/**
 * Builds navigation tree from the flat wiki structure.
 * @returns Array of navigation items.
 */
export function buildNavigation(): NavItem[] {
	return buildWikiNavigation();
}

/**
 * Builds navigation from the flat wiki structure using _Sidebar.md.
 * @returns Array of navigation items.
 */
function buildWikiNavigation(): NavItem[] {
	const sidebarPath = path.join(docsDirectory, "_Sidebar.md");

	if (!fs.existsSync(sidebarPath)) {
		// Fallback: generate navigation from all .md files
		return generateWikiNavFallback();
	}

	const sidebarContent = fs.readFileSync(sidebarPath, "utf8");
	const items: NavItem[] = [];

	// Parse markdown links from _Sidebar.md
	// Expected format: [Title](filename) or [Title](Filename)
	let currentCategory = "";
	let currentCategoryItems: NavItem[] = [];

	const lines = sidebarContent.split("\n");

	for (const line of lines) {
		// Check for section headers (##, ###, ####)
		const headerMatch = line.match(/^(#{2,4})\s+(.+)$/);
		if (headerMatch && headerMatch[2]) {
			// If we have accumulated items in a category, add the category
			if (currentCategory && currentCategoryItems.length > 0) {
				items.push({
					title: currentCategory,
					href: "#",
					children: currentCategoryItems,
				});
			}

			currentCategory = headerMatch[2];
			currentCategoryItems = [];
			continue;
		}

		// Check for list items with links
		const listMatch = line.match(
			/^\s*[-*]\s+\*?\*?\[([^\]]+)\]\(([^)]+)\)/,
		);
		if (listMatch && listMatch[1] && listMatch[2]) {
			const title = listMatch[1];
			const linkHref = listMatch[2];

			const navItem: NavItem = {
				title,
				href: `/docs/${linkHref.toLowerCase()}`,
			};

			currentCategoryItems.push(navItem);
		}
	}

	// Add the last category if we have items
	if (currentCategory && currentCategoryItems.length > 0) {
		items.push({
			title: currentCategory,
			href: "#",
			children: currentCategoryItems,
		});
	}

	// If we successfully parsed the sidebar, return the items
	if (items.length > 0) {
		return items;
	}

	// Fallback if _Sidebar.md is malformed
	return generateWikiNavFallback();
}

/**
 * Generates navigation for wiki structure if _Sidebar.md doesn't exist or is malformed.
 * @returns Array of navigation items grouped by category.
 */
function generateWikiNavFallback(): NavItem[] {
	const items: NavItem[] = [];
	const files = fs.readdirSync(docsDirectory);

	// Group files by category
	const gettingStarted: NavItem[] = [];
	const coreConcepts: NavItem[] = [];
	const apiReference: NavItem[] = [];
	const guides: NavItem[] = [];

	for (const file of files) {
		if (
			file.endsWith(".md") &&
			file !== "Home.md" &&
			file !== "_Sidebar.md"
		) {
			const title = formatTitle(file.replace(/\.md$/, ""));
			const slug = file.replace(/\.md$/, "").toLowerCase();

			const navItem: NavItem = {
				title,
				href: `/docs/${slug}`,
			};

			// Categorize based on filename
			if (
				[
					"installation",
					"development-setup",
					"quick-reference",
				].includes(slug)
			) {
				gettingStarted.push(navItem);
			} else if (slug.includes("-api")) {
				apiReference.push(navItem);
			} else if (
				[
					"creating-a-plugin",
					"creating-a-widget",
					"creating-a-datasource",
					"creating-a-custom-renderer",
				].includes(slug)
			) {
				guides.push(navItem);
			} else {
				coreConcepts.push(navItem);
			}
		}
	}

	// Build navigation structure
	if (gettingStarted.length > 0) {
		items.push({
			title: "Getting Started",
			href: "#",
			children: gettingStarted,
		});
	}

	if (coreConcepts.length > 0) {
		items.push({
			title: "Core Concepts",
			href: "#",
			children: coreConcepts,
		});
	}

	if (guides.length > 0) {
		items.push({
			title: "Guides",
			href: "#",
			children: guides,
		});
	}

	if (apiReference.length > 0) {
		items.push({
			title: "API Reference",
			href: "#",
			children: apiReference,
		});
	}

	return items;
}

/**
 * Format directory/file name to title case.
 * @param name - Name to format.
 * @returns Formatted title.
 */
function formatTitle(name: string): string {
	return name
		.replace(/[-_]/g, " ")
		.split(" ")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

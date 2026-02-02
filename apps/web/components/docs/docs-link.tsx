"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";

interface DocsLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
	href?: string;
}

export function DocsLink({
	href,
	className,
	children,
	...props
}: DocsLinkProps) {
	const pathname = usePathname();

	// Extract current version and path from pathname (e.g., /docs/v1/api/widget-api -> v1, /api/widget-api)
	const versionMatch = pathname.match(/^\/docs\/([^\/]+)(\/.*)?$/);
	const currentVersion = versionMatch ? versionMatch[1] : "v1";
	const currentDocPath = versionMatch ? versionMatch[2] || "/" : "/";

	// Process the href
	let processedHref = href || "#";

	// Skip processing for hash links and external URLs
	if (processedHref.startsWith("http") || processedHref === "#") {
		// External links and anchors are left as-is
	}
	// If it already starts with /docs/, leave it as-is
	else if (processedHref.startsWith("/docs/")) {
		// Already has full path
	}
	// If it's an absolute root link (starts with /)
	else if (processedHref.startsWith("/")) {
		// Add version prefix for docs root links
		processedHref = `/docs/${currentVersion}${processedHref}`;
	}
	// If it's a relative link (doesn't start with / or http)
	else {
		// Resolve relative paths
		const currentDir = currentDocPath.substring(
			0,
			currentDocPath.lastIndexOf("/"),
		);

		// Split the relative path into parts
		const parts = currentDir.split("/").filter((p) => p);
		const linkParts = processedHref.split("/");

		// Process .. and . in the path
		for (const part of linkParts) {
			if (part === "..") {
				parts.pop();
			} else if (part !== "." && part !== "") {
				parts.push(part);
			}
		}

		// Reconstruct the path
		processedHref = `/docs/${currentVersion}/${parts.join("/")}`;
	}

	// External links
	const isExternal = processedHref.startsWith("http");

	return (
		<Link
			href={processedHref}
			className={cn(
				"font-medium text-primary hover:text-primary/80 transition-colors",
				className,
			)}
			target={isExternal ? "_blank" : undefined}
			rel={isExternal ? "noopener noreferrer" : undefined}
			{...props}
		>
			{children}
		</Link>
	);
}

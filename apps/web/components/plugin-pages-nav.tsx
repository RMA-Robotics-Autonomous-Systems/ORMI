"use client";

import Link from "next/link";
import { usePluginPages, type PageDefinition } from "@workspace/ormi-plugins";
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from "@workspace/ui/components/navigation-menu";
import { cn } from "@workspace/ui/lib/utils";

// ── Sub-item ──────────────────────────────────────────────────────────────

function PageNavItem({ page }: { page: PageDefinition }) {
	return (
		<li>
			<NavigationMenuLink asChild>
				<Link
					href={`/plugin-pages/${page.slug}`}
					className={cn(
						"block rounded-md px-3 py-2 text-sm transition-colors",
						"hover:bg-accent hover:text-accent-foreground",
						"focus:bg-accent focus:text-accent-foreground outline-none",
					)}
				>
					<div className="font-medium leading-none">{page.title}</div>
					{page.navItem?.description && (
						<p className="mt-1 text-xs leading-snug text-muted-foreground line-clamp-2">
							{page.navItem.description}
						</p>
					)}
				</Link>
			</NavigationMenuLink>
		</li>
	);
}

// ── Main component ─────────────────────────────────────────────────────────

/**
 * A single "Apps" dropdown button in the navbar that lists all plugin pages
 * registered via PAGES_LIST hook. Pages can be optionally grouped with
 * `navItem.group` and annotated with `navItem.description`.
 *
 * Returns null when no plugin pages declare a navItem (keeps navbar clean).
 */
export function PluginPagesNav() {
	const pages = usePluginPages().filter((p) => p.navItem);

	if (pages.length === 0) return null;

	// Partition into ungrouped and group buckets (insertion order preserved)
	const groupMap = new Map<string, PageDefinition[]>();
	const ungrouped: PageDefinition[] = [];

	for (const page of pages) {
		const group = page.navItem?.group;
		if (group) {
			if (!groupMap.has(group)) groupMap.set(group, []);
			groupMap.get(group)!.push(page);
		} else {
			ungrouped.push(page);
		}
	}

	const groups = Array.from(groupMap.entries());

	return (
		<NavigationMenu>
			<NavigationMenuList>
				<NavigationMenuItem>
					<NavigationMenuTrigger className="h-9 px-3 text-sm font-medium">
						Apps
					</NavigationMenuTrigger>

					<NavigationMenuContent>
						<ul className="w-64 p-2 space-y-0.5">
							{/* Ungrouped pages appear first */}
							{ungrouped.map((page) => (
								<PageNavItem key={page.slug} page={page} />
							))}

							{/* Grouped sections */}
							{groups.map(([group, groupPages], i) => (
								<li key={group}>
									{/* Separator before every group */}
									{(ungrouped.length > 0 || i > 0) && (
										<div className="h-px bg-border my-2 mx-1" />
									)}
									<p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
										{group}
									</p>
									<ul className="space-y-0.5">
										{groupPages.map((page) => (
											<PageNavItem
												key={page.slug}
												page={page}
											/>
										))}
									</ul>
								</li>
							))}
						</ul>
					</NavigationMenuContent>
				</NavigationMenuItem>
			</NavigationMenuList>
		</NavigationMenu>
	);
}

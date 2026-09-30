"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

import { navCurrent } from "@/lib/navigation/nav-current";

// ── Sub-item ──────────────────────────────────────────────────────────────

function PageNavItem({
	page,
	pathname,
}: {
	page: PageDefinition;
	pathname: string | null;
}) {
	const href = `/plugin-pages/${page.slug}`;
	return (
		<li>
			{/* `active` makes Radix set `aria-current="page"` and
			    `data-active`, which the link styles as current. */}
			<NavigationMenuLink
				asChild
				active={navCurrent(pathname, { href }) === "page"}
			>
				<Link
					href={href}
					className={cn(
						"block rounded-md px-3 py-2 text-sm transition-colors",
						"hover:bg-accent hover:text-accent-foreground",
						"focus:bg-accent focus:text-accent-foreground outline-none",
						"data-[active]:bg-accent/50 data-[active]:text-accent-foreground",
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
	const pathname = usePathname();

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
					<NavigationMenuTrigger
						className="nav-current h-9 px-3 text-sm font-medium"
						aria-current={navCurrent(pathname, {
							section: "/plugin-pages/",
						})}
					>
						Apps
					</NavigationMenuTrigger>

					<NavigationMenuContent>
						<ul className="w-64 p-2 space-y-0.5">
							{/* Ungrouped pages appear first */}
							{ungrouped.map((page) => (
								<PageNavItem
									key={page.slug}
									page={page}
									pathname={pathname}
								/>
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
												pathname={pathname}
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

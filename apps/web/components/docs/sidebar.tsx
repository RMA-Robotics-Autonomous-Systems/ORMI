"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationItem } from "@/lib/mdx";
import { ChevronRight, FileText, Home } from "lucide-react";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	SidebarMenuSub,
	SidebarMenuSubItem,
	SidebarMenuSubButton,
} from "@workspace/ui/components/sidebar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { useState } from "react";

interface DocsSidebarProps {
	navigation: NavigationItem[];
	currentVersion: string;
}

export function DocsSidebar({ navigation }: DocsSidebarProps) {
	const pathname = usePathname();

	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarMenu>
					{navigation.map((item) => (
						<NavItem
							key={item.href}
							item={item}
							pathname={pathname}
						/>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function NavItem({
	item,
	pathname,
	level = 0,
}: {
	item: NavigationItem;
	pathname: string;
	level?: number;
}) {
	const isActive = pathname === item.href;
	const hasChildren = item.children && item.children.length > 0;
	const [isOpen, setIsOpen] = useState(
		isActive || pathname.startsWith(item.href),
	);

	// Check if this is the home/root documentation item
	const isHome = item.href.match(/^\/docs\/[^\/]+\/?$/);

	if (!hasChildren) {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton asChild isActive={isActive}>
					<Link href={item.href}>
						{isHome ? (
							<Home className="mr-2" />
						) : (
							<FileText className="mr-2" />
						)}
						<span>{item.title}</span>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	}

	return (
		<Collapsible
			open={isOpen}
			onOpenChange={setIsOpen}
			className="group/collapsible"
		>
			<SidebarMenuItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuButton isActive={isActive}>
						<ChevronRight className="mr-2 transition-transform group-data-[state=open]/collapsible:rotate-90" />
						<span>{item.title}</span>
					</SidebarMenuButton>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarMenuSub>
						{item.children?.map((child) => (
							<SubNavItem
								key={child.href}
								item={child}
								pathname={pathname}
							/>
						))}
					</SidebarMenuSub>
				</CollapsibleContent>
			</SidebarMenuItem>
		</Collapsible>
	);
}

function SubNavItem({
	item,
	pathname,
}: {
	item: NavigationItem;
	pathname: string;
}) {
	const isActive = pathname === item.href;
	const hasChildren = item.children && item.children.length > 0;
	const [isOpen, setIsOpen] = useState(
		isActive || pathname.startsWith(item.href),
	);

	if (!hasChildren) {
		return (
			<SidebarMenuSubItem>
				<SidebarMenuSubButton asChild isActive={isActive}>
					<Link href={item.href}>
						<span>{item.title}</span>
					</Link>
				</SidebarMenuSubButton>
			</SidebarMenuSubItem>
		);
	}

	return (
		<Collapsible
			open={isOpen}
			onOpenChange={setIsOpen}
			className="group/collapsible"
		>
			<SidebarMenuSubItem>
				<CollapsibleTrigger asChild>
					<SidebarMenuSubButton isActive={isActive}>
						<ChevronRight className="mr-2 h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
						<span>{item.title}</span>
					</SidebarMenuSubButton>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="ml-4 border-l pl-2 space-y-1">
						{item.children?.map((child) => (
							<SidebarMenuSubButton
								key={child.href}
								asChild
								isActive={pathname === child.href}
							>
								<Link href={child.href}>
									<span>{child.title}</span>
								</Link>
							</SidebarMenuSubButton>
						))}
					</div>
				</CollapsibleContent>
			</SidebarMenuSubItem>
		</Collapsible>
	);
}

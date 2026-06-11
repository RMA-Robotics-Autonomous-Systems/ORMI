"use client";

import { useState } from "react";
import React from "react";
import {
	useNavbarRegistry,
	type NavbarRegistration,
	type NavbarZone,
} from "./navbar-provider";
import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuList,
} from "@workspace/ui/components/navigation-menu";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@workspace/ui/components/sheet";
import { MenuIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";

const groupLabels: Record<NavbarZone, string> = {
	left: "Main Navigation",
	center: "Features",
	right: "Account",
};

const zoneJustify: Record<NavbarZone, string> = {
	left: "justify-start",
	center: "justify-center",
	right: "justify-end",
};

const zoneOrder: NavbarZone[] = ["left", "center", "right"];

function ZoneHosts({
	items,
	onHostChange,
	className,
	itemClassName,
}: {
	items: NavbarRegistration[];
	onHostChange: (id: string, node: HTMLDivElement | null) => void;
	className?: string;
	itemClassName?: string;
}) {
	return (
		<div className={className}>
			{items.map((item) => (
				<div className={itemClassName} key={item.id}>
					<div ref={(node) => onHostChange(item.id, node)} />
				</div>
			))}
		</div>
	);
}

export const NavBar = () => {
	const { registrations, setHostNode } = useNavbarRegistry();
	const [open, setOpen] = useState(false);
	const isMobile = useIsMobile(1190);

	// Avoid hydration mismatch: render a placeholder until the breakpoint resolves.
	if (isMobile === undefined) {
		return <div className="h-[50px] shadow-md w-full" />;
	}

	const itemsByZone = zoneOrder.reduce<
		Record<NavbarZone, NavbarRegistration[]>
	>(
		(accumulator, zone) => {
			accumulator[zone] = registrations.filter(
				(item) => item.zone === zone,
			);
			return accumulator;
		},
		{ left: [], center: [], right: [] },
	);

	return (
		<div className="relative z-30">
			<NavigationMenu className="shadow-md w-full p-1">
				{isMobile ? (
					<div className="p-2">
						<Sheet open={open} onOpenChange={setOpen}>
							<SheetTrigger asChild>
								<Button
									className="p-2"
									aria-label="Toggle menu"
									variant={"ghost"}
								>
									<MenuIcon className="h-4 w-4 mr-2" />
									Menu
								</Button>
							</SheetTrigger>
							<SheetContent
								side="left"
								className="w-full sm:w-[350px] p-0 flex flex-col"
							>
								<SheetHeader className="p-4 border-b shrink-0">
									<SheetTitle>Navigation</SheetTitle>
								</SheetHeader>
								<div className="flex flex-col flex-1 space-y-4 p-4 overflow-y-auto min-h-0">
									{zoneOrder.map((zone, index) => {
										const zoneItems = itemsByZone[zone];
										if (zoneItems.length === 0) {
											return null;
										}

										return (
											<div
												className="space-y-3"
												key={zone}
											>
												{index > 0 && (
													<div className="h-px bg-border my-2" />
												)}
												<h3 className="font-medium text-sm text-muted-foreground px-2">
													{groupLabels[zone]}
												</h3>
												<ZoneHosts
													className="flex flex-col space-y-1"
													itemClassName="rounded-md hover:bg-muted p-2 flex items-center"
													items={zoneItems}
													onHostChange={setHostNode}
												/>
											</div>
										);
									})}
								</div>
							</SheetContent>
						</Sheet>
					</div>
				) : (
					<div className="flex w-full items-center justify-between">
						{zoneOrder.map((zone) => {
							const zoneItems = itemsByZone[zone];
							if (zoneItems.length === 0) return null;
							return (
								<NavigationMenuList
									key={zone}
									className={`flex-1 ${zoneJustify[zone]}`}
								>
									{zoneItems.map((item) => (
										<NavigationMenuItem
											className="h-10 flex items-center"
											key={item.id}
										>
											<div
												className="h-full flex items-center"
												ref={(node) =>
													setHostNode(item.id, node)
												}
											/>
										</NavigationMenuItem>
									))}
								</NavigationMenuList>
							);
						})}
					</div>
				)}
			</NavigationMenu>
		</div>
	);
};

"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserAccountNav } from "@/components/user/user-home-nav";
import { PluginPagesNav } from "@/components/plugin-pages-nav";
import { preloadWorkspaces } from "@/lib/api/workspace-api";

import { User } from "next-auth";
import { useSession } from "next-auth/react";
import { NavbarItem } from "@workspace/ui/combined/navbar";
import { Button } from "@workspace/ui/components/button";

interface HomeLayoutProps {
	children: React.ReactNode;
}

export default function HomeLayout({ children }: HomeLayoutProps) {
	const { data: session, status } = useSession();
	const pathname = usePathname();

	// Eagerly start the workspace-list request when an authenticated user
	// enters somewhere other than the dashboard (the splash), so the
	// dashboard's own getAll() consumes the in-flight request. Skip on the
	// dashboard itself: a direct deep-link there already fetches via the
	// page's effect, so preloading would start a second, orphaned request.
	useEffect(() => {
		if (status !== "authenticated") return;
		if (pathname.startsWith("/dashboard")) return;
		preloadWorkspaces();
	}, [status, pathname]);

	return (
		<>
			<NavbarItem id="plugin-pages-nav" zone="left" priority={5}>
				<PluginPagesNav />
			</NavbarItem>
			{status === "authenticated" ? (
				<>
					<NavbarItem id="user_account" zone="right" priority={-2}>
						<UserAccountNav user={session?.user as User} />
					</NavbarItem>
					<NavbarItem id="dashboard" zone="left" priority={1}>
						<Link href="/dashboard" passHref>
							<Button variant="ghost">Dashboard</Button>
						</Link>
					</NavbarItem>
				</>
			) : (
				<NavbarItem id="user_account" zone="right" priority={-2}>
					<Link href="/signin" passHref>
						<Button variant="ghost">Sign In</Button>
					</Link>
				</NavbarItem>
			)}
			<div style={{ minHeight: "96dvh", display: "grid" }}>
				{children}
				{/* <SiteFooter className="container mx-auto px-2 mb-1 bg-background/95 backdrop-blur rounded-2xl border z-50" /> */}
			</div>
		</>
	);
}

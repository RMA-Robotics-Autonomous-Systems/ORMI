/* eslint-disable react-hooks/exhaustive-deps */
"use client";
import Link from "next/link";

import { UserAccountNav } from "@/components/user/user-home-nav";

import { User } from "next-auth";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useNavbar } from "@workspace/ui/combined/navbar/navbar-provider";
import { Button } from "@workspace/ui/components/button";
import { usePluginPages } from "@workspace/ormi-plugins";

interface HomeLayoutProps {
	children: React.ReactNode;
}

export default function HomeLayout({ children }: HomeLayoutProps) {
	const { data: session, status } = useSession();
	const { setNavbarItem, removeNavbarItem } = useNavbar();
	const pluginPages = usePluginPages();

	// Register plugin page nav items (any plugin page that declares navItem)
	useEffect(() => {
		const withNav = pluginPages.filter((p) => p.navItem);
		for (const page of withNav) {
			setNavbarItem(
				page.navItem!.position,
				`plugin-page-${page.slug}`,
				<Link href={`/plugin-pages/${page.slug}`} passHref>
					<Button variant="ghost">{page.title}</Button>
				</Link>,
				page.navItem!.priority ?? 10,
			);
		}
		return () => {
			for (const page of withNav) {
				removeNavbarItem(
					page.navItem!.position,
					`plugin-page-${page.slug}`,
				);
			}
		};
	}, [pluginPages]);

	useEffect(() => {
		if (status === "authenticated") {
			setNavbarItem(
				"right",
				"user_account",
				<UserAccountNav user={session?.user as User} />,
				-2,
			);
			setNavbarItem(
				"left",
				"dashboard",
				<Link href="/dashboard" passHref>
					<Button variant="ghost">Dashboard</Button>
				</Link>,
				1,
			);
		} else {
			setNavbarItem(
				"right",
				"user_account",
				<Link href="/signin" passHref>
					<Button variant="ghost">Sign In</Button>
				</Link>,
				-2,
			);
		}

		return () => {
			removeNavbarItem("right", "user_account");
			removeNavbarItem("left", "dashboard");
		};
	}, [status]);

	return (
		<div style={{ minHeight: "96dvh", display: "grid" }}>
			{children}
			{/* <SiteFooter className="container mx-auto px-2 mb-1 bg-background/95 backdrop-blur rounded-2xl border z-50" /> */}
		</div>
	);
}

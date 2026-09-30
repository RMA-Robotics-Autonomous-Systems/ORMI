"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@workspace/ui/components/button";

import { navCurrent, type NavTarget } from "@/lib/navigation/nav-current";

type NavLinkProps = {
	/** The page the entry links to. */
	href: string;
	/** Routes under this prefix mark the entry too (`"/docs/"`). */
	section?: NavTarget["section"];
	children: React.ReactNode;
};

/**
 * A navbar link: a ghost button that carries `aria-current` for the route it
 * leads to and draws the `nav-current` underline (globals.css) while current.
 * The anchor is the button (`asChild`), so there is one focusable element.
 */
export function NavLink({ href, section, children }: NavLinkProps) {
	const pathname = usePathname();
	return (
		<Button asChild variant="ghost" className="nav-current">
			<Link
				href={href}
				aria-current={navCurrent(pathname, { href, section })}
			>
				{children}
			</Link>
		</Button>
	);
}

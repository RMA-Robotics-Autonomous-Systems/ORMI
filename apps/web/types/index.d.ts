/**
 * Site configuration type.
 */
export type SiteConfig = {
	name: string;
	description: string;
	url?: string;
	keywords: string[];
	icon: string;
	ogImage: string;
	manifest: string;
	address: string;
	contacts: {
		telephone: string;
		email: string;
	};
	links: {
		officialwebsite: string;
		googlescholar: string;
		mastodon: string;
		youtube: string;
	};
};

/**
 * Navigation item type.
 */
export type NavItem = {
	title: string;
	href: string;
	disabled?: boolean;
};

/**
 * Home navigation item type.
 */
export type HomeNavItem = NavItem;

/**
 * Home navigation configuration.
 */
export type HomeNavConfig = {
	homeNav: HomeNavItem[];
};

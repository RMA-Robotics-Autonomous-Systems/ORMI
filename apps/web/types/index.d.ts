export type SiteConfig = {
	name: string;
	description: string;
	url: string;
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

export type NavItem = {
	title: string;
	href: string;
	disabled?: boolean;
};

export type HomeNavItem = NavItem;

export type HomeNavConfig = {
	homeNav: HomeNavItem[];
};

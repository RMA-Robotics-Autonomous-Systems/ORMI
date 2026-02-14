interface CookiesInterface {
	get: (key: string) => any | undefined;
	set: (key: string, value: any) => void;
	remove: (key: string) => void;
}

/**
 * Parse document.cookie string into key-value pairs.
 */
const parseCookies = (): Record<string, string> => {
	if (typeof document === "undefined") return {};

	return document.cookie.split(";").reduce(
		(acc, cookie) => {
			const [key, value] = cookie.trim().split("=");
			if (key) {
				acc[key] = decodeURIComponent(value || "");
			}
			return acc;
		},
		{} as Record<string, string>,
	);
};

/**
 * Hook to access cookie operations.
 * No provider needed - functions are stable and use document.cookie.
 *
 * @returns Cookie operations
 */
export const useCookies = (): CookiesInterface => {
	return {
		get: (key: string) => {
			const cookies = parseCookies();
			const value = cookies[key];
			if (!value) return undefined;

			try {
				return JSON.parse(value);
			} catch {
				return value;
			}
		},
		set: (key: string, value: any) => {
			if (typeof document === "undefined") return;

			const serialized =
				typeof value === "string" ? value : JSON.stringify(value);
			document.cookie = `${key}=${encodeURIComponent(serialized)}; path=/; max-age=31536000`;
		},
		remove: (key: string) => {
			if (typeof document === "undefined") return;

			document.cookie = `${key}=; path=/; max-age=0`;
		},
	};
};

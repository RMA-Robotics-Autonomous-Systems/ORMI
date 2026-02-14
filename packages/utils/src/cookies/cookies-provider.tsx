interface CookiesInterface {
	get: (key: string) => any | undefined;
	set: (key: string, value: any) => void;
	remove: (key: string) => void;
}

// Module-level cookie storage
const cookieStore = new Bun.CookieMap();

/**
 * Hook to access cookie operations.
 * No provider needed - functions are stable and use module-level storage.
 *
 * @returns Cookie operations
 */
export const useCookies = (): CookiesInterface => {
	return {
		get: (key: string) => {
			return cookieStore.get(key);
		},
		set: (key: string, value: any) => {
			cookieStore.set(key, value);
		},
		remove: (key: string) => {
			cookieStore.delete(key);
		},
	};
};

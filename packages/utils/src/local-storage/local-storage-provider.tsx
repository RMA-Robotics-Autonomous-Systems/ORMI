interface LocalStorageInterface {
	get: (key: string) => any | undefined;
	set: (key: string, value: any) => void;
	remove: (key: string) => void;
}

/**
 * Hook to access local storage operations.
 * No provider needed - functions are stable and stateless.
 *
 * @returns Local storage operations
 */
export const useLocalStorage = (): LocalStorageInterface => {
	return {
		get: (key: string) => {
			if (typeof window === "undefined") return undefined;

			try {
				const item = localStorage.getItem(key);
				return item ? JSON.parse(item) : undefined;
			} catch (error) {
				console.error("Error getting item from localStorage:", error);
				return undefined;
			}
		},
		set: (key: string, value: any) => {
			if (typeof window === "undefined") return;

			try {
				localStorage.setItem(key, JSON.stringify(value));
			} catch (error) {
				console.error("Error setting item in localStorage:", error);
			}
		},
		remove: (key: string) => {
			if (typeof window === "undefined") return;

			try {
				localStorage.removeItem(key);
			} catch (error) {
				console.error("Error removing item from localStorage:", error);
			}
		},
	};
};

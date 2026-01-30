import { createContext, ReactNode, useContext } from "react";

interface LocalStorageProviderContextInterface {
	get: (key: string) => any | undefined;
	set: (key: string, value: any) => void;
	remove: (key: string) => void;
}

interface LocalStorageProviderProps {
	children: ReactNode;
}

export const LocalStorageProviderContext = createContext<
	LocalStorageProviderContextInterface | undefined
>(undefined);

export const LocalStorageProvider = (props: LocalStorageProviderProps) => {
	return (
		<LocalStorageProviderContext.Provider
			value={{
				get: (key: string) => {
					if (typeof window === "undefined") return undefined;

					try {
						const item = localStorage.getItem(key);
						return item ? JSON.parse(item) : undefined;
					} catch (error) {
						console.error(
							"Error getting item from localStorage:",
							error,
						);
						return undefined;
					}
				},
				set: (key: string, value: any) => {
					if (typeof window === "undefined") return;

					try {
						localStorage.setItem(key, JSON.stringify(value));
					} catch (error) {
						console.error(
							"Error setting item in localStorage:",
							error,
						);
					}
				},
				remove: (key: string) => {
					if (typeof window === "undefined") return;

					try {
						localStorage.removeItem(key);
					} catch (error) {
						console.error(
							"Error removing item from localStorage:",
							error,
						);
					}
				},
			}}
		>
			{props.children}
		</LocalStorageProviderContext.Provider>
	);
};

export const useLocalStorage = () => {
	const context = useContext(LocalStorageProviderContext);
	if (!context) {
		throw new Error(
			"useLocalStorage must be used within a LocalStorageProvider",
		);
	}
	return context;
};

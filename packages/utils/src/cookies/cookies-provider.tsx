import { createContext, ReactNode, useContext, useRef } from "react";

interface CookiesProviderContextInterface {
	get: (key: string) => any | undefined;
	set: (key: string, value: any) => void;
	remove: (key: string) => void;
}

interface CookiesProviderProps {
	children: ReactNode;
}

/**
 * Context for cookies operations.
 */
export const TemplatesProviderContext = createContext<
	CookiesProviderContextInterface | undefined
>(undefined);

/**
 * Cookies provider component.
 *
 * @param props - Provider props including children
 */
export const CookiesProvider = (props: CookiesProviderProps) => {
	const cookiesRef = useRef<Bun.CookieMap>(new Bun.CookieMap());

	return (
		<TemplatesProviderContext.Provider
			value={{
				get: (key: string) => {
					// Implement your logic here
					return cookiesRef.current.get(key);
				},
				set: (key: string, value: any) => {
					// Implement your logic here
					cookiesRef.current.set(key, value);
				},
				remove: (key: string) => {
					// Implement your logic here
					cookiesRef.current.delete(key);
				},
			}}
		>
			{props.children}
		</TemplatesProviderContext.Provider>
	);
};

/**
 * Hook to access cookies context.
 *
 * @returns Cookies context value
 */
export const useCookies = () => {
	const context = useContext(TemplatesProviderContext);
	if (!context) {
		throw new Error("useCookies must be used within a CookiesProvider");
	}
	return context;
};

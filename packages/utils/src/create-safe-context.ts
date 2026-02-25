import { createContext, useContext } from "react";

export function createSafeContext<T>(name: string) {
	const Context = createContext<T | undefined>(undefined);
	const useCtx = () => {
		const ctx = useContext(Context);
		if (ctx === undefined) {
			throw new Error(`use${name} must be within ${name}Provider`);
		}
		return ctx;
	};
	return [Context.Provider, useCtx] as const;
}

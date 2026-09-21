import { createContext, useContext } from "react";

/**
 * Build a typed React context together with the hooks that read it.
 *
 * Returns a tuple of three:
 *
 * 1. the provider component,
 * 2. a **required** hook that throws when used outside the provider — the
 *    default, because a consumer that silently reads `undefined` reports an
 *    empty state instead of a wiring mistake,
 * 3. an **optional** hook that returns `undefined` outside the provider, for
 *    the narrow case of a component that must render correctly on a surface
 *    where the provider is deliberately absent (a plugin page that assembles
 *    its own shell, for instance).
 *
 * Reach for the optional hook only when "no provider" is a supported state
 * with its own defined behaviour, never to paper over a missing provider.
 *
 * The third element is appended, so existing two-element destructurings are
 * unaffected.
 *
 * @param name - PascalCase context name, used in the error message.
 * @returns `[Provider, useCtx, useCtxOptional]`.
 */
export function createSafeContext<T>(name: string) {
	const Context = createContext<T | undefined>(undefined);
	const useCtx = () => {
		const ctx = useContext(Context);
		if (ctx === undefined) {
			throw new Error(`use${name} must be within ${name}Provider`);
		}
		return ctx;
	};
	const useCtxOptional = () => useContext(Context);
	return [Context.Provider, useCtx, useCtxOptional] as const;
}

/**
 * `try { body() } catch (e) { onError(e) } finally { onSettled() }`, as a
 * function.
 *
 * The React Compiler cannot lower a `try` with a `finally`, a `throw` inside a
 * `try`, or a conditional/optional-chaining expression inside one, and skips
 * the whole component when it meets one. Handlers call this instead, so the
 * `try` lives at module level and the component still compiles.
 *
 * Semantics are exactly the statement's: `onSettled` always runs last, and
 * anything `onError` or `onSettled` throws propagates.
 *
 * @param body - The guarded work. Synchronous: a returned promise is not
 * awaited, use {@link attemptAsync} for that.
 * @param onError - Runs with whatever `body` threw. Omitted, the error is
 * rethrown after `onSettled` (a `try`/`finally` with no `catch`).
 * @param onSettled - Runs last, whatever happened.
 * @returns `true` when `body` completed, `false` when `onError` handled a throw.
 */
export function attempt(
	body: () => void,
	onError?: (error: unknown) => void,
	onSettled?: () => void,
): boolean {
	try {
		body();
		return true;
	} catch (error) {
		if (!onError) throw error;
		onError(error);
		return false;
	} finally {
		onSettled?.();
	}
}

/**
 * {@link attempt} for an async `body`: it is awaited, so a rejection reaches
 * `onError` (or is rethrown after `onSettled` when `onError` is omitted).
 *
 * @returns `true` when `body` completed, `false` when `onError` handled a throw.
 */
export async function attemptAsync(
	body: () => unknown,
	onError?: (error: unknown) => void,
	onSettled?: () => void,
): Promise<boolean> {
	try {
		await body();
		return true;
	} catch (error) {
		if (!onError) throw error;
		onError(error);
		return false;
	} finally {
		onSettled?.();
	}
}

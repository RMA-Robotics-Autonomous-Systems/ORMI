"use client";

import React from "react";
import { WidgetErrorFallback } from "@workspace/ui/components/widget-error-fallback";

/** Props for {@link WidgetErrorBoundary}. */
export interface WidgetErrorBoundaryProps {
	/** The widget body to isolate. A throw here is contained, not propagated. */
	children: React.ReactNode;
	/**
	 * Values that, when changed, reset the boundary so a recovered widget can
	 * render again. Typically the widget instance id (and any input whose change
	 * should clear a transient error). Compared shallowly between renders.
	 *
	 * This mirrors the `resetKeys` convention of common error-boundary
	 * libraries: a transient error (e.g. data briefly absent at mount, before
	 * the datasource is ready) clears automatically once the inputs change.
	 */
	resetKeys?: readonly unknown[];
}

/** Internal state for {@link WidgetErrorBoundary}. */
interface WidgetErrorBoundaryState {
	/** The caught error, or `null` when the boundary is healthy. */
	error: Error | null;
}

/**
 * Shallow equality over two `resetKeys` arrays.
 * @param a - Previous keys.
 * @param b - Next keys.
 * @returns `true` when both arrays are element-wise `Object.is`-equal.
 */
function areResetKeysEqual(
	a: readonly unknown[] | undefined,
	b: readonly unknown[] | undefined,
): boolean {
	if (a === b) return true;
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!Object.is(a[i], b[i])) return false;
	}
	return true;
}

/**
 * Per-widget React error boundary.
 *
 * Catches render and lifecycle errors thrown by the widget body it wraps and
 * renders a localized {@link WidgetErrorFallback} instead of letting the error
 * propagate and crash the whole dashboard layout. Only the widget body is
 * isolated — the host chrome (title bar, controls) stays mounted and usable
 * because the boundary wraps the body, not the host.
 *
 * Recovery:
 * - Resets automatically when `resetKeys` change (e.g. the widget id, or an
 *   input whose change makes a transient error worth retrying). This lets a
 *   widget that threw because data was briefly absent recover once data arrives.
 * - The fallback also exposes a manual "Retry" button that clears the error.
 *   Retry is display-only here — it re-renders the widget; it does not trigger
 *   a datasource reconnect.
 *
 * Error boundaries must be class components (`getDerivedStateFromError` +
 * `componentDidCatch`); hence this is not a function component.
 *
 * Note on widget identity (Pattern 10): this boundary wraps the widget body but
 * never substitutes the widget's component type. `definition.Component` remains
 * the stable module-level reference rendered by the host, so wrapping it here
 * does not affect React's reconciliation identity for the widget itself.
 */
export class WidgetErrorBoundary extends React.Component<
	WidgetErrorBoundaryProps,
	WidgetErrorBoundaryState
> {
	constructor(props: WidgetErrorBoundaryProps) {
		super(props);
		this.state = { error: null };
		this.handleRetry = this.handleRetry.bind(this);
	}

	/**
	 * Derives error state from a thrown error so the fallback renders.
	 * @param error - The error thrown by a descendant.
	 * @returns The next state holding the error.
	 */
	static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
		return { error };
	}

	/**
	 * Clears the error when `resetKeys` change between renders so a recovered
	 * widget can render again.
	 * @param prevProps - The previous props.
	 */
	componentDidUpdate(prevProps: WidgetErrorBoundaryProps): void {
		if (
			this.state.error !== null &&
			!areResetKeysEqual(prevProps.resetKeys, this.props.resetKeys)
		) {
			this.setState({ error: null });
		}
	}

	/**
	 * Logs the caught error. The codebase has no central logger, so this uses
	 * `console.error` (the convention used elsewhere in the dashboard layer).
	 * @param error - The error thrown by a descendant.
	 * @param info - React error info, including the component stack.
	 */
	componentDidCatch(error: Error, info: React.ErrorInfo): void {
		console.error("Widget failed to render:", error, info.componentStack);
	}

	/** Clears the error so the wrapped widget re-renders. */
	private handleRetry(): void {
		this.setState({ error: null });
	}

	render(): React.ReactNode {
		if (this.state.error !== null) {
			return (
				<WidgetErrorFallback
					message={this.state.error.message}
					onRetry={this.handleRetry}
				/>
			);
		}
		return this.props.children;
	}
}

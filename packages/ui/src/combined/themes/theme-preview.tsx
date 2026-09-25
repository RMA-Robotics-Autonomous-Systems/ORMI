"use client";

import React, { useLayoutEffect, type CSSProperties } from "react";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	isThemeRootSelectorList,
	scopeThemeCss,
	themePreviewSelector,
	THEME_PREVIEW_ATTRIBUTE,
} from "@workspace/ui/lib/theme-presets";

/** The `<style>` that holds every preview card's scoped tokens. */
export const THEME_PREVIEW_STYLE_ID = "theme-preset-previews";

/**
 * Collect the page's own root token rules (globals.css: `:root`, `.dark`,
 * and those inside `@media` / `@supports`) as CSS text, skipping the style
 * elements named in `excludeIds` (the active preset, the previews).
 *
 * A card needs the defaults redeclared on itself, not inherited: a token
 * derived on `:root` (`--panel-background: var(--card)`) is resolved there,
 * with the page's colours, and a card whose preset does not set it would
 * otherwise show the page's value. The same goes for every token the
 * active preset sets and the card's preset does not. Rules in `@layer`
 * (Tailwind's theme constants) are skipped: they do not vary by preset.
 */
export function collectBaseThemeCss(
	doc: Document,
	excludeIds: readonly string[],
): string {
	const out: string[] = [];

	const walk = (rules: CSSRuleList, sink: string[]) => {
		for (const rule of Array.from(rules)) {
			if (rule instanceof CSSStyleRule) {
				if (isThemeRootSelectorList(rule.selectorText))
					sink.push(rule.cssText);
			} else if (
				rule instanceof CSSMediaRule ||
				rule instanceof CSSSupportsRule
			) {
				const inner: string[] = [];
				walk(rule.cssRules, inner);
				if (inner.length > 0) {
					const prelude =
						rule instanceof CSSMediaRule
							? `@media ${rule.media.mediaText}`
							: `@supports ${rule.conditionText}`;
					sink.push(`${prelude} {\n${inner.join("\n")}\n}`);
				}
			}
		}
	};

	for (const sheet of Array.from(doc.styleSheets)) {
		const owner = sheet.ownerNode;
		if (owner instanceof Element && excludeIds.includes(owner.id)) continue;
		try {
			walk(sheet.cssRules, out);
		} catch {
			// A cross-origin sheet cannot be read; it carries no ORMI tokens.
			continue;
		}
	}
	return out.join("\n");
}

/**
 * Inject one stylesheet that scopes each preset (on top of the page's base
 * tokens) to its preview card, for as long as the calling component is
 * mounted. Nothing in it can match outside a `[data-theme-preview]` element.
 */
export function useThemePreviewStyles(
	previews: readonly { id: string; css: string }[],
	excludeIds: readonly string[],
) {
	useLayoutEffect(() => {
		const base = collectBaseThemeCss(document, [
			...excludeIds,
			THEME_PREVIEW_STYLE_ID,
		]);
		const css = previews
			.map(({ id, css: presetCss }) =>
				scopeThemeCss(
					`${base}\n${presetCss}`,
					themePreviewSelector(id),
				),
			)
			.join("\n");

		const style = document.createElement("style");
		style.id = THEME_PREVIEW_STYLE_ID;
		style.textContent = css;
		document.head.appendChild(style);
		return () => style.remove();
	}, [previews, excludeIds]);
}

/* Headings and title slots in globals.css: an unset token inherits. */
const headingStyle: CSSProperties = {
	fontFamily: "var(--font-display)",
	fontWeight: "var(--heading-weight)",
	letterSpacing: "var(--heading-tracking)",
	textTransform: "var(--heading-transform)" as CSSProperties["textTransform"],
};

/* Tab titles: the label tokens. */
const labelStyle: CSSProperties = {
	fontFamily: "var(--font-label)",
	letterSpacing: "var(--label-tracking)",
	textTransform: "var(--label-transform)" as CSSProperties["textTransform"],
};

const tabBase: CSSProperties = {
	...labelStyle,
	borderRadius: "var(--radius-inner) var(--radius-inner) 0 0",
	border: "var(--panel-border-width) solid transparent",
	borderBottom: 0,
};

/**
 * A miniature of the app styled by one preset's tokens: the navbar, a panel
 * with its tab joined to it, a primary button, status badges, and text in the
 * body, display and code faces. Built from the same components and token
 * reads as the real UI (the navbar is `.app-frame-bar`; the panel mirrors
 * FlexLayout's tabset rules), so it shows what the preset really does.
 * Decorative: hidden from assistive technology and from the pointer.
 */
export function ThemePreviewMock({ id }: { id: string }) {
	return (
		<div
			{...{ [THEME_PREVIEW_ATTRIBUTE]: id }}
			aria-hidden
			className="bg-background text-foreground pointer-events-none flex h-44 w-full flex-col overflow-hidden font-sans text-xs select-none"
			style={{ backgroundImage: "var(--surface-texture)" }}
		>
			<div className="app-frame-bar flex h-9 shrink-0 items-center gap-2">
				<span className="text-sm" style={headingStyle}>
					ORMI
				</span>
				<span className="bg-muted-foreground/40 h-1.5 w-7 rounded-full" />
				<span className="bg-muted-foreground/40 h-1.5 w-5 rounded-full" />
				<span className="bg-success ml-auto size-2 rounded-full" />
			</div>

			<div
				className="flex min-h-0 flex-1"
				style={{ padding: "calc(var(--frame-gutter) / 2)" }}
			>
				<div
					className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
					style={{
						margin: "calc(var(--frame-gutter) / 2)",
						background: "var(--panel-background)",
						border: "var(--panel-border-width) solid var(--panel-border-color)",
						borderRadius: "var(--panel-radius)",
						boxShadow: "var(--panel-elevation)",
					}}
				>
					<div
						className="flex shrink-0 items-end gap-0.5"
						style={{
							background: "var(--tabstrip-background)",
							padding:
								"var(--tabstrip-inset) var(--tabstrip-inset) 0",
							boxShadow:
								"inset 0 calc(-1 * var(--panel-border-width)) 0 var(--panel-border-color)",
						}}
					>
						<span
							className="text-foreground flex h-6 items-center px-2 font-medium"
							style={{
								...tabBase,
								background: "var(--panel-background)",
								borderColor: "var(--panel-border-color)",
							}}
						>
							Telemetry
						</span>
						<span
							className="text-muted-foreground flex h-6 items-center px-2 font-medium"
							style={tabBase}
						>
							Map
						</span>
					</div>

					<div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 p-2">
						<div className="flex items-baseline justify-between gap-2">
							<span
								className="truncate text-sm"
								style={headingStyle}
							>
								Battery
							</span>
							<span className="text-muted-foreground font-mono">
								87.4 %
							</span>
						</div>
						<div className="flex flex-wrap items-center gap-1">
							<Button
								asChild
								size="sm"
								className="h-6 px-2 text-xs"
							>
								<span>Start</span>
							</Button>
							<Badge variant="success">OK</Badge>
							<Badge variant="warning">Warn</Badge>
							<Badge variant="destructive">Fault</Badge>
						</div>
					</div>

					<div
						className="pointer-events-none absolute inset-0 z-[1]"
						style={{
							borderRadius:
								"max(0px, calc(var(--panel-radius) - var(--panel-border-width)))",
							boxShadow: "var(--panel-inner-shadow)",
						}}
					/>
				</div>
			</div>
		</div>
	);
}

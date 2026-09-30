"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check, Palette } from "lucide-react";

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/dialog";
import type { ThemePreset } from "@workspace/ui/lib/theme-presets";
import { cn } from "@workspace/ui/lib/utils";

import { ThemePreviewMock, useThemePreviewStyles } from "./theme-preview";

export type { ThemePreset } from "@workspace/ui/lib/theme-presets";

interface ThemeConfiguratorProps {
	themes?: ThemePreset[];
	defaultThemeId?: string;
	storageKey?: string;
}

const DEFAULT_STORAGE_KEY = "ormi-theme-preset";
const DYNAMIC_THEME_STYLE_ID = "dynamic-theme-preset";
const APP_DEFAULT_THEME_ID = "__app-default__";
/** Page styles the preview cards must not take their base tokens from. */
const PREVIEW_EXCLUDED_STYLE_IDS = [DYNAMIC_THEME_STYLE_ID] as const;

/** The no-preset card: globals.css alone. */
const BASE_THEME: ThemePreset = {
	id: APP_DEFAULT_THEME_ID,
	name: "Base",
	movement: "No preset",
	css: "",
};

const applyThemePreset = (css: string | null) => {
	const existingStyle = document.getElementById(DYNAMIC_THEME_STYLE_ID);

	if (!css) {
		existingStyle?.remove();
		return;
	}

	const styleElement = existingStyle ?? document.createElement("style");
	styleElement.id = DYNAMIC_THEME_STYLE_ID;
	styleElement.textContent = css;

	if (!existingStyle) {
		document.head.appendChild(styleElement);
	}
};

const readStoredThemeId = (storageKey: string) => {
	try {
		return localStorage.getItem(storageKey);
	} catch {
		return null;
	}
};

const writeStoredThemeId = (storageKey: string, themeId: string) => {
	try {
		localStorage.setItem(storageKey, themeId);
	} catch {
		return;
	}
};

const resolveThemeId = ({
	themes,
	storedThemeId,
	defaultThemeId,
}: {
	themes: ThemePreset[];
	storedThemeId: string | null;
	defaultThemeId?: string;
}) => {
	if (storedThemeId === APP_DEFAULT_THEME_ID) {
		return APP_DEFAULT_THEME_ID;
	}

	if (storedThemeId && themes.some((theme) => theme.id === storedThemeId)) {
		return storedThemeId;
	}

	if (defaultThemeId && themes.some((theme) => theme.id === defaultThemeId)) {
		return defaultThemeId;
	}

	return APP_DEFAULT_THEME_ID;
};

/**
 * Theme preset picker: a navbar button opening a dialog of preview cards,
 * one per preset plus the no-preset base. Choosing a card applies it at once
 * (a `<style id="dynamic-theme-preset">` in the head) and stores its id in
 * local storage under `storageKey`.
 */
export function ThemeConfigurator({
	themes = [],
	defaultThemeId,
	storageKey = DEFAULT_STORAGE_KEY,
}: ThemeConfiguratorProps) {
	const [storedThemeId, setStoredThemeId] = useState(() => {
		if (typeof window === "undefined") {
			return null;
		}

		return readStoredThemeId(storageKey);
	});

	const selectedThemeId = useMemo(
		() =>
			resolveThemeId({
				themes,
				storedThemeId,
				defaultThemeId,
			}),
		[defaultThemeId, storedThemeId, themes],
	);

	const selectedTheme = useMemo(
		() => themes.find((theme) => theme.id === selectedThemeId) ?? null,
		[themes, selectedThemeId],
	);

	useEffect(() => {
		applyThemePreset(selectedTheme?.css ?? null);
	}, [selectedTheme]);

	const handleThemeChange = (themeId: string) => {
		setStoredThemeId(themeId);
		writeStoredThemeId(storageKey, themeId);
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" size="icon">
					<Palette className="h-4 w-4" />
					<span className="sr-only">Theme</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[85dvh] sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Palette className="h-5 w-5" />
						Theme
					</DialogTitle>
					<DialogDescription>
						Saved in this browser.
					</DialogDescription>
				</DialogHeader>

				<ThemePresetGrid
					themes={themes}
					selectedThemeId={selectedThemeId}
					defaultThemeId={defaultThemeId}
					onSelect={handleThemeChange}
				/>
			</DialogContent>
		</Dialog>
	);
}

interface ThemePresetGridProps {
	themes: ThemePreset[];
	selectedThemeId: string;
	defaultThemeId?: string;
	onSelect: (themeId: string) => void;
}

/**
 * The cards, as a radio group: arrow keys move between them, and a move
 * selects (and so applies) the card, as radios do. Mounted only while the
 * dialog is open, so the preview stylesheet exists only then.
 */
function ThemePresetGrid({
	themes,
	selectedThemeId,
	defaultThemeId,
	onSelect,
}: ThemePresetGridProps) {
	const cards = useMemo(() => [...themes, BASE_THEME], [themes]);
	useThemePreviewStyles(cards, PREVIEW_EXCLUDED_STYLE_IDS);

	return (
		<RadioGroupPrimitive.Root
			aria-label="Theme preset"
			value={selectedThemeId}
			onValueChange={onSelect}
			className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
		>
			{cards.map((theme) => (
				<ThemePresetCard
					key={theme.id}
					theme={theme}
					isDefault={theme.id === defaultThemeId}
				/>
			))}
		</RadioGroupPrimitive.Root>
	);
}

function ThemePresetCard({
	theme,
	isDefault,
}: {
	theme: ThemePreset;
	isDefault: boolean;
}) {
	const labelId = useId();
	const detailId = useId();
	const hasDetail = Boolean(theme.movement || theme.description);

	return (
		<RadioGroupPrimitive.Item
			value={theme.id}
			aria-labelledby={labelId}
			aria-describedby={hasDetail ? detailId : undefined}
			className={cn(
				"group bg-card text-card-foreground border-surface-border relative flex min-w-0 flex-col overflow-hidden rounded-lg border text-left shadow-xs transition-[color,box-shadow,outline-color] outline-none",
				"hover:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
				"data-[state=checked]:outline-primary data-[state=checked]:outline-2 data-[state=checked]:outline-offset-2 data-[state=checked]:outline-solid",
			)}
		>
			<ThemePreviewMock id={theme.id} />

			<span className="border-surface-border flex items-start gap-2 border-t px-3 py-2">
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex items-center gap-2">
						<span
							id={labelId}
							className="truncate text-sm font-medium"
						>
							{theme.name}
						</span>
						{isDefault && (
							<Badge variant="outline" className="text-[10px]">
								Default
							</Badge>
						)}
					</span>
					{hasDetail && (
						<span
							id={detailId}
							className="text-muted-foreground flex flex-col text-xs"
						>
							{theme.movement && <span>{theme.movement}</span>}
							{theme.description && (
								<span>{theme.description}</span>
							)}
						</span>
					)}
				</span>
				<span className="border-surface-border group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full border">
					<RadioGroupPrimitive.Indicator>
						<Check className="size-3.5" strokeWidth={3} />
					</RadioGroupPrimitive.Indicator>
				</span>
			</span>
		</RadioGroupPrimitive.Item>
	);
}

export default ThemeConfigurator;

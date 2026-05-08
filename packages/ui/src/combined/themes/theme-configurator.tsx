"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Palette, RotateCcw } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";

export interface ThemePreset {
	id: string;
	name: string;
	css: string;
}

interface ThemeConfiguratorProps {
	themes?: ThemePreset[];
	defaultThemeId?: string;
	storageKey?: string;
}

const DEFAULT_STORAGE_KEY = "ormi-theme-preset";
const DYNAMIC_THEME_STYLE_ID = "dynamic-theme-preset";
const APP_DEFAULT_THEME_ID = "__app-default__";

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

const clearStoredThemeId = (storageKey: string) => {
	try {
		localStorage.removeItem(storageKey);
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

export function ThemeConfigurator({
	themes = [],
	defaultThemeId,
	storageKey = DEFAULT_STORAGE_KEY,
}: ThemeConfiguratorProps) {
	const [storedThemeId, setStoredThemeId] = useState(() => {
		if (typeof window === "undefined") {
			return APP_DEFAULT_THEME_ID;
		}

		return readStoredThemeId(storageKey) ?? APP_DEFAULT_THEME_ID;
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

	const handleReset = () => {
		setStoredThemeId(APP_DEFAULT_THEME_ID);
		clearStoredThemeId(storageKey);
		applyThemePreset(null);
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" size="icon">
					<Palette className="h-4 w-4" />
					<span className="sr-only">Select Theme Preset</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Palette className="h-5 w-5" />
						Theme Presets
					</DialogTitle>
					<DialogDescription>
						Select a preset loaded from server-side CSS theme files.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="theme-preset-selector">Preset</Label>
						<Select
							value={selectedThemeId}
							onValueChange={handleThemeChange}
							disabled={themes.length === 0}
						>
							<SelectTrigger
								id="theme-preset-selector"
								className="w-full"
							>
								<SelectValue
									placeholder={
										themes.length === 0
											? "No theme presets found"
											: "Select a theme preset"
									}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={APP_DEFAULT_THEME_ID}>
									App Default
								</SelectItem>
								{themes.map((theme) => (
									<SelectItem key={theme.id} value={theme.id}>
										{theme.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex justify-end">
						<Button
							onClick={handleReset}
							variant="outline"
							size="sm"
						>
							<RotateCcw className="mr-1 h-4 w-4" />
							Reset
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export default ThemeConfigurator;

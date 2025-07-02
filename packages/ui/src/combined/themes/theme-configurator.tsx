"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Palette, Upload, RotateCcw, Save, Settings, Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"
import { formatHex, oklch } from "culori"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Input } from "@workspace/ui/components/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Separator } from "@workspace/ui/components/separator"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Slider } from "@workspace/ui/components/slider"

// Define the theme configuration structure
export interface ThemeConfig {
    name: string
    light: {
        background: string
        foreground: string
        card: string
        "card-foreground": string
        popover: string
        "popover-foreground": string
        primary: string
        "primary-foreground": string
        secondary: string
        "secondary-foreground": string
        muted: string
        "muted-foreground": string
        accent: string
        "accent-foreground": string
        destructive: string
        "destructive-foreground": string
        border: string
        input: string
        ring: string
        radius: string
        "chart-1": string
        "chart-2": string
        "chart-3": string
        "chart-4": string
        "chart-5": string
        sidebar: string
        "sidebar-foreground": string
        "sidebar-primary": string
        "sidebar-primary-foreground": string
        "sidebar-accent": string
        "sidebar-accent-foreground": string
        "sidebar-border": string
        "sidebar-ring": string
    }
    dark: {
        background: string
        foreground: string
        card: string
        "card-foreground": string
        popover: string
        "popover-foreground": string
        primary: string
        "primary-foreground": string
        secondary: string
        "secondary-foreground": string
        muted: string
        "muted-foreground": string
        accent: string
        "accent-foreground": string
        destructive: string
        "destructive-foreground": string
        border: string
        input: string
        ring: string
        "chart-1": string
        "chart-2": string
        "chart-3": string
        "chart-4": string
        "chart-5": string
        sidebar: string
        "sidebar-foreground": string
        "sidebar-primary": string
        "sidebar-primary-foreground": string
        "sidebar-accent": string
        "sidebar-accent-foreground": string
        "sidebar-border": string
        "sidebar-ring": string
    }
}

interface ThemeConfiguratorProps {
    onLoad?: () => Promise<ThemeConfig | null>
    onSave?: (config: ThemeConfig) => Promise<void>
    initialConfig?: ThemeConfig
}

// Predefined color themes from shadcn/ui
const predefinedThemes = [
    {
        name: "Zinc",
        light: { primary: "oklch(0.145 0 0)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.985 0 0)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Slate",
        light: { primary: "oklch(0.151 0.008 256.848)", secondary: "oklch(0.969 0.002 256.848)", accent: "oklch(0.923 0.006 256.848)" },
        dark: { primary: "oklch(0.984 0.003 256.848)", secondary: "oklch(0.277 0.011 256.848)", accent: "oklch(0.277 0.011 256.848)" }
    },
    {
        name: "Stone",
        light: { primary: "oklch(0.154 0.003 49.748)", secondary: "oklch(0.969 0.003 49.748)", accent: "oklch(0.924 0.007 49.748)" },
        dark: { primary: "oklch(0.984 0.002 49.748)", secondary: "oklch(0.278 0.006 49.748)", accent: "oklch(0.278 0.006 49.748)" }
    },
    {
        name: "Gray",
        light: { primary: "oklch(0.145 0 0)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.985 0 0)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Neutral",
        light: { primary: "oklch(0.145 0 0)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.985 0 0)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Red",
        light: { primary: "oklch(0.577 0.245 27.325)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.637 0.237 25.331)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Rose",
        light: { primary: "oklch(0.588 0.229 7.36)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.651 0.22 7.36)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Orange",
        light: { primary: "oklch(0.654 0.218 70.67)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.738 0.21 70.67)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Green",
        light: { primary: "oklch(0.546 0.176 145.97)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.629 0.17 145.97)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Blue",
        light: { primary: "oklch(0.571 0.191 252.07)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.664 0.185 252.07)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Yellow",
        light: { primary: "oklch(0.832 0.182 85.04)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.888 0.175 85.04)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    },
    {
        name: "Violet",
        light: { primary: "oklch(0.627 0.198 293.71)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.922 0 0)" },
        dark: { primary: "oklch(0.734 0.193 293.71)", secondary: "oklch(0.269 0 0)", accent: "oklch(0.269 0 0)" }
    }
]

// Default theme configuration based on the current globals.css
const defaultThemeConfig: ThemeConfig = {
    name: "Default",
    light: {
        background: "oklch(1 0 0)",
        foreground: "oklch(0.145 0 0)",
        card: "oklch(1 0 0)",
        "card-foreground": "oklch(0.145 0 0)",
        popover: "oklch(1 0 0)",
        "popover-foreground": "oklch(0.145 0 0)",
        primary: "oklch(0.205 0 0)",
        "primary-foreground": "oklch(0.985 0 0)",
        secondary: "oklch(0.97 0 0)",
        "secondary-foreground": "oklch(0.205 0 0)",
        muted: "oklch(0.97 0 0)",
        "muted-foreground": "oklch(0.556 0 0)",
        accent: "oklch(0.97 0 0)",
        "accent-foreground": "oklch(0.205 0 0)",
        destructive: "oklch(0.577 0.245 27.325)",
        "destructive-foreground": "oklch(0.577 0.245 27.325)",
        border: "oklch(0.922 0 0)",
        input: "oklch(0.922 0 0)",
        ring: "oklch(0.708 0 0)",
        radius: "0.5rem",
        "chart-1": "oklch(0.646 0.222 41.116)",
        "chart-2": "oklch(0.6 0.118 184.704)",
        "chart-3": "oklch(0.398 0.07 227.392)",
        "chart-4": "oklch(0.828 0.189 84.429)",
        "chart-5": "oklch(0.769 0.188 70.08)",
        sidebar: "oklch(0.985 0 0)",
        "sidebar-foreground": "oklch(0.145 0 0)",
        "sidebar-primary": "oklch(0.205 0 0)",
        "sidebar-primary-foreground": "oklch(0.985 0 0)",
        "sidebar-accent": "oklch(0.97 0 0)",
        "sidebar-accent-foreground": "oklch(0.205 0 0)",
        "sidebar-border": "oklch(0.922 0 0)",
        "sidebar-ring": "oklch(0.708 0 0)"
    },
    dark: {
        background: "oklch(0.145 0 0)",
        foreground: "oklch(0.985 0 0)",
        card: "oklch(0.145 0 0)",
        "card-foreground": "oklch(0.985 0 0)",
        popover: "oklch(0.145 0 0)",
        "popover-foreground": "oklch(0.985 0 0)",
        primary: "oklch(0.985 0 0)",
        "primary-foreground": "oklch(0.205 0 0)",
        secondary: "oklch(0.269 0 0)",
        "secondary-foreground": "oklch(0.985 0 0)",
        muted: "oklch(0.269 0 0)",
        "muted-foreground": "oklch(0.708 0 0)",
        accent: "oklch(0.269 0 0)",
        "accent-foreground": "oklch(0.985 0 0)",
        destructive: "oklch(0.396 0.141 25.723)",
        "destructive-foreground": "oklch(0.637 0.237 25.331)",
        border: "oklch(0.269 0 0)",
        input: "oklch(0.269 0 0)",
        ring: "oklch(0.556 0 0)",
        "chart-1": "oklch(0.488 0.243 264.376)",
        "chart-2": "oklch(0.696 0.17 162.48)",
        "chart-3": "oklch(0.769 0.188 70.08)",
        "chart-4": "oklch(0.627 0.265 303.9)",
        "chart-5": "oklch(0.645 0.246 16.439)",
        sidebar: "oklch(0.205 0 0)",
        "sidebar-foreground": "oklch(0.985 0 0)",
        "sidebar-primary": "oklch(0.488 0.243 264.376)",
        "sidebar-primary-foreground": "oklch(0.985 0 0)",
        "sidebar-accent": "oklch(0.269 0 0)",
        "sidebar-accent-foreground": "oklch(0.985 0 0)",
        "sidebar-border": "oklch(0.269 0 0)",
        "sidebar-ring": "oklch(0.439 0 0)"
    }
}

// localStorage utilities for theme configuration
const THEME_CONFIG_KEY = 'ormi-theme-config';

const saveThemeToLocalStorage = (config: ThemeConfig): void => {
    try {
        localStorage.setItem(THEME_CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
        console.error('Failed to save theme to localStorage:', error);
    }
};

const loadThemeFromLocalStorage = (): ThemeConfig | null => {
    try {
        const stored = localStorage.getItem(THEME_CONFIG_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Validate that the stored config has the required structure
            if (parsed && typeof parsed === 'object' && parsed.name && parsed.light && parsed.dark) {
                return parsed as ThemeConfig;
            }
        }
    } catch (error) {
        console.error('Failed to load theme from localStorage:', error);
    }
    return null;
};

const clearThemeFromLocalStorage = (): void => {
    try {
        localStorage.removeItem(THEME_CONFIG_KEY);
    } catch (error) {
        console.error('Failed to clear theme from localStorage:', error);
    }
};

export function ThemeConfigurator({ onLoad, onSave, initialConfig }: ThemeConfiguratorProps) {
    const { theme, setTheme } = useTheme()

    // Initialize with localStorage data, fallback to initialConfig or default
    const [currentConfig, setCurrentConfig] = useState<ThemeConfig>(() => {
        if (typeof window !== 'undefined') {
            const savedConfig = loadThemeFromLocalStorage();
            if (savedConfig) return savedConfig;
        }
        return initialConfig || defaultThemeConfig;
    });

    const [previewMode, setPreviewMode] = useState<"light" | "dark">("light")
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isAdvancedMode, setIsAdvancedMode] = useState(false)
    const [shadowIntensity, setShadowIntensity] = useState(50)
    const [borderIntensity, setBorderIntensity] = useState(50)

    // Apply theme to CSS variables
    const applyTheme = useCallback((config: ThemeConfig) => {
        const root = document.documentElement

        // Check if dark mode is currently active using useTheme hook or fallback to class check
        const isDarkMode = theme === 'dark' || document.documentElement.classList.contains('dark')

        // Apply the appropriate theme to :root based on current mode
        const themeToApply = isDarkMode ? config.dark : config.light
        Object.entries(themeToApply).forEach(([key, value]) => {
            root.style.setProperty(`--${key}`, value)
        })

        // Update or create dark theme CSS for .dark selector
        const darkVars = Object.entries(config.dark).map(([key, value]) => {
            return `    --${key}: ${value};`
        }).join('\n')

        // Update or create dark theme CSS
        let darkStyleElement = document.getElementById('dynamic-dark-theme')
        if (!darkStyleElement) {
            darkStyleElement = document.createElement('style')
            darkStyleElement.id = 'dynamic-dark-theme'
            document.head.appendChild(darkStyleElement)
        }

        darkStyleElement.textContent = `.dark {\n${darkVars}\n}`
    }, [theme])

    // Load theme configuration
    const handleLoad = async () => {
        if (!onLoad) return

        setIsLoading(true)
        try {
            const config = await onLoad()
            if (config) {
                updateConfig(config)
            }
        } catch (error) {
            console.error('Failed to load theme configuration:', error)
        } finally {
            setIsLoading(false)
        }
    }

    // Save theme configuration
    const handleSave = async () => {
        if (!onSave) return

        setIsSaving(true)
        try {
            await onSave(currentConfig)
        } catch (error) {
            console.error('Failed to save theme configuration:', error)
        } finally {
            setIsSaving(false)
        }
    }

    // Reset to default theme
    const handleReset = () => {
        updateConfig(defaultThemeConfig)
    }

    // Update a specific theme property
    const updateThemeProperty = (mode: "light" | "dark", property: string, value: string) => {
        const updatedConfig = {
            ...currentConfig,
            [mode]: {
                ...currentConfig[mode],
                [property]: value
            }
        }
        updateConfig(updatedConfig)
    }

    // Update configuration and save to localStorage
    const updateConfig = useCallback((newConfig: ThemeConfig) => {
        setCurrentConfig(newConfig);
        saveThemeToLocalStorage(newConfig);
        applyTheme(newConfig);
    }, [applyTheme]);

    // Apply predefined theme
    const applyPredefinedTheme = (themeName: string) => {
        const theme = predefinedThemes.find(t => t.name === themeName)
        if (!theme) return

        const updatedConfig = {
            ...currentConfig,
            name: themeName,
            light: {
                ...currentConfig.light,
                primary: theme.light.primary,
                secondary: theme.light.secondary,
                accent: theme.light.accent,
                border: theme.light.accent,
                input: theme.light.accent
            },
            dark: {
                ...currentConfig.dark,
                primary: theme.dark.primary,
                secondary: theme.dark.secondary,
                accent: theme.dark.accent,
                border: theme.dark.accent,
                input: theme.dark.accent
            }
        }
        updateConfig(updatedConfig)
    }

    // Update shadow intensity
    const updateShadowIntensity = (intensity: number) => {
        setShadowIntensity(intensity)
        // Apply shadow intensity by modifying CSS variables
        const root = document.documentElement
        const opacity = intensity / 100 * 0.1 // Scale to reasonable opacity range
        root.style.setProperty('--shadow-intensity', opacity.toString())
    }

    // Update border intensity
    const updateBorderIntensity = (intensity: number) => {
        setBorderIntensity(intensity)
        // Apply border intensity by modifying border colors
        const currentBorder = currentConfig[previewMode].border
        // Extract OKLCH values and modify lightness
        const match = currentBorder.match(/oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s)]+)\s*\)/)
        if (match && match[1] && match[2] && match[3]) {
            const l = parseFloat(match[1])
            const c = parseFloat(match[2])
            const h = parseFloat(match[3])
            // Reverse the logic: higher intensity = lower lightness (darker borders)
            const adjustedL = Math.max(0, Math.min(1, l * (2 - intensity / 50))) // Scale based on intensity (reversed)
            const newBorder = `oklch(${adjustedL.toFixed(3)} ${c} ${h})`
            updateThemeProperty(previewMode, 'border', newBorder)
            updateThemeProperty(previewMode, 'input', newBorder)
        }
    }

    // Apply theme on mount and listen for theme changes
    useEffect(() => {
        applyTheme(currentConfig)

        // Listen for dark mode changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    // Reapply theme when dark mode class changes
                    applyTheme(currentConfig)
                }
            })
        })

        // Observe changes to the document element's class attribute
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        })

        // Cleanup observer on unmount
        return () => observer.disconnect()
    }, [currentConfig, applyTheme, theme])

    // Convert OKLCH to HEX using Culori for accurate color conversion
    const oklchToHex = (oklchValue: string): string => {
        if (!oklchValue || !oklchValue.includes('oklch')) {
            console.warn('Invalid OKLCH value:', oklchValue);
            return '#000000';
        }

        try {
            // Parse the OKLCH string manually to get values
            const match = oklchValue.match(/oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s)]+)\s*\)/);
            if (!match) {
                console.warn('Failed to parse OKLCH format:', oklchValue);
                return '#000000';
            }

            const l = parseFloat(match[1] || '0');
            const c = parseFloat(match[2] || '0');
            const h = parseFloat(match[3] || '0');

            // Validate parsed values
            if (isNaN(l) || isNaN(c) || isNaN(h)) {
                console.warn('Invalid OKLCH values after parsing:', { l, c, h, original: oklchValue });
                return '#000000';
            }

            // Create color object that Culori can work with
            const colorObject = {
                mode: 'oklch' as const,
                l: l,
                c: c,
                h: h
            };



            // Convert to HEX using Culori
            const hexColor = formatHex(colorObject);


            if (!hexColor) {
                console.warn('Failed to format HEX from OKLCH:', oklchValue, colorObject);

                // Fallback for grayscale colors (when chroma is 0 or very low)
                if (c < 0.01) {
                    const gray = Math.round(l * 255);
                    const grayHex = gray.toString(16).padStart(2, '0');
                    const fallbackColor = `#${grayHex}${grayHex}${grayHex}`;

                    return fallbackColor;
                }
                return '#000000';
            }


            return hexColor;
        } catch (error) {
            console.warn('Failed to convert OKLCH to HEX:', oklchValue, error);

            // Try a manual fallback for simple cases
            const match = oklchValue.match(/oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s)]+)\s*\)/);
            if (match) {
                const l = parseFloat(match[1] || '0');
                const c = parseFloat(match[2] || '0');

                // Simple grayscale fallback for low chroma colors
                if (!isNaN(l) && c < 0.01) {
                    const gray = Math.round(l * 255);
                    const grayHex = gray.toString(16).padStart(2, '0');
                    const fallbackColor = `#${grayHex}${grayHex}${grayHex}`;

                    return fallbackColor;
                }
            }
            return '#000000';
        }
    }

    // Convert HEX to OKLCH using Culori for accurate color conversion
    const hexToOklch = (hexValue: string): string => {
        if (!hexValue.startsWith('#')) return 'oklch(0.5 0.1 180)';

        try {
            // Convert HEX to OKLCH using Culori
            const color = oklch(hexValue);
            if (!color) return 'oklch(0.5 0.1 180)';

            // Format as OKLCH string
            const l = (color.l || 0).toFixed(3);
            const c = (color.c || 0).toFixed(3);
            const h = color.h !== undefined ? Math.round(color.h) : 0;

            return `oklch(${l} ${c} ${h})`;
        } catch (error) {
            console.warn('Failed to convert HEX to OKLCH:', hexValue, error);
            return 'oklch(0.5 0.1 180)';
        }
    }

    const SimpleThemeSelector = () => {
        return (
            <div className="space-y-6">
                {/* Theme Mode Selector */}
                <ThemeModeSelector />

                <Separator />

                {/* Predefined Theme Colors */}
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Theme Color</Label>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {predefinedThemes.map((theme) => {
                            const hexColor = oklchToHex(theme.light.primary);

                            return (
                                <Button
                                    key={theme.name}
                                    variant={currentConfig.name === theme.name ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => applyPredefinedTheme(theme.name)}
                                    className="h-auto flex flex-col gap-1 p-3"
                                >
                                    <div
                                        className="w-6 h-6 rounded-full border-2 border-border"
                                        style={{ backgroundColor: hexColor }}
                                    />
                                    <span className="text-xs">{theme.name}</span>
                                </Button>
                            );
                        })}
                    </div>
                </div>

                <Separator />

                {/* Border Radius */}
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Border Radius</Label>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: "None", value: "0rem" },
                            { label: "Small", value: "0.25rem" },
                            { label: "Medium", value: "0.5rem" },
                            { label: "Default", value: "0.625rem" },
                            { label: "Large", value: "0.75rem" },
                            { label: "Extra Large", value: "1rem" },
                        ].map((option) => (
                            <Button
                                key={option.value}
                                variant={currentConfig.light.radius === option.value ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    const updatedConfig = {
                                        ...currentConfig,
                                        light: { ...currentConfig.light, radius: option.value },
                                        dark: { ...currentConfig.dark, radius: option.value }
                                    }
                                    updateConfig(updatedConfig)
                                }}
                                className="text-xs"
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <Separator />

                {/* Shadow Intensity */}
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Shadow Intensity</Label>
                    <div className="space-y-2">
                        <Slider
                            value={[shadowIntensity]}
                            onValueChange={(value) => updateShadowIntensity(value[0] ?? 50)}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>None</span>
                            <span>{shadowIntensity}%</span>
                            <span>Strong</span>
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Border Intensity */}
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Border Intensity</Label>
                    <div className="space-y-2">
                        <Slider
                            value={[borderIntensity]}
                            onValueChange={(value) => updateBorderIntensity(value[0] ?? 50)}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Subtle</span>
                            <span>{borderIntensity}%</span>
                            <span>Bold</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const ColorInput = ({
        label,
        property,
        mode
    }: {
        label: string
        property: string
        mode: "light" | "dark"
    }) => {
        const themeConfig = currentConfig[mode] as Record<string, string>
        const oklchValue = themeConfig[property] || ""
        const hexValue = oklchToHex(oklchValue)

        const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const newHex = e.target.value
            const newOklch = hexToOklch(newHex)
            updateThemeProperty(mode, property, newOklch)
        }

        const handleOklchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            updateThemeProperty(mode, property, e.target.value)
        }

        return (
            <div className="space-y-2">
                <Label htmlFor={`${mode}-${property}`} className="text-sm font-medium">
                    {label}
                </Label>
                <div className="flex gap-2">
                    <input
                        type="color"
                        value={hexValue}
                        onChange={handleColorChange}
                        className="w-12 h-9 rounded border border-border cursor-pointer"
                        title="Pick color"
                    />
                    <Input
                        id={`${mode}-${property}`}
                        value={oklchValue}
                        onChange={handleOklchChange}
                        className="font-mono text-xs flex-1"
                        placeholder="oklch(0.5 0.1 180)"
                    />
                </div>
            </div>
        )
    }

    const RadiusInput = () => {
        const radiusOptions = [
            { label: "None", value: "0rem" },
            { label: "Small", value: "0.25rem" },
            { label: "Medium", value: "0.5rem" },
            { label: "Default", value: "0.625rem" },
            { label: "Large", value: "0.75rem" },
            { label: "Extra Large", value: "1rem" },
        ]

        const updateRadius = (value: string) => {
            const updatedConfig = {
                ...currentConfig,
                light: { ...currentConfig.light, radius: value },
                dark: { ...currentConfig.dark, radius: value }
            }
            updateConfig(updatedConfig)
        }

        return (
            <div className="space-y-3">
                <Label className="text-sm font-medium">Border Radius (applies to both themes)</Label>
                <div className="grid grid-cols-3 gap-2">
                    {radiusOptions.map((option) => (
                        <Button
                            key={option.value}
                            variant={currentConfig.light.radius === option.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateRadius(option.value)}
                            className="text-xs"
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
                <Input
                    value={currentConfig.light.radius}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRadius(e.target.value)}
                    placeholder="0.625rem"
                    className="font-mono text-xs"
                />
            </div>
        )
    }

    const ThemeModeSelector = () => {
        return (
            <div className="space-y-3">
                <Label className="text-sm font-medium">Theme Mode</Label>
                <div className="grid grid-cols-3 gap-2">
                    <Button
                        variant={theme === "light" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("light")}
                        className="flex items-center gap-2"
                    >
                        <Sun className="h-4 w-4" />
                        Light
                    </Button>
                    <Button
                        variant={theme === "dark" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("dark")}
                        className="flex items-center gap-2"
                    >
                        <Moon className="h-4 w-4" />
                        Dark
                    </Button>
                    <Button
                        variant={theme === "system" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("system")}
                        className="flex items-center gap-2 text-xs"
                    >
                        System
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                    <Palette className="h-4 w-4" />
                    <span className="sr-only">Configure Theme</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Palette className="h-5 w-5" />
                        Theme Configurator
                    </DialogTitle>
                    <DialogDescription>
                        Customize your theme colors and save/load configurations. Changes are applied live to see the effects immediately.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex gap-4 mb-4">
                    <Input
                        value={currentConfig.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const updatedConfig = { ...currentConfig, name: e.target.value };
                            updateConfig(updatedConfig);
                        }}
                        placeholder="Theme name"
                        className="flex-1"
                    />
                    <div className="flex gap-2">
                        <Button
                            onClick={() => setIsAdvancedMode(!isAdvancedMode)}
                            variant="outline"
                            size="sm"
                        >
                            <Settings className="h-4 w-4 mr-1" />
                            {isAdvancedMode ? "Simple" : "Advanced"}
                        </Button>
                        {onLoad && (
                            <Button onClick={handleLoad} disabled={isLoading} variant="outline" size="sm">
                                <Upload className="h-4 w-4 mr-1" />
                                {isLoading ? "Loading..." : "Load"}
                            </Button>
                        )}
                        {onSave && (
                            <Button onClick={handleSave} disabled={isSaving} variant="outline" size="sm">
                                <Save className="h-4 w-4 mr-1" />
                                {isSaving ? "Saving..." : "Save"}
                            </Button>
                        )}
                        <Button onClick={handleReset} variant="outline" size="sm">
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reset
                        </Button>
                    </div>
                </div>

                {/* Theme Mode Selector for Advanced Mode */}
                {isAdvancedMode && (
                    <div className="mb-4">
                        <ThemeModeSelector />
                    </div>
                )}

                <div className="w-full">
                    {!isAdvancedMode ? (
                        <ScrollArea className="h-[500px] pr-4">
                            <SimpleThemeSelector />
                        </ScrollArea>
                    ) : (
                        <Tabs value={previewMode} onValueChange={(value: string) => setPreviewMode(value as "light" | "dark")}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="light">Light Theme</TabsTrigger>
                                <TabsTrigger value="dark">Dark Theme</TabsTrigger>
                            </TabsList>

                            <TabsContent value="light" className="mt-4">
                                <ScrollArea className="h-[500px] pr-4">
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <ColorInput label="Background" property="background" mode="light" />
                                            <ColorInput label="Foreground" property="foreground" mode="light" />
                                            <ColorInput label="Primary" property="primary" mode="light" />
                                            <ColorInput label="Primary Foreground" property="primary-foreground" mode="light" />
                                            <ColorInput label="Secondary" property="secondary" mode="light" />
                                            <ColorInput label="Secondary Foreground" property="secondary-foreground" mode="light" />
                                            <ColorInput label="Accent" property="accent" mode="light" />
                                            <ColorInput label="Accent Foreground" property="accent-foreground" mode="light" />
                                            <ColorInput label="Muted" property="muted" mode="light" />
                                            <ColorInput label="Muted Foreground" property="muted-foreground" mode="light" />
                                            <ColorInput label="Card" property="card" mode="light" />
                                            <ColorInput label="Card Foreground" property="card-foreground" mode="light" />
                                            <ColorInput label="Popover" property="popover" mode="light" />
                                            <ColorInput label="Popover Foreground" property="popover-foreground" mode="light" />
                                            <ColorInput label="Border" property="border" mode="light" />
                                            <ColorInput label="Input" property="input" mode="light" />
                                            <ColorInput label="Ring" property="ring" mode="light" />
                                            <ColorInput label="Destructive" property="destructive" mode="light" />
                                            <ColorInput label="Destructive Foreground" property="destructive-foreground" mode="light" />
                                        </div>
                                        <Separator />
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <ColorInput label="Chart 1" property="chart-1" mode="light" />
                                            <ColorInput label="Chart 2" property="chart-2" mode="light" />
                                            <ColorInput label="Chart 3" property="chart-3" mode="light" />
                                            <ColorInput label="Chart 4" property="chart-4" mode="light" />
                                            <ColorInput label="Chart 5" property="chart-5" mode="light" />
                                        </div>
                                        <Separator />
                                        <div className="space-y-3">
                                            <Label className="text-sm font-medium">Sidebar Colors</Label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <ColorInput label="Sidebar" property="sidebar" mode="light" />
                                                <ColorInput label="Sidebar Foreground" property="sidebar-foreground" mode="light" />
                                                <ColorInput label="Sidebar Primary" property="sidebar-primary" mode="light" />
                                                <ColorInput label="Sidebar Primary Foreground" property="sidebar-primary-foreground" mode="light" />
                                                <ColorInput label="Sidebar Accent" property="sidebar-accent" mode="light" />
                                                <ColorInput label="Sidebar Accent Foreground" property="sidebar-accent-foreground" mode="light" />
                                                <ColorInput label="Sidebar Border" property="sidebar-border" mode="light" />
                                                <ColorInput label="Sidebar Ring" property="sidebar-ring" mode="light" />
                                            </div>
                                        </div>
                                        <Separator />
                                        <div className="space-y-3">
                                            <Label className="text-sm font-medium">Local Storage</Label>
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    onClick={() => {
                                                        saveThemeToLocalStorage(currentConfig)
                                                        alert('Theme configuration saved to localStorage.')
                                                    }}
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    Save to localStorage
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        const loadedConfig = loadThemeFromLocalStorage()
                                                        if (loadedConfig) {
                                                            setCurrentConfig(loadedConfig)
                                                            applyTheme(loadedConfig)
                                                            alert('Theme configuration loaded from localStorage.')
                                                        } else {
                                                            alert('No valid theme configuration found in localStorage.')
                                                        }
                                                    }}
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    Load from localStorage
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        clearThemeFromLocalStorage()
                                                        alert('Theme configuration cleared from localStorage.')
                                                    }}
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    Clear localStorage
                                                </Button>
                                            </div>
                                        </div>
                                        <Separator />
                                        <RadiusInput />
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="dark" className="mt-4">
                                <ScrollArea className="h-[500px] pr-4">
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <ColorInput label="Background" property="background" mode="dark" />
                                            <ColorInput label="Foreground" property="foreground" mode="dark" />
                                            <ColorInput label="Primary" property="primary" mode="dark" />
                                            <ColorInput label="Primary Foreground" property="primary-foreground" mode="dark" />
                                            <ColorInput label="Secondary" property="secondary" mode="dark" />
                                            <ColorInput label="Secondary Foreground" property="secondary-foreground" mode="dark" />
                                            <ColorInput label="Accent" property="accent" mode="dark" />
                                            <ColorInput label="Accent Foreground" property="accent-foreground" mode="dark" />
                                            <ColorInput label="Muted" property="muted" mode="dark" />
                                            <ColorInput label="Muted Foreground" property="muted-foreground" mode="dark" />
                                            <ColorInput label="Card" property="card" mode="dark" />
                                            <ColorInput label="Card Foreground" property="card-foreground" mode="dark" />
                                            <ColorInput label="Popover" property="popover" mode="dark" />
                                            <ColorInput label="Popover Foreground" property="popover-foreground" mode="dark" />
                                            <ColorInput label="Border" property="border" mode="dark" />
                                            <ColorInput label="Input" property="input" mode="dark" />
                                            <ColorInput label="Ring" property="ring" mode="dark" />
                                            <ColorInput label="Destructive" property="destructive" mode="dark" />
                                            <ColorInput label="Destructive Foreground" property="destructive-foreground" mode="dark" />
                                        </div>
                                        <Separator />
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            <ColorInput label="Chart 1" property="chart-1" mode="dark" />
                                            <ColorInput label="Chart 2" property="chart-2" mode="dark" />
                                            <ColorInput label="Chart 3" property="chart-3" mode="dark" />
                                            <ColorInput label="Chart 4" property="chart-4" mode="dark" />
                                            <ColorInput label="Chart 5" property="chart-5" mode="dark" />
                                        </div>
                                        <Separator />
                                        <div className="space-y-3">
                                            <Label className="text-sm font-medium">Sidebar Colors</Label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <ColorInput label="Sidebar" property="sidebar" mode="dark" />
                                                <ColorInput label="Sidebar Foreground" property="sidebar-foreground" mode="dark" />
                                                <ColorInput label="Sidebar Primary" property="sidebar-primary" mode="dark" />
                                                <ColorInput label="Sidebar Primary Foreground" property="sidebar-primary-foreground" mode="dark" />
                                                <ColorInput label="Sidebar Accent" property="sidebar-accent" mode="dark" />
                                                <ColorInput label="Sidebar Accent Foreground" property="sidebar-accent-foreground" mode="dark" />
                                                <ColorInput label="Sidebar Border" property="sidebar-border" mode="dark" />
                                                <ColorInput label="Sidebar Ring" property="sidebar-ring" mode="dark" />
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default ThemeConfigurator

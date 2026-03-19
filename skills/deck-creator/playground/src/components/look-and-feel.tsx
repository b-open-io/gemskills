"use client";

import {
	ArrowDown01Icon,
	Moon01Icon,
	Sun01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import type { DeckAction, DeckState, ThemeConfig } from "@/lib/types";
import {
	DEFAULT_DARK_THEME,
	DEFAULT_LIGHT_THEME,
	THEME_COLOR_GROUPS,
	THEME_COLOR_KEYS,
} from "@/lib/types";
import {
	DECK_ASPECT_RATIO_LABELS,
	DECK_ASPECT_RATIOS,
	isDeckAspectRatio,
} from "@/lib/aspect-ratio";

interface LookAndFeelProps {
	state: DeckState;
	dispatch: React.Dispatch<DeckAction>;
}

const FONT_OPTIONS = [
	"Geist",
	"Geist Mono",
	"Geist Pixel",
	"Silkscreen",
	"Inter",
	"Inter Tight",
	"Space Grotesk",
	"Space Mono",
	"DM Sans",
	"DM Serif Display",
	"DM Mono",
	"IBM Plex Sans",
	"IBM Plex Serif",
	"IBM Plex Mono",
	"JetBrains Mono",
	"Outfit",
	"Sora",
	"Satoshi",
	"Manrope",
	"Plus Jakarta Sans",
	"Instrument Sans",
	"Instrument Serif",
] as const;

const FONT_OPTION_SET = new Set<string>(FONT_OPTIONS);

function extractPrimaryFontName(fontFamily?: string): string {
	const raw = (fontFamily || "").trim();
	if (!raw) return "";
	const first = raw.split(",")[0]?.trim() || "";
	return first.replace(/^['"]|['"]$/g, "");
}

function isSystemFontStack(fontFamily?: string): boolean {
	const raw = (fontFamily || "").toLowerCase();
	return (
		raw.includes("-apple-system") ||
		raw.includes("system-ui") ||
		raw.includes("blinkmacsystemfont") ||
		raw.includes("segoe ui")
	);
}

function normalizeFontFamilyForState(fontFamily?: string): string {
	const raw = (fontFamily || "").trim();
	if (!raw) return "";
	const primary = extractPrimaryFontName(raw);
	if (!primary) return "";
	if (FONT_OPTION_SET.has(primary)) return primary;
	if (isSystemFontStack(raw)) return "";
	return raw;
}

function getFontSelectValue(fontFamily?: string): string {
	const normalized = normalizeFontFamilyForState(fontFamily);
	if (!normalized) return "__default__";
	if (FONT_OPTION_SET.has(normalized)) return normalized;
	return `__custom__:${normalized}`;
}

function ColorField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	const hexValue = toHex(value);

	return (
		<div className="space-y-0.5">
			<Label className="text-[0.6rem] text-muted-foreground capitalize">
				{label.replace(/-/g, " ")}
			</Label>
			<div className="flex items-center gap-1">
				<input
					type="color"
					value={hexValue}
					className="h-5 w-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
					onChange={(e) => onChange(e.target.value)}
				/>
				<Input
					value={value}
					className="h-6 font-mono text-[0.55rem] px-1.5"
					onChange={(e) => onChange(e.target.value)}
				/>
			</div>
		</div>
	);
}

function toHex(color: string): string {
	if (color.startsWith("#")) return color.slice(0, 7);

	// oklch(L C H) → hex
	const oklchMatch = color.match(
		/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/,
	);
	if (oklchMatch) {
		return oklchToHex(
			Number.parseFloat(oklchMatch[1]),
			Number.parseFloat(oklchMatch[2]),
			Number.parseFloat(oklchMatch[3]),
		);
	}

	// rgb(r, g, b) or rgba(r, g, b, a)
	const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (rgbMatch) {
		const r = Number.parseInt(rgbMatch[1], 10).toString(16).padStart(2, "0");
		const g = Number.parseInt(rgbMatch[2], 10).toString(16).padStart(2, "0");
		const b = Number.parseInt(rgbMatch[3], 10).toString(16).padStart(2, "0");
		return `#${r}${g}${b}`;
	}

	// hsl(h, s%, l%) or hsl(h s% l%)
	const hslMatch = color.match(
		/^hsl\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?\s*\)/,
	);
	if (hslMatch) {
		return hslToHex(
			Number.parseFloat(hslMatch[1]),
			Number.parseFloat(hslMatch[2]),
			Number.parseFloat(hslMatch[3]),
		);
	}

	// Bare HSL: "262.1 83.3% 57.8%"
	const bareHsl = color.match(/^([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?$/);
	if (bareHsl) {
		return hslToHex(
			Number.parseFloat(bareHsl[1]),
			Number.parseFloat(bareHsl[2]),
			Number.parseFloat(bareHsl[3]),
		);
	}

	// Can't parse — use browser to resolve
	return browserResolveColor(color);
}

/** Convert oklch(L, C, H) to hex via OKLab intermediary. */
function oklchToHex(l: number, c: number, h: number): string {
	const hRad = (h * Math.PI) / 180;
	const labA = c * Math.cos(hRad);
	const labB = c * Math.sin(hRad);

	// OKLab → linear sRGB
	const l_ = l + 0.3963377774 * labA + 0.2158037573 * labB;
	const m_ = l - 0.1055613458 * labA - 0.0638541728 * labB;
	const s_ = l - 0.0894841775 * labA - 1.291485548 * labB;
	const lr = l_ * l_ * l_;
	const mr = m_ * m_ * m_;
	const sr = s_ * s_ * s_;

	const r = +4.0767416621 * lr - 3.3077115913 * mr + 0.2309699292 * sr;
	const g = -1.2684380046 * lr + 2.6097574011 * mr - 0.3413193965 * sr;
	const b = -0.0041960863 * lr - 0.7034186147 * mr + 1.707614701 * sr;

	// Linear sRGB → sRGB gamma
	const gamma = (x: number) =>
		x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
	const clamp = (x: number) =>
		Math.max(0, Math.min(255, Math.round(gamma(x) * 255)));

	return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

/** Use the browser's canvas to resolve any CSS color string to hex. */
function browserResolveColor(color: string): string {
	if (typeof document === "undefined") return "#888888";
	try {
		const ctx = document.createElement("canvas").getContext("2d");
		if (!ctx) return "#888888";
		ctx.fillStyle = color;
		const resolved = ctx.fillStyle; // browser normalizes to #rrggbb or rgba()
		if (resolved.startsWith("#")) return resolved;
		const m = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (m) {
			return `#${Number.parseInt(m[1], 10).toString(16).padStart(2, "0")}${Number.parseInt(m[2], 10).toString(16).padStart(2, "0")}${Number.parseInt(m[3], 10).toString(16).padStart(2, "0")}`;
		}
	} catch {
		// ignore
	}
	return "#888888";
}

/** Convert HSL (H S% L%) to hex. Handles the bare shadcn format: "262.1 83.3% 57.8%" */
function hslToHex(h: number, s: number, l: number): string {
	s /= 100;
	l /= 100;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * Math.max(0, Math.min(1, color)))
			.toString(16)
			.padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

/** Known CSS variable keys that map to theme config */
const KNOWN_THEME_KEYS = new Set([
	...THEME_COLOR_KEYS,
	"radius",
	"letter-spacing",
	"spacing",
	"shadow-color",
	"shadow-opacity",
	"shadow-blur",
	"shadow-spread",
	"shadow-offset-x",
	"shadow-offset-y",
	"font-sans",
	"font-serif",
	"font-mono",
]);

/**
 * Extract the CSS block for a given theme mode from pasted CSS.
 * If the CSS contains `:root { ... }` and `.dark { ... }`, returns
 * only the block matching `mode`. Otherwise returns the full input.
 */
function extractThemeBlock(css: string, mode: "light" | "dark"): string {
	// Fast path for standard TweakCN/shadcn CSS: explicitly capture :root and .dark
	// blocks to avoid false positives from lines like:
	// @custom-variant dark (&:is(.dark *));
	const rootMatch = css.match(/(?:^|\n)\s*:root\s*\{([\s\S]*?)\}/i);
	const darkMatch = css.match(/(?:^|\n)\s*\.dark\b[^{]*\{([\s\S]*?)\}/i);
	if (rootMatch && darkMatch) {
		return mode === "dark" ? darkMatch[1] : rootMatch[1];
	}

	// Find all top-level CSS blocks: selector { ... }
	// Use a brace-depth counter to handle nested braces
	const blocks: Array<{ selector: string; body: string }> = [];
	const blockRegex = /([^{}]+)\{/g;
	let m = blockRegex.exec(css);
	while (m !== null) {
		const selector = m[1].trim();
		const start = m.index + m[0].length;
		let depth = 1;
		let i = start;
		while (i < css.length && depth > 0) {
			if (css[i] === "{") depth++;
			else if (css[i] === "}") depth--;
			i++;
		}
		blocks.push({ selector, body: css.slice(start, i - 1) });
		blockRegex.lastIndex = i;
		m = blockRegex.exec(css);
	}

	// Check if we have both :root and .dark blocks
	const hasSelectorToken = (selector: string, token: ":root" | ".dark") =>
		selector
			.split(",")
			.map((s) => s.trim())
			.some(
				(s) =>
					s === token || s.startsWith(`${token}:`) || s.startsWith(`${token} `),
			);
	const rootBlock = blocks.find((b) => hasSelectorToken(b.selector, ":root"));
	const darkBlock = blocks.find((b) => hasSelectorToken(b.selector, ".dark"));

	if (rootBlock && darkBlock) {
		return mode === "dark" ? darkBlock.body : rootBlock.body;
	}
	// Only one mode or no selectors — use everything
	return css;
}

/** Parse a single CSS value into a normalized color or style string. */
function parseCssValue(rawValue: string, isColor: boolean): string {
	// Non-color vars — pass through
	if (!isColor) return rawValue;

	// Already hex
	if (rawValue.startsWith("#")) return rawValue;

	// oklch / oklab / rgb / hsl — functional notation
	if (/^(oklch|oklab|rgb|hsl)\(/.test(rawValue)) {
		// oklch — convert to hex for consistent picker display
		const oklchMatch = rawValue.match(
			/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/,
		);
		if (oklchMatch) {
			return oklchToHex(
				Number.parseFloat(oklchMatch[1]),
				Number.parseFloat(oklchMatch[2]),
				Number.parseFloat(oklchMatch[3]),
			);
		}

		// hsl(220, 9.1%, 20%) — comma-separated
		const hslComma = rawValue.match(
			/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/,
		);
		// hsl(220 9.1% 20%) — space-separated (TweakCN v4 format)
		const hslSpace = rawValue.match(
			/^hsl\(\s*([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?\s*\)/,
		);
		const hslMatch = hslComma || hslSpace;
		if (hslMatch) {
			return hslToHex(
				Number.parseFloat(hslMatch[1]),
				Number.parseFloat(hslMatch[2]),
				Number.parseFloat(hslMatch[3]),
			);
		}

		// oklab, rgb without comma, etc. — pass through
		return rawValue;
	}

	// Bare HSL: "262.1 83.3% 57.8%" (shadcn default format)
	const bareHsl = rawValue.match(/^([\d.]+)\s+([\d.]+)%?\s+([\d.]+)%?$/);
	if (bareHsl) {
		return hslToHex(
			Number.parseFloat(bareHsl[1]),
			Number.parseFloat(bareHsl[2]),
			Number.parseFloat(bareHsl[3]),
		);
	}

	// Unknown — store as-is
	return rawValue;
}

/**
 * Parse a pasted CSS block (from TweakCN or shadcn themes) into a ThemeConfig.
 * Handles hex, HSL (bare & wrapped), oklch, oklab, and rgb formats.
 * When both :root and .dark blocks are present, extracts from the matching mode.
 */
function parsePastedTheme(css: string, mode: "light" | "dark"): ThemeConfig {
	const block = extractThemeBlock(css, mode);
	const result: ThemeConfig = {};
	const varRegex = /--(\w[\w-]*):\s*([^;]+)/g;
	let match = varRegex.exec(block);
	while (match !== null) {
		const key = match[1];
		const rawValue = match[2].trim();
		if (KNOWN_THEME_KEYS.has(key)) {
			const isColor = THEME_COLOR_KEYS.includes(key);
			result[key] = parseCssValue(rawValue, isColor);
		}
		match = varRegex.exec(block);
	}
	return result;
}

function parsePastedThemeModes(css: string): {
	light: ThemeConfig;
	dark: ThemeConfig;
	hasBothModes: boolean;
} {
	const hasRoot = /:root\s*\{/i.test(css);
	const hasDark = /\.dark\b[^{]*\{/i.test(css);
	const hasBothModes = hasRoot && hasDark;
	if (!hasBothModes) {
		return {
			light: {},
			dark: {},
			hasBothModes: false,
		};
	}
	return {
		light: parsePastedTheme(css, "light"),
		dark: parsePastedTheme(css, "dark"),
		hasBothModes: true,
	};
}

function setThemeKey(
	dispatch: React.Dispatch<DeckAction>,
	current: ThemeConfig,
	key: string,
	value: string,
) {
	dispatch({
		type: "SET_FIELD",
		field: "themeConfig",
		value: { ...current, [key]: value },
	});
}

export function LookAndFeel({ state, dispatch }: LookAndFeelProps) {
	const tc = state.themeConfig;
	const mode = state.slideThemeMode;
	const [pasteOpen, setPasteOpen] = useState(false);
	const [pasteValue, setPasteValue] = useState("");
	const selectedFontValue = getFontSelectValue(state.fontFamily);
	const customFontValue = selectedFontValue.startsWith("__custom__:")
		? selectedFontValue.replace("__custom__:", "")
		: "";

	function resetToThemeDefaults() {
		const defaults = mode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
		dispatch({
			type: "SET_FIELD",
			field: "themeConfig",
			value: { ...defaults },
		});
	}

	async function persistThemeToDeck(next: {
		mode: "light" | "dark";
		themeConfig: ThemeConfig;
		themeModes: DeckState["themeModes"];
	}) {
		try {
			await fetch("/api/deck", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					deckDir: state.deckDir,
					aspectRatio: state.aspectRatio,
					fontFamily: state.fontFamily,
					slideThemeMode: next.mode,
					themeConfig: next.themeConfig,
					themeModes: next.themeModes,
					styleId: state.styleId,
					styleRecipeId: state.styleRecipeId,
					styleRecipes: state.styleRecipes,
					stylePrompt: state.stylePrompt,
					backgroundMedia: state.videoUrl,
				}),
			});
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Theme persist failed: ${msg}`);
			toast.error(`Theme save failed: ${msg}`);
		}
	}

	async function handlePasteApply() {
		const parsedModes = parsePastedThemeModes(pasteValue);
		const parsed = parsePastedTheme(pasteValue, mode);
		const count = Object.keys(parsed).length;
		if (count === 0) {
			toast.error(
				"No theme variables found. Paste CSS with --variable-name: value lines.",
			);
			return;
		}
		if (parsedModes.hasBothModes) {
			dispatch({
				type: "SET_FIELD",
				field: "themeModes",
				value: {
					light: { ...state.themeModes.light, ...parsedModes.light },
					dark: { ...state.themeModes.dark, ...parsedModes.dark },
				},
			});
		}
		const nextThemeModes = parsedModes.hasBothModes
			? {
					light: { ...state.themeModes.light, ...parsedModes.light },
					dark: { ...state.themeModes.dark, ...parsedModes.dark },
				}
			: state.themeModes;
		const nextThemeConfig = { ...tc, ...parsed };
		// Merge parsed values into current theme (don't replace unset keys)
		dispatch({
			type: "SET_FIELD",
			field: "themeConfig",
			value: nextThemeConfig,
		});
		// Extract font-sans if present and set as fontFamily
		if (parsed["font-sans"]) {
			dispatch({
				type: "SET_FIELD",
				field: "fontFamily",
				value: normalizeFontFamilyForState(parsed["font-sans"]),
			});
		}
		toast.success(`Applied ${count} theme variables`);
		await persistThemeToDeck({
			mode,
			themeConfig: nextThemeConfig,
			themeModes: nextThemeModes,
		});
		setPasteOpen(false);
		setPasteValue("");
	}

	return (
		<Collapsible defaultOpen className="group/collapsible">
			<SidebarGroup>
				<CollapsibleTrigger asChild>
					<SidebarGroupLabel className="cursor-pointer">
						Look & Feel
						<HugeiconsIcon
							icon={ArrowDown01Icon}
							className="ml-auto size-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90"
						/>
					</SidebarGroupLabel>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarGroupContent className="space-y-3 px-2">
						{/* ── Slide Theme Mode ── */}
						<div className="space-y-0.5">
							<Label className="text-[0.6rem] text-muted-foreground">
								Slide Mode
							</Label>
							<div className="flex h-7 rounded-md border bg-muted/50 p-0.5">
								<button
									type="button"
									className={`flex flex-1 items-center justify-center gap-1 rounded-sm text-[0.6rem] font-medium transition-colors ${
										mode === "light"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
									onClick={() => {
										dispatch({
											type: "SET_FIELD",
											field: "slideThemeMode",
											value: "light",
										});
									}}
								>
									<HugeiconsIcon icon={Sun01Icon} className="size-3" />
									Light
								</button>
								<button
									type="button"
									className={`flex flex-1 items-center justify-center gap-1 rounded-sm text-[0.6rem] font-medium transition-colors ${
										mode === "dark"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
									onClick={() => {
										dispatch({
											type: "SET_FIELD",
											field: "slideThemeMode",
											value: "dark",
										});
									}}
								>
									<HugeiconsIcon icon={Moon01Icon} className="size-3" />
									Dark
								</button>
							</div>
						</div>

						{/* ── Aspect Ratio ── */}
						<div className="space-y-0.5">
							<Label className="text-[0.6rem] text-muted-foreground">
								Aspect Ratio
							</Label>
							<Select
								value={state.aspectRatio}
								onValueChange={(v) => {
									if (!isDeckAspectRatio(v)) return;
									dispatch({
										type: "SET_FIELD",
										field: "aspectRatio",
										value: v,
									});
								}}
							>
								<SelectTrigger className="h-7 text-xs">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DECK_ASPECT_RATIOS.map((ratio) => (
										<SelectItem key={ratio} value={ratio}>
											{DECK_ASPECT_RATIO_LABELS[ratio]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* ── Font ── */}
						<div className="space-y-0.5">
							<Label className="text-[0.6rem] text-muted-foreground">
								Font
							</Label>
							<Select
								value={selectedFontValue}
								onValueChange={(v) =>
									dispatch({
										type: "SET_FIELD",
										field: "fontFamily",
										value:
											v === "__default__"
												? ""
												: v.startsWith("__custom__:")
													? customFontValue
													: v,
									})
								}
							>
								<SelectTrigger className="h-7 text-xs">
									<SelectValue placeholder="Let the model decide" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__default__">
										Let the model decide
									</SelectItem>
									{customFontValue ? (
										<SelectItem value={selectedFontValue}>
											Custom ({customFontValue})
										</SelectItem>
									) : null}
									<SelectGroup>
										<SelectLabel>Geist</SelectLabel>
										<SelectItem value="Geist">Geist</SelectItem>
										<SelectItem value="Geist Mono">Geist Mono</SelectItem>
										<SelectItem value="Geist Pixel">Geist Pixel</SelectItem>
										<SelectItem value="Silkscreen">Silkscreen</SelectItem>
									</SelectGroup>
									<SelectGroup>
										<SelectLabel>Inter</SelectLabel>
										<SelectItem value="Inter">Inter</SelectItem>
										<SelectItem value="Inter Tight">Inter Tight</SelectItem>
									</SelectGroup>
									<SelectGroup>
										<SelectLabel>Space</SelectLabel>
										<SelectItem value="Space Grotesk">Space Grotesk</SelectItem>
										<SelectItem value="Space Mono">Space Mono</SelectItem>
									</SelectGroup>
									<SelectGroup>
										<SelectLabel>DM</SelectLabel>
										<SelectItem value="DM Sans">DM Sans</SelectItem>
										<SelectItem value="DM Serif Display">
											DM Serif Display
										</SelectItem>
										<SelectItem value="DM Mono">DM Mono</SelectItem>
									</SelectGroup>
									<SelectGroup>
										<SelectLabel>IBM Plex</SelectLabel>
										<SelectItem value="IBM Plex Sans">IBM Plex Sans</SelectItem>
										<SelectItem value="IBM Plex Serif">
											IBM Plex Serif
										</SelectItem>
										<SelectItem value="IBM Plex Mono">IBM Plex Mono</SelectItem>
									</SelectGroup>
									<SelectGroup>
										<SelectLabel>JetBrains</SelectLabel>
										<SelectItem value="JetBrains Mono">
											JetBrains Mono
										</SelectItem>
									</SelectGroup>
									<SelectGroup>
										<SelectLabel>Other</SelectLabel>
										<SelectItem value="Outfit">Outfit</SelectItem>
										<SelectItem value="Sora">Sora</SelectItem>
										<SelectItem value="Satoshi">Satoshi</SelectItem>
										<SelectItem value="Manrope">Manrope</SelectItem>
										<SelectItem value="Plus Jakarta Sans">
											Plus Jakarta Sans
										</SelectItem>
										<SelectItem value="Instrument Sans">
											Instrument Sans
										</SelectItem>
										<SelectItem value="Instrument Serif">
											Instrument Serif
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>

						{/* ── Style Vars ── */}
						<div className="grid grid-cols-3 gap-2">
							<div className="space-y-0.5">
								<Label className="text-[0.6rem] text-muted-foreground">
									Radius
								</Label>
								<Input
									value={tc.radius || ""}
									placeholder="0.625rem"
									className="h-6 font-mono text-[0.55rem] px-1.5"
									onChange={(e) =>
										setThemeKey(dispatch, tc, "radius", e.target.value)
									}
								/>
							</div>
							<div className="space-y-0.5">
								<Label className="text-[0.6rem] text-muted-foreground">
									Spacing
								</Label>
								<Input
									value={tc.spacing || ""}
									placeholder="0.25rem"
									className="h-6 font-mono text-[0.55rem] px-1.5"
									onChange={(e) =>
										setThemeKey(dispatch, tc, "spacing", e.target.value)
									}
								/>
							</div>
							<div className="space-y-0.5">
								<Label className="text-[0.6rem] text-muted-foreground">
									Letter Sp.
								</Label>
								<Input
									value={tc["letter-spacing"] || ""}
									placeholder="0em"
									className="h-6 font-mono text-[0.55rem] px-1.5"
									onChange={(e) =>
										setThemeKey(dispatch, tc, "letter-spacing", e.target.value)
									}
								/>
							</div>
						</div>

						{/* ── Color Groups ── */}
						{THEME_COLOR_GROUPS.map((group) => (
							<Collapsible
								key={group.label}
								defaultOpen={
									group.label === "Base" || group.label === "Primary"
								}
							>
								<CollapsibleTrigger className="flex w-full items-center gap-1 text-[0.6rem] font-medium text-muted-foreground hover:text-foreground">
									<HugeiconsIcon
										icon={ArrowDown01Icon}
										className="size-2.5 transition-transform group-data-[state=closed]:-rotate-90"
									/>
									{group.label}
								</CollapsibleTrigger>
								<CollapsibleContent className="mt-1.5">
									<div
										className={
											group.keys.length <= 2
												? "grid grid-cols-2 gap-2"
												: group.keys.length <= 3
													? "grid grid-cols-3 gap-2"
													: "grid grid-cols-2 gap-2"
										}
									>
										{group.keys.map((key) => (
											<ColorField
												key={key}
												label={key}
												value={tc[key] || "#000000"}
												onChange={(v) => setThemeKey(dispatch, tc, key, v)}
											/>
										))}
									</div>
								</CollapsibleContent>
							</Collapsible>
						))}

						{/* Actions */}
						<div className="flex gap-1.5">
							<Button
								variant="ghost"
								size="sm"
								className="h-6 flex-1 text-[0.6rem] text-muted-foreground"
								onClick={resetToThemeDefaults}
							>
								Reset
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="h-6 flex-1 text-[0.6rem]"
								onClick={() => setPasteOpen(true)}
							>
								Paste Theme
							</Button>
						</div>
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>

			{/* Paste Theme Dialog */}
			<Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
				<DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="text-sm">Paste Theme</DialogTitle>
						<DialogDescription className="text-xs">
							Paste CSS from TweakCN, shadcn/ui, or any theme with CSS
							variables. Supports hex, HSL, and oklch formats.
						</DialogDescription>
					</DialogHeader>
					<Textarea
						value={pasteValue}
						onChange={(e) => setPasteValue(e.target.value)}
						placeholder={`:root {\n  --background: #0a0e1a;\n  --foreground: #e2e8f0;\n  --primary: #00d4aa;\n  --radius: 0.625rem;\n}`}
						className="min-h-48 max-h-[50vh] font-mono text-xs resize-y"
					/>
					<div className="flex justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="text-xs"
							onClick={() => {
								setPasteOpen(false);
								setPasteValue("");
							}}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							className="text-xs"
							onClick={handlePasteApply}
							disabled={!pasteValue.trim()}
						>
							Apply Theme
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</Collapsible>
	);
}

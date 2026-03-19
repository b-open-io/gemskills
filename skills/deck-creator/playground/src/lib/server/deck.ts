/**
 * Server-side deck utilities for Next.js API routes.
 * Extracted from playground_server.ts.
 */

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnnotationsFile, SlideData } from "../../../../scripts/parsers";
import {
	migrateMarkdownAnnotations,
	parseAnnotationsFile,
	parseDeckIndex,
	parseDeckPlan,
	parseTheme,
} from "../../../../scripts/parsers";
import { isDeckAspectRatio } from "../aspect-ratio";
import { getGoogleFontImportUrl, getPreferredFontStack } from "../font-catalog";
import type { StyleRecipeInfo } from "../style-recipes";
import { styleInstructionsDisallowShadows } from "../style-recipes";

interface Style {
	id: string;
	shortName: string;
	name: string;
	category: string;
	promptHints: string;
	tilePrompt: string;
}

interface StylesRegistry {
	version: string;
	categories: Record<string, string>;
	styles: Style[];
}

interface VideoLibraryEntry {
	prompt: string;
	composedPrompt?: string;
	createdAt: number;
	duration?: string;
	aspectRatio?: string;
	styleId?: string;
	styleRecipeId?: string | null;
	stylePrompt?: string;
	themeConfig?: Record<string, string>;
}

interface VideoLibraryFile {
	videos: Record<string, VideoLibraryEntry>;
}

const SCOPED_ANNOTATION_KEY = /^\d+:(image|html)(:.+)?$/;

function sanitizeStyleRecipes(raw: unknown): StyleRecipeInfo[] {
	if (!Array.isArray(raw)) return [];
	const out: StyleRecipeInfo[] = [];
	const seen = new Set<string>();

	for (const recipe of raw) {
		if (!recipe || typeof recipe !== "object") continue;
		const r = recipe as Partial<StyleRecipeInfo>;
		const id = r.id?.trim();
		const name = r.name?.trim();
		const description = r.description?.trim();
		if (!id || !name || !description) continue;
		if (seen.has(id)) continue;
		seen.add(id);
		out.push({
			id,
			name,
			description,
			instructions: r.instructions?.trim() || undefined,
		});
	}

	return out;
}

function sanitizeLegacyAnnotations(
	annotations: Record<string, unknown[]>,
): Record<string, unknown[]> {
	const normalized: Record<string, unknown[]> = {};

	for (const [rawKey, value] of Object.entries(annotations || {})) {
		if (!Array.isArray(value)) continue;
		let key = rawKey.trim();

		if (/^\d+$/.test(key)) {
			key = `${key}:image`;
		}

		if (!SCOPED_ANNOTATION_KEY.test(key)) continue;
		normalized[key] = value;
	}

	for (const key of Object.keys(normalized)) {
		const parts = key.split(":");
		if (parts.length !== 2) continue;
		const hasVariantScoped = Object.keys(normalized).some((k) =>
			k.startsWith(`${key}:`),
		);
		if (hasVariantScoped) {
			delete normalized[key];
		}
	}

	return normalized;
}

function uniqueSortedDesc(items: string[]): string[] {
	return Array.from(new Set(items)).sort((a, b) => b.localeCompare(a));
}

export type { SlideData, AnnotationsFile };
export {
	migrateMarkdownAnnotations,
	parseAnnotationsFile,
	serializeAnnotationsFile,
} from "../../../../scripts/parsers";

// ── Paths ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
// From playground/src/lib/server/ -> skills/deck-creator/
const SKILL_ROOT = resolve(__dirname, "../../../../");
const STYLES_PATH = resolve(
	SKILL_ROOT,
	"../browsing-styles/assets/styles.json",
);
const TILES_DIR = resolve(SKILL_ROOT, "../browsing-styles/assets/tiles");
const BUILD_PRESENTER = resolve(SKILL_ROOT, "scripts/build_presenter.ts");
const VIDEO_LIBRARY_FILENAME = "VIDEOS.json";
const STYLE_RECIPES_FILENAME = "STYLE_RECIPES.json";
const GLOBAL_STYLE_RECIPES_FILENAME = "deck-creator-style-recipes.json";
const GLOBAL_VIDEO_LIBRARY_FILENAME = "deck-creator-videos.json";
const GLOBAL_MEDIA_DIRNAME = "deck-creator-media";
const GLOBAL_MEDIA_VIDEOS_DIRNAME = "videos";
const GLOBAL_MEDIA_BACKGROUNDS_DIRNAME = "backgrounds";

export { TILES_DIR, BUILD_PRESENTER };

// ── Deck directory (set by CLI arg via env var) ──────────────────────
// Use globalThis so all Next.js route handlers share the same state,
// even when Turbopack creates separate module contexts per route.

interface DeckDirState {
	deckDir: string;
	slidesSubdir: "slides" | "pages";
	slidesDir: string;
	generatedDir: string;
	deckSelected: boolean;
}

const g = globalThis as unknown as { __deckState?: DeckDirState };

function getState(): DeckDirState {
	if (!g.__deckState) {
		g.__deckState = {
			deckDir: "",
			slidesSubdir: "slides",
			slidesDir: "",
			generatedDir: "",
			deckSelected: false,
		};
	}
	return g.__deckState;
}

function initDeckDir(dir: string, deckSelected: boolean) {
	const st = getState();
	st.deckDir = resolve(dir);
	st.deckSelected = deckSelected;

	const pagesDir = join(st.deckDir, "pages");
	const defaultSlidesDir = join(st.deckDir, "slides");
	st.slidesSubdir =
		existsSync(pagesDir) && !existsSync(defaultSlidesDir) ? "pages" : "slides";
	st.slidesDir = st.slidesSubdir === "pages" ? pagesDir : defaultSlidesDir;
	st.generatedDir = join(st.deckDir, "generated");

	if (!existsSync(st.deckDir)) mkdirSync(st.deckDir, { recursive: true });
	if (!existsSync(st.slidesDir)) mkdirSync(st.slidesDir, { recursive: true });
	if (!existsSync(st.generatedDir))
		mkdirSync(st.generatedDir, { recursive: true });
}

export function getDeckDir(): string {
	const st = getState();
	if (!st.deckDir) {
		const envDir = process.env.DECK_DIR?.trim();
		const baseDir = envDir && envDir.length > 0 ? envDir : process.cwd();
		initDeckDir(baseDir, Boolean(envDir && envDir.length > 0));
	}
	return st.deckDir;
}

/** Switch to a different deck directory at runtime. */
export function switchDeckDir(newDir: string): void {
	const resolved = resolve(newDir);
	if (!existsSync(resolved)) {
		throw new Error(`Deck directory does not exist: ${resolved}`);
	}
	initDeckDir(resolved, true);
}

export function hasExplicitDeckSelection(): boolean {
	getDeckDir();
	return getState().deckSelected;
}

export function getSlidesDir(): string {
	getDeckDir();
	return getState().slidesDir;
}

export function getSlidesSubdir(): "slides" | "pages" {
	getDeckDir();
	return getState().slidesSubdir;
}

export function getGeneratedDir(): string {
	getDeckDir();
	return getState().generatedDir;
}

function globalStyleRecipesPath(): string {
	const home = process.env.HOME?.trim();
	if (!home) {
		throw new Error(
			"HOME is not set; cannot resolve global style recipe store",
		);
	}
	return resolve(home, ".gemskills", GLOBAL_STYLE_RECIPES_FILENAME);
}

function gemskillsHomeDir(): string {
	const home = process.env.HOME?.trim();
	if (!home) {
		throw new Error("HOME is not set; cannot resolve global GemSkills store");
	}
	return resolve(home, ".gemskills");
}

function globalMediaRootDir(create = false): string {
	const root = resolve(gemskillsHomeDir(), GLOBAL_MEDIA_DIRNAME);
	if (create && !existsSync(root)) mkdirSync(root, { recursive: true });
	return root;
}

function globalVideosDir(create = false): string {
	const dir = resolve(globalMediaRootDir(create), GLOBAL_MEDIA_VIDEOS_DIRNAME);
	if (create && !existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

function globalBackgroundsDir(create = false): string {
	const dir = resolve(
		globalMediaRootDir(create),
		GLOBAL_MEDIA_BACKGROUNDS_DIRNAME,
	);
	if (create && !existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

function globalVideoLibraryPath(): string {
	return resolve(gemskillsHomeDir(), GLOBAL_VIDEO_LIBRARY_FILENAME);
}

function legacyVideoLibraryPath(): string {
	return join(getDeckDir(), VIDEO_LIBRARY_FILENAME);
}

export function getGlobalVideoStorageDir(): string {
	return globalVideosDir(true);
}

export function getGlobalBackgroundStorageDir(): string {
	return globalBackgroundsDir(true);
}

/**
 * Copy bundled seed videos to the global video store if they don't exist yet.
 * Same pattern as browsing-styles tiles — ship seed content so the UI isn't empty.
 */
function seedBundledVideos(): void {
	const bundledDir = resolve(__dirname, "../../../../assets/videos");
	if (!existsSync(bundledDir)) return;
	const dest = globalVideosDir(true);
	for (const file of readdirSync(bundledDir)) {
		if (!/\.mp4$/i.test(file)) continue;
		const destPath = join(dest, file);
		if (!existsSync(destPath)) {
			copyFileSync(join(bundledDir, file), destPath);
		}
	}
}

export function resolveVideoAssetPath(filename: string): string | null {
	const localPath = join(getDeckDir(), filename);
	if (existsSync(localPath)) return localPath;
	const globalPath = join(globalVideosDir(false), filename);
	if (existsSync(globalPath)) return globalPath;
	return null;
}

export function resolveSlideAssetPath(filename: string): string | null {
	const localPath = join(getSlidesDir(), filename);
	if (existsSync(localPath)) return localPath;
	if (!/\.(png|jpg|jpeg|webp|gif|avif)$/i.test(filename)) return null;
	const globalPath = join(globalBackgroundsDir(false), filename);
	if (existsSync(globalPath)) return globalPath;
	return null;
}

export function readGlobalStyleRecipes(): StyleRecipeInfo[] {
	const path = globalStyleRecipesPath();
	if (!existsSync(path)) return [];
	const raw = readFileSync(path, "utf-8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		throw new Error(
			`${GLOBAL_STYLE_RECIPES_FILENAME} is not valid JSON: ${msg}`,
		);
	}
	if (
		!parsed ||
		typeof parsed !== "object" ||
		Array.isArray(parsed) ||
		!("styleRecipes" in parsed)
	) {
		throw new Error(
			`${GLOBAL_STYLE_RECIPES_FILENAME} must contain a top-level "styleRecipes" array`,
		);
	}
	return sanitizeStyleRecipes(
		(parsed as { styleRecipes?: unknown }).styleRecipes || [],
	);
}

export function writeGlobalStyleRecipes(styleRecipes: StyleRecipeInfo[]): void {
	const path = globalStyleRecipesPath();
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const cleaned = sanitizeStyleRecipes(styleRecipes);
	writeFileSync(
		path,
		`${JSON.stringify({ styleRecipes: cleaned }, null, 2)}\n`,
		"utf-8",
	);
}

// ── Styles registry ─────────────────────────────────────────────────

let _registry: StylesRegistry | null = null;
let _stylesWithTiles: Array<{
	id: string;
	name: string;
	shortName?: string;
	promptHints: string;
	category: string;
	hasTile: boolean;
}> | null = null;

export function getStylesRegistry(): StylesRegistry {
	if (!_registry) {
		_registry = JSON.parse(readFileSync(STYLES_PATH, "utf-8"));
	}
	if (!_registry) {
		throw new Error("Failed to load styles registry");
	}
	return _registry;
}

export function getStylesWithTiles() {
	if (!_stylesWithTiles) {
		const registry = getStylesRegistry();
		_stylesWithTiles = registry.styles.map((s) => ({
			...s,
			hasTile: existsSync(join(TILES_DIR, `${s.id}.png`)),
		}));
	}
	return _stylesWithTiles;
}

// ── Deck state loader ───────────────────────────────────────────────

export function loadDeckState(): Record<string, unknown> {
	const deckDir = getDeckDir();
	const slidesDir = getSlidesDir();
	const slidesSubdir = getSlidesSubdir();
	const state: Record<string, unknown> = {};
	let indexSlides: SlideData[] = [];
	let planSlides: Array<Partial<SlideData> & { slideNum: number }> = [];

	const indexPath = join(deckDir, "DECK-INDEX.md");
	if (existsSync(indexPath)) {
		const content = readFileSync(indexPath, "utf-8");
		const parsed = parseDeckIndex(content);
		indexSlides = parsed.slides;
		if (parsed.title) state.title = parsed.title;
		if (parsed.audience) state.audience = parsed.audience;
		if (parsed.slideCount) state.slideCount = parsed.slideCount;
	}

	const planPath = join(deckDir, "DECK-PLAN.md");
	if (existsSync(planPath)) {
		const content = readFileSync(planPath, "utf-8");
		const parsed = parseDeckPlan(content);
		planSlides = parsed.slides;
		if (parsed.title && !state.title) state.title = parsed.title;
		if (parsed.audience) state.audience = parsed.audience;
		if (parsed.goal) state.purpose = parsed.goal;
		if (parsed.context) state.context = parsed.context;
		if (parsed.keyMessage) state.keyMessage = parsed.keyMessage;
		if (parsed.tone) state.tone = parsed.tone;
		if (parsed.slideCount && parsed.slideCount > (Number(state.slideCount) || 0))
			state.slideCount = parsed.slideCount;
	}

	const themePath = join(deckDir, "THEME.md");
	if (existsSync(themePath)) {
		const content = readFileSync(themePath, "utf-8");
		const theme = parseTheme(content);
		if (Object.keys(theme.themeConfig).length > 0) {
			state.themeConfig = theme.themeConfig;
		}
		if (theme.themeModes) state.themeModes = theme.themeModes;
		if (theme.styleId !== undefined) state.styleId = theme.styleId;
		if (theme.styleRecipeId !== undefined)
			state.styleRecipeId = theme.styleRecipeId;
		if (theme.stylePrompt) state.stylePrompt = theme.stylePrompt;
		if (theme.backgroundMedia) state.videoBackground = theme.backgroundMedia;
		else if (theme.videoBackground)
			state.videoBackground = theme.videoBackground;
		if (theme.videoLoop !== undefined) state.videoLoop = theme.videoLoop;
		if (theme.fontFamily) state.fontFamily = theme.fontFamily;
		if (theme.slideThemeMode) state.slideThemeMode = theme.slideThemeMode;
		if (theme.aspectRatio && isDeckAspectRatio(theme.aspectRatio)) {
			state.aspectRatio = theme.aspectRatio;
		}
	}

	const globalRecipes = readGlobalStyleRecipes();
	state.styleRecipes = globalRecipes;

	// Legacy project-local recipe store import:
	// if a deck still has STYLE_RECIPES.json, merge into global library once.
	const styleRecipesPath = join(deckDir, STYLE_RECIPES_FILENAME);
	if (existsSync(styleRecipesPath)) {
		const localRaw = JSON.parse(readFileSync(styleRecipesPath, "utf-8")) as {
			styleRecipes?: unknown;
		};
		const localRecipes = sanitizeStyleRecipes(localRaw.styleRecipes || []);
		if (localRecipes.length > 0) {
			const mergedMap = new Map<string, StyleRecipeInfo>();
			for (const recipe of globalRecipes) mergedMap.set(recipe.id, recipe);
			for (const recipe of localRecipes) {
				if (!mergedMap.has(recipe.id)) mergedMap.set(recipe.id, recipe);
			}
			const merged = [...mergedMap.values()];
			if (merged.length !== globalRecipes.length) {
				writeGlobalStyleRecipes(merged);
				console.error(
					`Imported ${merged.length - globalRecipes.length} legacy style recipe(s) from ${styleRecipesPath} into ${GLOBAL_STYLE_RECIPES_FILENAME}`,
				);
			}
			state.styleRecipes = merged;
		}
	}

	// Merge INDEX + PLAN slide data
	const mergedSlides: SlideData[] = [];

	if (indexSlides.length > 0) {
		for (const idx of indexSlides) {
			const planSlide = planSlides.find((p) => p.slideNum === idx.index);
			mergedSlides.push({
				index: idx.index,
				title: idx.title || planSlide?.title || `Slide ${idx.index}`,
				headline: planSlide?.headline || "",
				content: planSlide?.content || "",
				visualConcept: planSlide?.visualConcept || "",
				backgroundMode:
					planSlide?.backgroundMode || idx.backgroundMode || "opaque",
				type: planSlide?.type || idx.type || "Content",
				filename: idx.filename,
				renderMode: idx.renderMode || planSlide?.renderMode || "html",
			});
		}
		// Append plan-only slides beyond the index range (added externally)
		const maxIndexNum = Math.max(...indexSlides.map((s) => s.index));
		const diskFiles = existsSync(slidesDir)
			? readdirSync(slidesDir)
					.filter((f) => /\.(png|jpg|jpeg|webp|html)$/i.test(f))
					.sort()
			: [];
		for (const ps of planSlides) {
			if (ps.slideNum > maxIndexNum) {
				const matchingFile = diskFiles.find((f) =>
					f.startsWith(String(ps.slideNum).padStart(2, "0")),
				);
				mergedSlides.push({
					index: ps.slideNum,
					title: ps.title || `Slide ${ps.slideNum}`,
					headline: ps.headline || "",
					content: ps.content || "",
					visualConcept: ps.visualConcept || "",
					backgroundMode: ps.backgroundMode || "opaque",
					type: ps.type || "Content",
					filename:
						matchingFile || `${String(ps.slideNum).padStart(2, "0")}-slide.html`,
					renderMode: ps.renderMode || "html",
				});
			}
		}
	} else if (planSlides.length > 0) {
		const diskFiles = existsSync(slidesDir)
			? readdirSync(slidesDir)
					.filter((f) => /\.(png|jpg|jpeg|webp|html)$/i.test(f))
					.sort()
			: [];

		for (const ps of planSlides) {
			const matchingFile = diskFiles.find((f) =>
				f.startsWith(String(ps.slideNum).padStart(2, "0")),
			);
			mergedSlides.push({
				index: ps.slideNum,
				title: ps.title || `Slide ${ps.slideNum}`,
				headline: ps.headline || "",
				content: ps.content || "",
				visualConcept: ps.visualConcept || "",
				backgroundMode: ps.backgroundMode || "opaque",
				type: ps.type || "Content",
				filename:
					matchingFile || `${String(ps.slideNum).padStart(2, "0")}-slide.html`,
				renderMode: ps.renderMode || "html",
			});
		}
	}

	if (mergedSlides.length > 0) {
		state.slides = mergedSlides;
		if (!state.slideCount) state.slideCount = mergedSlides.length;
	}

	// Annotations
	const annotationsJsonPath = join(deckDir, "ANNOTATIONS.json");
	const annotationsMdPath = join(deckDir, "ANNOTATIONS.md");
	if (existsSync(annotationsJsonPath)) {
		const content = readFileSync(annotationsJsonPath, "utf-8");
		let af: AnnotationsFile;
		try {
			af = parseAnnotationsFile(content);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			throw new Error(`ANNOTATIONS.json parse failed: ${msg}`);
		}
		af.annotations = sanitizeLegacyAnnotations(
			af.annotations as unknown as Record<string, unknown[]>,
		) as unknown as typeof af.annotations;
		state.annotationsFile = af;
		state.annotations = af.notes;
	} else if (existsSync(annotationsMdPath)) {
		const content = readFileSync(annotationsMdPath, "utf-8");
		const af = migrateMarkdownAnnotations(content);
		state.annotationsFile = af;
		state.annotations = af.notes;
	}

	// Discover existing files
	const localBackgroundImages: string[] = [];
	if (existsSync(slidesDir)) {
		const files = readdirSync(slidesDir)
			.filter((f) => /\.(png|jpg|jpeg|webp|html)$/i.test(f))
			.sort();
		state.existingSlides = files;

		localBackgroundImages.push(
			...files
				.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
				.filter((f) => /(^bg-|(^|-)background|-[bB][gG]-)/.test(f))
				.sort((a, b) => b.localeCompare(a)),
		);
	}

	const globalBackgroundImages = existsSync(globalBackgroundsDir(false))
		? readdirSync(globalBackgroundsDir(false))
				.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
				.sort((a, b) => b.localeCompare(a))
		: [];
	state.existingBackgroundImages = uniqueSortedDesc([
		...globalBackgroundImages,
		...localBackgroundImages,
	]);

	// Seed bundled video backgrounds to global store on first use
	seedBundledVideos();

	const localVideos = existsSync(deckDir)
		? readdirSync(deckDir)
				.filter((f) => /\.mp4$/i.test(f))
				.sort((a, b) => b.localeCompare(a))
		: [];
	const globalVideos = existsSync(globalVideosDir(false))
		? readdirSync(globalVideosDir(false))
				.filter((f) => /\.mp4$/i.test(f))
				.sort((a, b) => b.localeCompare(a))
		: [];
	state.existingVideos = uniqueSortedDesc([...globalVideos, ...localVideos]);

	state.videoLibrary = readVideoLibrary().videos;

	const generatedDir = getGeneratedDir();
	if (existsSync(generatedDir)) {
		const images = readdirSync(generatedDir)
			.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
			.sort();
		state.generatedImages = images;
	}

	state.slidesDir = slidesSubdir;

	return state;
}

// ── HTML Slide System Prompt ─────────────────────────────────

interface SlidePromptOpts {
	backgroundMode: "transparent" | "opaque" | "solid" | "gradient";
	hasGlobalVideoBackground: boolean;
	hasGlobalImageBackdrop?: boolean;
	hasGeneratedBackdrop?: boolean;
	aspectRatio?: string;
	fontFamily?: string;
	themeConfig?: Record<string, string>;
	/** Full style object from styles.json — drives the entire aesthetic. */
	style?: { name: string; promptHints: string; category: string } | null;
	styleRecipeInstructions?: string;
}

export function buildHtmlSlideSystemPrompt(opts: SlidePromptOpts): string {
	const {
		backgroundMode,
		hasGlobalVideoBackground,
		hasGlobalImageBackdrop,
		hasGeneratedBackdrop,
		aspectRatio,
		fontFamily,
		themeConfig,
		style,
		styleRecipeInstructions,
	} = opts;
	const tc = themeConfig || {};
	const noShadows = styleInstructionsDisallowShadows(styleRecipeInstructions);

	// Resolve theme vars with sensible defaults
	const accentColor = tc.primary || "#00d4aa";
	const bgColor = tc.background || "#0a0e1a";
	const textColor = tc.foreground || "#e2e8f0";
	const mutedColor = tc["muted-foreground"] || "#94a3b8";
	const borderColor = tc.border || "#1e293b";
	const cardBg = tc.card || "#1a1f2e";
	const radius = tc.radius || "0.625rem";
	const letterSpacing = tc["letter-spacing"] || "0em";

	const fontStack = getPreferredFontStack(fontFamily);
	const fontImportUrl = getGoogleFontImportUrl(fontFamily);
	const wrapperFontLine = fontFamily
		? `font-family: ${fontStack};`
		: "font-family: var(--font-display, 'Plus Jakarta Sans', 'Space Grotesk', 'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif);";
	const fontSelectionLine = fontFamily
		? `Selected font (required): ${fontFamily}.`
		: "No explicit font selected: choose a strong, presentation-grade display/body pairing.";
	const fontImportLine = fontImportUrl
		? `Include this at the very top of <style>: @import url('${fontImportUrl}');`
		: fontFamily
			? "If the selected font is unavailable, gracefully fall back to the provided stack."
			: "When choosing a non-system font, include an @import for that font at the top of <style>.";

	const lsRule = letterSpacing.includes("-")
		? `letter-spacing: ${letterSpacing} on headlines, ${letterSpacing} on body.`
		: letterSpacing !== "0em" && letterSpacing !== "normal"
			? `letter-spacing: ${letterSpacing} on all text.`
			: "letter-spacing: normal.";

	let bgInstructions: string;
	if (backgroundMode === "transparent") {
		bgInstructions = hasGlobalVideoBackground
			? `CRITICAL: Background mode is TRANSPARENT and a looping video backdrop is active.
- The wrapper background MUST stay transparent.
- Do not create a full-canvas opaque backdrop layer.
- Use semi-transparent content surfaces and contrast treatments so copy remains legible over motion.`
			: hasGlobalImageBackdrop
				? `CRITICAL: Background mode is TRANSPARENT and a global backdrop image is active.
- The wrapper background MUST stay transparent so the selected image remains visible.
- Do not create a full-canvas opaque backdrop layer.
- Build an overlay composition with readable contrast zones.`
				: `CRITICAL: Background mode is TRANSPARENT with no global media selected.
- Keep wrapper background transparent.
- Let the presenter/theme background show through.
- Do not invent a full-canvas generated backdrop.`;
	} else if (backgroundMode === "solid") {
		bgInstructions = `CRITICAL: Background mode is SOLID.
- Use a solid CSS background color from the theme palette (var(--background) or a related theme color).
- Do NOT generate, reference, or include a backdrop image.
- The slide is visually self-contained with solid color behind content.`;
	} else if (backgroundMode === "gradient") {
		bgInstructions = `CRITICAL: Background mode is GRADIENT.
- Use a CSS gradient background derived from the theme palette (combine --background, --card, --primary, or --muted colors).
- Do NOT generate, reference, or include a backdrop image.
- Create an elegant gradient that complements the theme — e.g., radial-gradient, linear-gradient, or conic-gradient.
- The slide is visually self-contained with the gradient behind content.`;
	} else {
		bgInstructions = hasGeneratedBackdrop
			? `CRITICAL: Background mode is OPAQUE and a required generated backdrop image token is provided.
- The slide should be visually self-contained (not relying on global media to read correctly).
- Reference the exact required backdrop filename token supplied in the user prompt.
- Do not rename, omit, or substitute that token.`
			: `CRITICAL: Background mode is OPAQUE.
- The slide should be visually self-contained.
- Use var(--background) and/or slide-owned background treatment; do not rely on global background media.`;
	}

	// Build chart color list for data visualizations
	const chartColors = [1, 2, 3, 4, 5]
		.map((n) => tc[`chart-${n}`])
		.filter(Boolean);
	const chartLine =
		chartColors.length > 0
			? `\n- Chart/data visualization colors: ${chartColors.join(", ")}.`
			: "";
	const textShadowRule = noShadows
		? "No text shadows. Keep text crisp and readable through contrast, spacing, and backing surfaces only."
		: "Text shadows for legibility over backgrounds: headlines 0 2px 24px rgba(0,0,0,0.5), body 0 1px 12px rgba(0,0,0,0.3).";
	const shadowQualityRule = noShadows
		? "Hard constraint: no shadows anywhere. Do not use box-shadow, text-shadow, filter: drop-shadow, glow, or faux depth shadows."
		: "Use depth cues primarily through composition, spacing, borders, and gradients.";

	// ── Art Style Section ──
	// The art style is the PRIMARY aesthetic driver. When present, it defines
	// the entire visual language — card treatment, typography mood, decorative
	// elements, textures, patterns, color usage. The theme colors (CSS vars)
	// provide the palette; the art style says HOW to use them.
	let aestheticSection: string;
	if (style) {
		aestheticSection = `
ART STYLE — "${style.name}" (THIS IS THE PRIMARY AESTHETIC):
${style.promptHints}

This art style defines the ENTIRE visual language of the slide. Every design
decision — card treatment, typography weight/style, decorative elements,
spacing rhythm, borders, textures, background treatment — must authentically
reflect the "${style.name}" aesthetic.

Use the CSS custom property colors (var(--primary), var(--foreground), etc.)
as your palette, but apply them in the way this art style demands. For example:
- Swiss/International: clean flat cards with sharp borders, NO blur/glass effects, strict grid alignment, bold sans-serif weight contrast, mathematical whitespace
- Art Deco: geometric patterns, gold/metallic gradient accents, symmetrical ornamental borders, fan/sunburst decorative motifs
- Cyberpunk: neon glow effects (box-shadow with color), dark translucent panels, scan-line textures, glitch-inspired decorative elements
- Brutalist: raw exposed structure, monospace type, thick borders, no decoration, stark contrast
- Vaporwave: pastel gradients, retro grid patterns, column/bust decorative elements, soft glow

Do NOT default to glass/blur effects unless the art style specifically calls for
translucency (e.g., liquid-glass, frosted-glass, glassmorphism styles).

CARD/CONTAINER TREATMENT (style-driven):
- Design cards and containers to match the "${style.name}" aesthetic.
- Use var(--card) for card backgrounds, var(--border) for borders, var(--radius) for border-radius.
- The visual treatment (blur, opacity, borders, shadows, textures) should be
  whatever this art style naturally uses — NOT a one-size-fits-all recipe.`;
	} else {
		aestheticSection = `
DEFAULT AESTHETIC — LIQUID GLASS:
When no specific art style is selected, use a premium liquid glass aesthetic:
- Cards use backdrop-filter: blur(20px); background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)); border: 1px solid var(--border); border-radius: var(--radius).
- No box-shadows on cards. Use border-top: 1px solid rgba(255,255,255,0.15) for subtle depth.
- Cards should feel translucent and luminous — like frosted glass.
- Subtle radial gradients in var(--primary) at 0.05-0.1 opacity behind key content for depth.
- Decorative elements: thin lines, gradient fades from var(--primary) to transparent.`;
	}

	return `You are an expert HTML slide designer creating premium, visually stunning presentation slides.

OUTPUT FORMAT (CRITICAL — FOLLOW EXACTLY):
- Output ONLY a <style> block followed by content elements. No markdown, no explanation, no code fences.
- Do NOT output <!DOCTYPE>, <html>, <head>, <meta>, <title>, or <body> tags. Your output is injected into an existing container.
- Your output structure MUST be:

<style>
.slide-wrapper {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--background); /* transparent when Background Mode is transparent */
  color: var(--foreground);
  ${wrapperFontLine}
  /* your layout styles */
}
/* other selectors */
</style>
<div class="slide-wrapper">
  <!-- your content -->
</div>

CSS CUSTOM PROPERTIES (USE THESE — DO NOT HARDCODE COLORS):
The container provides these CSS custom properties. Use var() references in your styles:
  --background: ${bgColor}
  --foreground: ${textColor}
  --primary: ${accentColor}
  --primary-foreground: ${tc["primary-foreground"] || bgColor}
  --card: ${cardBg}
  --card-foreground: ${tc["card-foreground"] || textColor}
  --muted: ${tc.muted || "#1e293b"}
  --muted-foreground: ${mutedColor}
  --border: ${borderColor}
  --ring: ${tc.ring || accentColor}
  --radius: ${radius}

ALWAYS reference these as var(--primary), var(--foreground), var(--border), etc. in your CSS.
This enables the slide to adapt to different themes without regeneration.

No external stylesheets or scripts.
Exception: when a font @import URL is explicitly provided in the typography section, include that exact @import.

BACKGROUND:
${bgInstructions}
${aestheticSection}

STYLE RECIPE DIRECTIVES (HIGHEST PRIORITY WHEN PROVIDED):
${styleRecipeInstructions || "- No additional style recipe directives."}
If these directives conflict with style defaults, obey the style recipe directives.

PER-SLIDE DIRECTION CONTRACT:
- If the user prompt includes per-slide direction (sometimes called visual concept), treat it as this slide's unique composition/content guidance only.
- Do NOT treat per-slide direction as a global theme/aesthetic override.
- Global aesthetic and rendering rules are defined by ART STYLE, STYLE RECIPE, and theme CSS variables.

COPY FIDELITY (HARD):
- Required headline/content lines provided by the user prompt must appear verbatim on slide.
- Do not paraphrase, shorten, or substitute required copy unless edit instructions explicitly provide quoted replacement text.

TYPOGRAPHY:
- ${fontSelectionLine}
- ${fontImportLine}
- Font stack: ${fontStack}.
- All font sizes MUST use clamp() for responsive scaling: headlines clamp(2rem, 5vw, 5rem), body clamp(1rem, 2vw, 1.6rem), small text clamp(0.8rem, 1.2vw, 1rem).
- ${lsRule}
- Line height: 1.1-1.2 for headlines, 1.5-1.6 for body text.
- ${textShadowRule}
- Font smoothing: -webkit-font-smoothing: antialiased.

COLORS:
- Accent/primary: var(--primary) — use for key highlights, decorative elements, interactive-looking elements.
- Body text: var(--foreground).
- Muted/secondary text: var(--muted-foreground).
- var(--primary-foreground) is ONLY for text/icons placed on solid var(--primary) surfaces (buttons, chips, badges). Never use var(--primary-foreground) for headline/body text on page, card, or transparent backgrounds.
- Card backgrounds: var(--card). Content containers MUST use var(--card) or semi-transparent variants of theme colors — NEVER hardcode #fff, #ffffff, white, #000, #000000, or any literal color for backgrounds.
- Borders: var(--border).
- HARD RULE: Every background-color, color, and border-color in your CSS MUST use var() references to theme custom properties. Hardcoded hex/rgb/hsl values break theme switching.
- Ensure WCAG AA contrast between text and background.${chartLine}

LAYOUT BY SLIDE TYPE:
- Title/Closing: centered vertically and horizontally, large headline, optional subtitle below.
- Content/How It Works/Benefits: headline with content cards or bullet points.
- Stats/Metrics: large numbers in a grid (2-3 columns), each in a styled card with label.
- Comparison: side-by-side columns with clear visual separation.
- Quote: centered italic headline with attribution, decorative quotation marks using accent color.
- Timeline/Roadmap: horizontal or vertical flow with connected nodes.
- CTA/Call to Action: centered, large headline, prominent button-like element using accent color.

QUALITY STANDARDS:
- Every slide must look like a premium keynote presentation — not a web page.
- Generous whitespace. Content should breathe.
- Visual hierarchy through size contrast: headlines should be dramatically larger than body text.
- ${shadowQualityRule}
- Percentage-based spacing (padding: 5%, gap: 3%) for proportional layouts.
- All spacing uses vw/vh or percentage units for responsive scaling.
- Target composition aspect ratio: ${aspectRatio || "16:9"} (arrange hierarchy and density for this canvas shape).`;
}

function parseVideoLibraryFile(
	raw: string,
	sourceLabel: string,
): VideoLibraryFile {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		throw new Error(`${sourceLabel} is not valid JSON: ${msg}`);
	}
	if (
		!parsed ||
		typeof parsed !== "object" ||
		!("videos" in parsed) ||
		typeof (parsed as { videos?: unknown }).videos !== "object" ||
		Array.isArray((parsed as { videos?: unknown }).videos) ||
		(parsed as { videos?: unknown }).videos === null
	) {
		throw new Error(`${sourceLabel} must contain a top-level "videos" object`);
	}
	return parsed as VideoLibraryFile;
}

function readVideoLibraryFile(
	path: string,
	sourceLabel: string,
): VideoLibraryFile {
	if (!existsSync(path)) return { videos: {} };
	const raw = readFileSync(path, "utf-8");
	return parseVideoLibraryFile(raw, sourceLabel);
}

function writeVideoLibrary(file: VideoLibraryFile) {
	const path = globalVideoLibraryPath();
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf-8");
}

function readVideoLibrary(): VideoLibraryFile {
	const globalFile = readVideoLibraryFile(
		globalVideoLibraryPath(),
		GLOBAL_VIDEO_LIBRARY_FILENAME,
	);
	const legacyPath = legacyVideoLibraryPath();
	const legacyFile = readVideoLibraryFile(legacyPath, VIDEO_LIBRARY_FILENAME);
	const mergedVideos: Record<string, VideoLibraryEntry> = {
		...globalFile.videos,
	};
	let imported = 0;
	for (const [filename, entry] of Object.entries(legacyFile.videos)) {
		if (!(filename in mergedVideos)) {
			mergedVideos[filename] = entry;
			imported += 1;
		}
	}
	if (imported > 0) {
		writeVideoLibrary({ videos: mergedVideos });
		console.error(
			`Imported ${imported} legacy video metadata entr${imported === 1 ? "y" : "ies"} from ${legacyPath} into ${GLOBAL_VIDEO_LIBRARY_FILENAME}`,
		);
	}
	return { videos: mergedVideos };
}

export function upsertVideoLibraryEntry(
	filename: string,
	entry: VideoLibraryEntry,
) {
	const file = readVideoLibrary();
	file.videos[filename] = entry;
	writeVideoLibrary(file);
}

export function getVideoLibraryEntry(
	filename: string,
): VideoLibraryEntry | undefined {
	return readVideoLibrary().videos[filename];
}

// ── Video job tracking ──────────────────────────────────────────────

const videoJobs = new Map<
	string,
	{
		status: "generating" | "done" | "error";
		filename?: string;
		videoPath?: string;
		error?: string;
	}
>();
let videoJobCounter = 0;

export function createVideoJob(filename?: string): string {
	const jobId = `video-${++videoJobCounter}`;
	videoJobs.set(jobId, { status: "generating", filename });
	return jobId;
}

export function setVideoJobDone(jobId: string, videoPath: string) {
	const current = videoJobs.get(jobId);
	videoJobs.set(jobId, {
		status: "done",
		filename: current?.filename || videoPath.split("/").pop(),
		videoPath,
	});
}

export function setVideoJobError(jobId: string, error: string) {
	const current = videoJobs.get(jobId);
	videoJobs.set(jobId, {
		status: "error",
		filename: current?.filename,
		error,
	});
}

export function getVideoJob(jobId: string) {
	return videoJobs.get(jobId);
}

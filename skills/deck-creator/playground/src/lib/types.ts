import type { StyleRecipeInfo } from "./style-recipes"
import type { DeckAspectRatio } from "./aspect-ratio"

/** Inlined from parsers.ts to avoid cross-directory imports */
export interface SlideAnnotation {
	id: string
	x: number
	y: number
	note: string
	status: "open" | "applied" | "dismissed"
	intent?: "fix" | "change" | "question" | "approve"
	severity?: "blocking" | "important" | "suggestion"
	created: number
	element?: {
		type: string
		pointIndex?: number
		currentText?: string
	}
}

export interface AnnotationsFile {
	notes: Record<number, string>
	annotations: Record<string, SlideAnnotation[]>
}

export interface SlideVariant {
	id: string // "v-<timestamp>"
	htmlContent?: string // for html mode
	filename?: string // for image mode
	themeMode?: "light" | "dark" // mode used at generation-time
	backdropVideo?: string // per-variant animated backdrop video filename
	createdAt: number
	label?: string // optional user label
}

export interface SlideData {
	index: number
	title: string
	headline: string
	content: string
	visualConcept: string
	backgroundMode: "transparent" | "opaque" | "solid" | "gradient"
	type: string
	filename: string
	renderMode: "image" | "html"
	backdropVideo?: string // per-slide video background filename
	backdropVideoLoop?: boolean // loop per-slide backdrop video (default: true)
	backgroundMediaUrl?: string // per-slide override of global background media
}

/** TweakCN-compatible theme configuration. Keys match shadcn/ui CSS variables. */
export type ThemeConfig = Record<string, string>
export type ThemeModes = {
	light: ThemeConfig
	dark: ThemeConfig
}

/**
 * Color groups for the theme editor UI.
 * Matches TweakCN's themeStylePropsSchema groupings.
 */
export const THEME_COLOR_GROUPS: Array<{
	label: string
	keys: readonly string[]
}> = [
	{ label: "Base", keys: ["background", "foreground"] },
	{ label: "Card", keys: ["card", "card-foreground"] },
	{ label: "Popover", keys: ["popover", "popover-foreground"] },
	{ label: "Primary", keys: ["primary", "primary-foreground"] },
	{ label: "Secondary", keys: ["secondary", "secondary-foreground"] },
	{ label: "Muted", keys: ["muted", "muted-foreground"] },
	{ label: "Accent", keys: ["accent", "accent-foreground"] },
	{ label: "Destructive", keys: ["destructive", "destructive-foreground"] },
	{ label: "Border", keys: ["border", "input", "ring"] },
	{ label: "Charts", keys: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] },
]

/** All color keys in the theme config. */
export const THEME_COLOR_KEYS = THEME_COLOR_GROUPS.flatMap((g) => g.keys)

/** Non-color style keys. */
export const THEME_STYLE_KEYS = [
	"radius",
	"letter-spacing",
	"spacing",
	"shadow-color",
	"shadow-opacity",
	"shadow-blur",
	"shadow-spread",
	"shadow-offset-x",
	"shadow-offset-y",
] as const

export const DEFAULT_DARK_THEME: ThemeConfig = {
	background: "#0a0e1a",
	foreground: "#e2e8f0",
	card: "#1a1f2e",
	"card-foreground": "#e2e8f0",
	popover: "#1a1f2e",
	"popover-foreground": "#e2e8f0",
	primary: "#00d4aa",
	"primary-foreground": "#0a0e1a",
	secondary: "#1e293b",
	"secondary-foreground": "#e2e8f0",
	muted: "#1e293b",
	"muted-foreground": "#94a3b8",
	accent: "#1e293b",
	"accent-foreground": "#e2e8f0",
	destructive: "#ef4444",
	"destructive-foreground": "#fafafa",
	border: "#1e293b",
	input: "#1e293b",
	ring: "#00d4aa",
	"chart-1": "#00d4aa",
	"chart-2": "#3b82f6",
	"chart-3": "#8b5cf6",
	"chart-4": "#f59e0b",
	"chart-5": "#ef4444",
	radius: "0.625rem",
	"letter-spacing": "0em",
	spacing: "0.25rem",
}

export const DEFAULT_LIGHT_THEME: ThemeConfig = {
	background: "#ffffff",
	foreground: "#0f172a",
	card: "#ffffff",
	"card-foreground": "#0f172a",
	popover: "#ffffff",
	"popover-foreground": "#0f172a",
	primary: "#00b894",
	"primary-foreground": "#ffffff",
	secondary: "#f1f5f9",
	"secondary-foreground": "#0f172a",
	muted: "#f1f5f9",
	"muted-foreground": "#64748b",
	accent: "#f1f5f9",
	"accent-foreground": "#0f172a",
	destructive: "#ef4444",
	"destructive-foreground": "#ffffff",
	border: "#e2e8f0",
	input: "#e2e8f0",
	ring: "#00b894",
	"chart-1": "#00b894",
	"chart-2": "#3b82f6",
	"chart-3": "#8b5cf6",
	"chart-4": "#f59e0b",
	"chart-5": "#ef4444",
	radius: "0.625rem",
	"letter-spacing": "0em",
	spacing: "0.25rem",
}

export interface StyleInfo {
	id: string
	name: string
	shortName?: string
	promptHints: string
	category: string
	hasTile: boolean
}

export interface SlideState extends Omit<SlideData, "renderMode"> {
	status: "pending" | "generating" | "done" | "error"
	htmlContent?: string
	lastError?: string
	lastRawOutput?: string
	renderMode: "image" | "html"
	variants: SlideVariant[]
	activeVariant: number
}

export interface DeckState {
	deckDir: string // Server-side deck path — included in saves to prevent stale writes
	deckSelected: boolean
	aspectRatio: DeckAspectRatio
	title: string
	audience: string
	purpose: string
	context: string
	keyMessage: string
	brandNotes: string
	tone: string
	fontFamily: string
	themeConfig: ThemeConfig
	themeModes: ThemeModes
	slideThemeMode: "light" | "dark"
	slideCount: number
	styleId: string | null
	styleRecipeId: string | null
	stylePrompt: string
	videoUrl: string // Selected global background media (video or image)
	videoLoop: boolean // Loop global background video
	slidesDir: string
	currentSlide: number
	slides: SlideState[]
	styles: StyleInfo[]
	styleRecipes: StyleRecipeInfo[]
	categories: Record<string, string[]>
	existingVideos: string[]
	existingBackgroundImages: string[]
	annotations: Record<number, string>
	annotationsFile: AnnotationsFile
	annotateMode: boolean
	generating: boolean
	statusText: string
	initialized: boolean
	models: { text: string; image: string; video: string }
}

export type DeckAction =
	| { type: "SET_FIELD"; field: keyof DeckState; value: unknown }
	| {
			type: "SET_SLIDE_FIELD"
			index: number
			field: keyof SlideState
			value: unknown
		}
	| { type: "SET_CURRENT_SLIDE"; index: number }
	| { type: "SET_RENDER_MODE"; mode: "image" | "html" }
	| { type: "SET_STYLE"; id: string | null }
	| { type: "SET_SLIDES"; slides: SlideState[] }
	| { type: "SET_SLIDE_COUNT"; count: number }
	| {
			type: "SET_SLIDE_STATUS"
			index: number
			status: SlideState["status"]
			recordVariant?: boolean
			htmlContent?: string
			filename?: string
			error?: string
			rawOutput?: string
		}
	| { type: "INIT_FROM_CONFIG"; config: Partial<DeckState> }
	| { type: "SET_ANNOTATION_MODE"; active: boolean }
	| { type: "SET_ANNOTATIONS_FILE"; file: AnnotationsFile }
	| { type: "SET_SPEAKER_NOTE"; slideIndex: number; note: string }
	| { type: "SET_STATUS"; text: string }
	| { type: "SET_GENERATING"; generating: boolean }
	| { type: "SET_VIDEOS"; videos: string[] }
	| { type: "ADD_VARIANT"; slideIndex: number; variant: SlideVariant }
	| { type: "SELECT_VARIANT"; slideIndex: number; variantIndex: number }
	| { type: "DELETE_VARIANT"; slideIndex: number; variantId: string }
	| { type: "DELETE_VARIANT_GROUP"; slideIndex: number; payloadKey: string }
	| { type: "SET_ACTIVE_VARIANT_BACKDROP"; slideIndex: number; backdropVideo: string }
	| { type: "SET_ACTIVE_VARIANT_HTML"; slideIndex: number; html: string }

export function annotationKey(
	slide: { index: number; renderMode: string },
	variantId?: string,
): string {
	const base = `${slide.index}:${slide.renderMode || "image"}`
	return variantId ? `${base}:${variantId}` : base
}

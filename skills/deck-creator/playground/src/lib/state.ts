import type {
	DeckState,
	DeckAction,
	SlideState,
	SlideVariant,
	ThemeModes,
} from "./types"
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from "./types"
import { DEFAULT_STYLE_RECIPE_ID } from "./style-recipes"
import { getVariantPayloadKey } from "./variant-display"

function inferThemeModeFromBackground(
	background?: string,
): "light" | "dark" | undefined {
	if (!background) return undefined
	const match = background.trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
	if (!match) return undefined
	const raw = match[1]
	const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw
	const r = Number.parseInt(full.slice(0, 2), 16)
	const g = Number.parseInt(full.slice(2, 4), 16)
	const b = Number.parseInt(full.slice(4, 6), 16)
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
	return luminance >= 140 ? "light" : "dark"
}

export const initialState: DeckState = {
	deckDir: "",
	deckSelected: false,
	aspectRatio: "16:9",
	title: "",
	audience: "",
	purpose: "",
	context: "",
	keyMessage: "",
	brandNotes: "",
	tone: "",
	fontFamily: "",
	themeConfig: { ...DEFAULT_DARK_THEME },
	themeModes: {
		light: { ...DEFAULT_LIGHT_THEME },
		dark: { ...DEFAULT_DARK_THEME },
	},
	slideThemeMode: "dark",
	slideCount: 10,
	styleId: null,
	styleRecipeId: DEFAULT_STYLE_RECIPE_ID,
	stylePrompt: "",
	videoUrl: "",
	videoLoop: true,
	slidesDir: "slides",
	currentSlide: 0,
	slides: [],
	styles: [],
	styleRecipes: [],
	categories: {},
	existingVideos: [],
	existingBackgroundImages: [],
	annotations: {},
	annotationsFile: { notes: {}, annotations: {} },
	annotateMode: false,
	generating: false,
	statusText: "Ready",
	initialized: false,
	models: {
		text: "gemini-3.1-pro-preview",
		image: "gemini-3.1-flash-image-preview",
		video: "veo-3.1-generate-preview",
	},
}

function variantFingerprint(variant: SlideVariant): string {
	const html = variant.htmlContent?.trim()
	const base = html
		? `html:${html}`
		: variant.filename?.trim()
			? `file:${variant.filename.trim()}`
			: `id:${variant.id}`
	const mode = variant.themeMode === "light" || variant.themeMode === "dark"
		? variant.themeMode
		: ""
	return `${base}|mode:${mode}`
}

function dedupeVariants(variants: SlideVariant[]): SlideVariant[] {
	const out: SlideVariant[] = []
	const seenIds = new Set<string>()
	for (const variant of variants) {
		const id = typeof variant.id === "string" ? variant.id.trim() : ""
		if (id) {
			if (seenIds.has(id)) continue
			seenIds.add(id)
		}
		out.push(variant)
	}
	return out
}

function findVariantIndexByContent(
	variants: SlideVariant[],
	target: SlideVariant,
): number {
	const targetFp = variantFingerprint(target)
	return variants.findIndex((variant) => variantFingerprint(variant) === targetFp)
}

function inferRenderModeFromVariant(
	variant: SlideVariant | undefined,
	fallback: "image" | "html",
): "image" | "html" {
	if (!variant) return fallback
	// Filename is the definitive signal — a .png variant with htmlContent
	// (the template used to generate it) should render as image, not html.
	const filename = variant.filename?.trim().toLowerCase()
	if (filename) {
		if (filename.endsWith(".html")) return "html"
		// For non-.html filenames, only infer "image" if the variant was
		// actually generated (has a createdAt timestamp from generation)
		if (variant.createdAt) return "image"
	}
	if (variant.htmlContent?.trim()) return "html"
	return fallback
}

function applyActiveVariantView(
	slide: SlideState,
	variantIndex: number,
): SlideState {
	const variant = (slide.variants || [])[variantIndex]
	if (!variant) return slide
	const renderMode = inferRenderModeFromVariant(variant, slide.renderMode)
	const filename = variant.filename ?? slide.filename
	const htmlContent = renderMode === "html" ? variant.htmlContent : undefined
	const hasContent = !!(variant.htmlContent || variant.filename)
	return {
		...slide,
		activeVariant: variantIndex,
		renderMode,
		filename,
		htmlContent,
		status: hasContent ? ("done" as const) : ("pending" as const),
	}
}

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
	switch (action.type) {
		case "SET_FIELD": {
			if (action.field === "themeConfig") {
				const nextThemeConfig = action.value as DeckState["themeConfig"]
				const mode = state.slideThemeMode
				const nextThemeModes: ThemeModes = {
					...state.themeModes,
					[mode]: {
						...state.themeModes[mode],
						...nextThemeConfig,
					},
				}
				return {
					...state,
					themeConfig: nextThemeConfig,
					themeModes: nextThemeModes,
				}
			}

			if (action.field === "slideThemeMode") {
				const nextMode = action.value as DeckState["slideThemeMode"]
				const defaults =
					nextMode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME
				const nextThemeConfig = {
					...defaults,
					...state.themeModes[nextMode],
				}
				return {
					...state,
					slideThemeMode: nextMode,
					themeConfig: nextThemeConfig,
				}
			}

			return { ...state, [action.field]: action.value }
		}

		case "SET_SLIDE_FIELD": {
			const slides = state.slides.map((s, i) =>
				i === action.index
					? { ...s, [action.field]: action.value }
					: s,
			)
			return { ...state, slides }
		}

		case "SET_CURRENT_SLIDE":
			return {
				...state,
				currentSlide: action.index,
				slides: state.slides.map((s, i) => {
					if (i !== action.index) return s
					if (!s.variants?.length) return s
					const safeActive = Math.min(
						s.activeVariant,
						Math.max(0, s.variants.length - 1),
					)
					return applyActiveVariantView(s, safeActive)
				}),
			}

		case "SET_RENDER_MODE": {
			const slides = state.slides.map((s, i) => {
				if (i !== state.currentSlide) return s
				const filename =
					action.mode === "html"
						? s.filename.replace(/\.\w+$/, ".html")
						: s.filename.replace(/\.html$/, ".png")
				return { ...s, renderMode: action.mode, filename }
			})
			return { ...state, slides }
		}

		case "SET_STYLE":
			return { ...state, styleId: action.id }

		case "SET_SLIDES":
			return { ...state, slides: action.slides }

		case "SET_SLIDE_COUNT": {
			const count = Math.max(1, Math.min(30, action.count))
			const slides = [...state.slides]
			while (slides.length < count) {
				const i = slides.length
				slides.push({
					index: i + 1,
					title: `Slide ${i + 1}`,
					headline: "",
					content: "",
					visualConcept: "",
					backgroundMode: "opaque",
					type: "Content",
					status: "pending",
					filename: String(i + 1).padStart(2, "0") + "-slide.html",
					renderMode: "html",
					variants: [],
					activeVariant: 0,
				})
			}
			// Only truncate slides that are empty placeholders (no headline,
			// content, visual concept, or generated variants). Slides defined
			// in the plan are authoritative and must not be silently dropped.
			if (slides.length > count) {
				// Find the last slide index that has real content
				let lastDefinedIndex = count - 1
				for (let i = slides.length - 1; i >= count; i--) {
					const s = slides[i]
					const hasContent =
						!!s.headline?.trim() ||
						!!s.content?.trim() ||
						!!s.visualConcept?.trim() ||
						(s.variants && s.variants.length > 0)
					if (hasContent) {
						lastDefinedIndex = i
						break
					}
				}
				const effectiveLength = Math.max(count, lastDefinedIndex + 1)
				slides.length = effectiveLength
			}
			const effectiveCount = slides.length
			const currentSlide =
				state.currentSlide >= effectiveCount ? effectiveCount - 1 : state.currentSlide
			return { ...state, slideCount: effectiveCount, slides, currentSlide }
		}

		case "SET_SLIDE_STATUS": {
			const slides = state.slides.map((s, i) => {
				if (i !== action.index) return s
				const update: Partial<SlideState> = { status: action.status }
				if (action.htmlContent !== undefined)
					update.htmlContent = action.htmlContent
				if (action.filename !== undefined)
					update.filename = action.filename
				if (action.error !== undefined) update.lastError = action.error
				if (action.rawOutput !== undefined)
					update.lastRawOutput = action.rawOutput
				if (action.status === "generating" || action.status === "done") {
					update.lastError = undefined
					update.lastRawOutput = undefined
				}

					// Only true generation completions should create a new variant.
					// Initialization/status hydration also uses SET_SLIDE_STATUS(done)
					// and must never duplicate variant history.
					if (
						action.status === "done" &&
						action.recordVariant &&
						(action.htmlContent || action.filename)
					) {
					const candidate: SlideVariant = {
						id: `v-${Date.now()}`,
						htmlContent: action.htmlContent ?? s.htmlContent,
						filename: action.filename ?? s.filename,
						themeMode: state.slideThemeMode,
						createdAt: Date.now(),
					}
					const existingVariants = s.variants || []
					const activeVariant = existingVariants[s.activeVariant]
					const isBlankActiveVariant =
						!!activeVariant &&
						!activeVariant.htmlContent?.trim() &&
						!activeVariant.filename?.trim()

					// If user is regenerating from a selected blank placeholder variant,
					// fill that exact variant in place instead of creating a new one.
					if (isBlankActiveVariant) {
						const replacement: SlideVariant = {
							...activeVariant,
							htmlContent: candidate.htmlContent,
							filename: candidate.filename,
							themeMode: candidate.themeMode,
							createdAt: candidate.createdAt,
						}
						const nextVariants = existingVariants.map((variant, idx) =>
							idx === s.activeVariant ? replacement : variant,
						)
						const variants = dedupeVariants(nextVariants)
						const nextActive = findVariantIndexByContent(
							variants,
							replacement,
						)
						return {
							...s,
							...update,
							variants,
							activeVariant:
								nextActive >= 0
									? nextActive
									: Math.min(
											s.activeVariant,
											Math.max(0, variants.length - 1),
										),
						}
					}

					const variants = dedupeVariants([candidate, ...existingVariants])
					return { ...s, ...update, variants, activeVariant: 0 }
				}

				return { ...s, ...update }
			})
			return { ...state, slides }
		}

		case "ADD_VARIANT": {
			const slides = state.slides.map((s, i) => {
				if (i !== action.slideIndex) return s
				const variant: SlideVariant = {
					...action.variant,
					themeMode:
						action.variant.themeMode === "light" ||
						action.variant.themeMode === "dark"
							? action.variant.themeMode
							: state.slideThemeMode,
				}
				const variants = dedupeVariants([variant, ...(s.variants || [])])
				return { ...s, variants, activeVariant: 0 }
			})
			return { ...state, slides }
		}

		case "SELECT_VARIANT": {
			const slides = state.slides.map((s, i) => {
				if (i !== action.slideIndex) return s
				return applyActiveVariantView(s, action.variantIndex)
			})
			return { ...state, slides }
		}

		case "DELETE_VARIANT": {
			const slides = state.slides.map((s, i) => {
				if (i !== action.slideIndex) return s
				const variants = dedupeVariants(
					(s.variants || []).filter((v) => v.id !== action.variantId),
				)
				if (variants.length === 0) {
					return {
						...s,
						variants: [],
						activeVariant: 0,
						htmlContent: undefined,
						filename: "",
						status: "pending" as const,
						lastError: undefined,
						lastRawOutput: undefined,
					}
				}
				const activeVariant = Math.min(
					s.activeVariant,
					Math.max(0, variants.length - 1),
				)
				const selected = variants[activeVariant]
				const nextSlide = {
					...s,
					variants,
					activeVariant,
				}
				if (!selected) return nextSlide
				return applyActiveVariantView(nextSlide, activeVariant)
			})
			return { ...state, slides }
		}

		case "DELETE_VARIANT_GROUP": {
			const slides = state.slides.map((s, i) => {
				if (i !== action.slideIndex) return s
				const variants = dedupeVariants(
					(s.variants || []).filter(
						(v) => getVariantPayloadKey(v) !== action.payloadKey,
					),
				)
				if (variants.length === 0) {
					return {
						...s,
						variants: [],
						activeVariant: 0,
						htmlContent: undefined,
						filename: "",
						status: "pending" as const,
						lastError: undefined,
						lastRawOutput: undefined,
					}
				}
				const activeVariant = Math.min(
					s.activeVariant,
					Math.max(0, variants.length - 1),
				)
				const nextSlide = {
					...s,
					variants,
					activeVariant,
				}
				return applyActiveVariantView(nextSlide, activeVariant)
			})
			return { ...state, slides }
		}

			case "INIT_FROM_CONFIG": {
				const c = action.config
				const nextMode =
					(c.slideThemeMode as DeckState["slideThemeMode"] | undefined) ??
					state.slideThemeMode
				const incomingThemeModes = c.themeModes as ThemeModes | undefined
				const mergedThemeModes: ThemeModes = {
					light: {
						...DEFAULT_LIGHT_THEME,
						...state.themeModes.light,
						...(incomingThemeModes?.light || {}),
					},
					dark: {
						...DEFAULT_DARK_THEME,
						...state.themeModes.dark,
						...(incomingThemeModes?.dark || {}),
					},
				}
				const incomingThemeConfig = c.themeConfig as
					| DeckState["themeConfig"]
					| undefined
				if (incomingThemeConfig) {
					const hasExplicitModeMaps = !!incomingThemeModes
					const inferredMode = inferThemeModeFromBackground(
						incomingThemeConfig.background,
					)
					const targetMode =
						!hasExplicitModeMaps && inferredMode ? inferredMode : nextMode
					mergedThemeModes[targetMode] = {
						...mergedThemeModes[targetMode],
						...incomingThemeConfig,
					}
				}
				const resolvedThemeConfig = {
					...(nextMode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME),
					...mergedThemeModes[nextMode],
				}
				return {
					...state,
				deckDir: c.deckDir ?? state.deckDir,
				deckSelected: c.deckSelected ?? state.deckSelected,
				aspectRatio: c.aspectRatio ?? state.aspectRatio,
				title: c.title ?? state.title,
				audience: c.audience ?? state.audience,
				purpose: c.purpose ?? state.purpose,
				context: c.context ?? state.context,
				keyMessage: c.keyMessage ?? state.keyMessage,
				brandNotes: c.brandNotes ?? state.brandNotes,
				tone: c.tone ?? state.tone,
				fontFamily: c.fontFamily ?? state.fontFamily,
					themeConfig: resolvedThemeConfig,
					themeModes: mergedThemeModes,
					slideThemeMode: nextMode,
				slideCount: c.slideCount ?? state.slideCount,
				styleId: c.styleId !== undefined ? c.styleId : state.styleId,
				styleRecipeId: c.styleRecipeId !== undefined ? c.styleRecipeId : state.styleRecipeId,
				stylePrompt: c.stylePrompt ?? state.stylePrompt,
				videoUrl: c.videoUrl ?? state.videoUrl,
				slidesDir: c.slidesDir ?? state.slidesDir,
				slides: (() => {
					const mapped = (c.slides ?? state.slides).map((s) => ({
						...s,
						...(() => {
							const variants = dedupeVariants(s.variants || [])
							const safeActive = Math.min(
								s.activeVariant || 0,
								Math.max(0, variants.length - 1),
							)
							const base = {
								...s,
								variants,
								activeVariant: safeActive,
							}
							return variants.length > 0
								? applyActiveVariantView(base, safeActive)
								: base
						})(),
					}))
					const target = (c.slideCount ?? state.slideCount) || mapped.length
					while (mapped.length < target) {
						const i = mapped.length
						mapped.push({
							index: i + 1,
							title: `Slide ${i + 1}`,
							headline: "",
							content: "",
							visualConcept: "",
							backgroundMode: "opaque" as const,
							type: "Content",
							status: "pending" as const,
							filename: String(i + 1).padStart(2, "0") + "-slide.html",
							renderMode: "html" as const,
							variants: [],
							activeVariant: 0,
						})
					}
					return mapped
				})(),
				styles: c.styles ?? state.styles,
				styleRecipes: c.styleRecipes ?? state.styleRecipes,
				categories: c.categories ?? state.categories,
				existingVideos: c.existingVideos ?? state.existingVideos,
				existingBackgroundImages:
					c.existingBackgroundImages ?? state.existingBackgroundImages,
				annotations: c.annotations ?? state.annotations,
				annotationsFile:
					c.annotationsFile ?? state.annotationsFile,
				initialized: true,
			}
		}

		case "SET_ANNOTATION_MODE":
			return { ...state, annotateMode: action.active }

		case "SET_ANNOTATIONS_FILE":
			return {
				...state,
				annotationsFile: action.file,
				annotations: action.file.notes,
			}

		case "SET_SPEAKER_NOTE": {
			const notes = { ...state.annotationsFile.notes }
			if (action.note.trim()) {
				notes[action.slideIndex] = action.note
			} else {
				delete notes[action.slideIndex]
			}
			const annotations = { ...state.annotations }
			if (action.note.trim()) {
				annotations[action.slideIndex] = action.note
			} else {
				delete annotations[action.slideIndex]
			}
			return {
				...state,
				annotations,
				annotationsFile: { ...state.annotationsFile, notes },
			}
		}

		case "SET_STATUS":
			return { ...state, statusText: action.text }

		case "SET_GENERATING":
			return { ...state, generating: action.generating }

		case "SET_VIDEOS":
			return { ...state, existingVideos: action.videos }

		case "SET_ACTIVE_VARIANT_BACKDROP": {
			const slides = state.slides.map((s, i) => {
				if (i !== action.slideIndex) return s
				const variants = s.variants || []
				if (variants.length === 0) return s
				const activeIdx = Math.min(s.activeVariant, variants.length - 1)
				const nextVariants = variants.map((v, vi) =>
					vi === activeIdx ? { ...v, backdropVideo: action.backdropVideo } : v,
				)
				return { ...s, variants: nextVariants }
			})
			return { ...state, slides }
		}

		case "SET_ACTIVE_VARIANT_HTML": {
			const slides = state.slides.map((s, i) => {
				if (i !== action.slideIndex) return s
				const variants = s.variants || []
				if (variants.length === 0) return s
				const activeIdx = Math.min(s.activeVariant, variants.length - 1)
				const nextVariants = variants.map((v, vi) =>
					vi === activeIdx ? { ...v, htmlContent: action.html } : v,
				)
				return { ...s, variants: nextVariants }
			})
			return { ...state, slides }
		}

		default:
			return state
	}
}

"use client";

import {
	type Annotation as AgentationAnnotation,
	loadAnnotations as loadAgentationAnnotations,
} from "agentation";
import { useCallback, useEffect, useRef } from "react";
import {
	checkSlideExists,
	fetchConfig,
	fetchSlideHtml,
	fetchVariants,
	type PersistedSlideVariants,
	saveDeck,
	saveVariants,
} from "./api";
import { isDeckAspectRatio } from "./aspect-ratio";
import { deriveDisplayVariants } from "./variant-display";
import {
	type DeckAction,
	type DeckState,
	type SlideState,
	type SlideVariant,
} from "./types";
import { annotationKey } from "./types";

const SCOPED_ANNOTATION_KEY = /^\d+:(image|html)(:.+)?$/;
const CHROME_HINTS =
	/\b(sidebar|toolbar|navbar|dropdown|toggle|tablist|drawer|menu|settings|theme toggle|slide mode)\b/i;
const TEST_COPY_HINTS =
	/\b(hi mom|lorem ipsum|test(?:ing)?\b|placeholder\b|debug\b)\b/i;

function sanitizeLegacyAnnotations(
	annotations: Record<string, unknown[]>,
): Record<string, unknown[]> {
	const normalized: Record<string, unknown[]> = {};

	for (const [rawKey, value] of Object.entries(annotations || {})) {
		if (!Array.isArray(value)) continue;
		let key = rawKey.trim();

		// Legacy format: "1" -> "1:image"
		if (/^\d+$/.test(key)) {
			key = `${key}:image`;
		}

		// Keep only scoped keys supported by current system.
		if (!SCOPED_ANNOTATION_KEY.test(key)) continue;
		normalized[key] = value;
	}

	// If variant-scoped keys exist for a slide/mode, drop legacy base key
	// to avoid stale old annotations leaking into generation.
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

function parsePersistedVariantsEntry(
	entry: PersistedSlideVariants | SlideVariant[] | undefined,
	fallbackThemeMode: "light" | "dark",
): { variants: SlideVariant[]; activeVariant: number; filename?: string } {
	if (!entry) return { variants: [], activeVariant: 0 };

	const normalizeVariant = (variant: SlideVariant): SlideVariant => {
		// Strip any legacy themeConfig from persisted data — deck themeModes is source of truth
		const { themeConfig: _strip, ...rest } = variant as SlideVariant & { themeConfig?: unknown };
		return {
			...rest,
			themeMode:
				variant.themeMode === "light" || variant.themeMode === "dark"
					? variant.themeMode
					: fallbackThemeMode,
		};
	};

	const normalizeAndKeepOrder = (variants: SlideVariant[]) => {
		// Do not collapse variants by content/filename here: that can silently destroy
		// user history. Only drop exact duplicate IDs.
		const out: SlideVariant[] = [];
		const seenIds = new Set<string>();
		for (const rawVariant of variants) {
			const variant = normalizeVariant(rawVariant);
			const id = typeof variant.id === "string" ? variant.id.trim() : "";
			if (id) {
				if (seenIds.has(id)) continue;
				seenIds.add(id);
			}
			out.push(variant);
		}
		return out;
	};

	if (Array.isArray(entry)) {
		return { variants: normalizeAndKeepOrder(entry), activeVariant: 0 };
	}

	const variants = normalizeAndKeepOrder(
		Array.isArray(entry.variants) ? entry.variants : [],
	);
	const maxIndex = Math.max(0, variants.length - 1);
	const activeVariant = Math.max(
		0,
		Math.min(entry.activeVariant || 0, maxIndex),
	);
	const filename =
		typeof entry.filename === "string" ? entry.filename : undefined;
	return { variants, activeVariant, filename };
}

function mapAgentationStatusToOpen(
	status: AgentationAnnotation["status"],
): "open" | "closed" {
	if (!status) return "open";
	switch (status) {
		case "pending":
		case "acknowledged":
			return "open";
		case "resolved":
		case "dismissed":
			return "closed";
		default:
			return "open";
	}
}

function loadLiveAgentationAnnotations(): Array<{
	id: string;
	x: number;
	y: number;
	note: string;
	status: "open" | "closed";
	intent?: "fix" | "change" | "question" | "approve";
	severity?: "blocking" | "important" | "suggestion";
	element?: { type: string; currentText?: string };
}> {
	if (typeof window === "undefined") return [];
	try {
		const anns = loadAgentationAnnotations<AgentationAnnotation>(
			window.location.pathname,
		);
		return (anns || []).map((a) => ({
			id: a.id,
			x: a.x,
			y: a.y,
			note: a.comment || "",
			status: mapAgentationStatusToOpen(a.status),
			intent: a.intent,
			severity: a.severity,
			element: a.element
				? { type: a.element, currentText: a.elementPath }
				: undefined,
		}));
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`Failed to load live Agentation annotations: ${msg}`);
		return [];
	}
}

function dedupeOpenAnnotations(
	annotations: Array<{
		id?: string;
		x: number;
		y: number;
		note: string;
		status: string;
		intent?: "fix" | "change" | "question" | "approve";
		severity?: "blocking" | "important" | "suggestion";
		element?: { type: string; currentText?: string };
	}>,
) {
	const seen = new Set<string>();
	const out: Array<{
		id: string;
		x: number;
		y: number;
		note: string;
		status: string;
		intent?: "fix" | "change" | "question" | "approve";
		severity?: "blocking" | "important" | "suggestion";
		element?: { type: string; currentText?: string };
	}> = [];
	for (const ann of annotations) {
		const id =
			ann.id ||
			`anon:${Math.round(ann.x * 10)}:${Math.round(ann.y * 10)}:${ann.note
				.trim()
				.toLowerCase()}`;
		if (seen.has(id)) continue;
		seen.add(id);
		out.push({ ...ann, id });
	}
	return out;
}

function isLikelyUiChromeAnnotation(ann: {
	note: string;
	element?: { type: string; currentText?: string };
}) {
	const note = ann.note || "";
	const type = ann.element?.type || "";
	const path = ann.element?.currentText || "";
	const haystack = `${note} ${type} ${path}`.toLowerCase();
	if (
		haystack.includes("__next_root_layout_boundary__") ||
		haystack.includes("deckplayground") ||
		haystack.includes("slidenav") ||
		haystack.includes("sidebar")
	) {
		return true;
	}
	if (CHROME_HINTS.test(haystack)) {
		const referencesSlideSurface =
			haystack.includes("slide-scope") ||
			haystack.includes("slide-wrapper") ||
			haystack.includes("slide-container");
		if (!referencesSlideSurface) return true;
	}
	return false;
}

function summarizeDirectiveIntent(note: string): string {
	const clean = note.replace(/\s+/g, " ").trim();
	if (!clean) {
		return "Polish this region for cleaner composition and clearer hierarchy.";
	}
	if (TEST_COPY_HINTS.test(clean)) {
		return "Remove accidental placeholder/debug text and keep professional copy only.";
	}

	const replacementMatch = clean.match(
		/replace\s+["“]([^"”]+)["”]\s+with\s+["“]([^"”]+)["”]/i,
	);
	if (replacementMatch) {
		const from = replacementMatch[1].trim();
		const to = replacementMatch[2].trim();
		return `Replace visible text "${from}" with "${to}".`;
	}

	const intents: string[] = [];
	if (
		/(padding|margin|spacing|gap|align|alignment|center|position|move)/i.test(
			clean,
		)
	) {
		intents.push("spacing/alignment");
	}
	if (/(font|type|typography|headline|readability|legib)/i.test(clean)) {
		intents.push("typography hierarchy");
	}
	if (/(color|contrast|palette|background|foreground|accent)/i.test(clean)) {
		intents.push("color/contrast balance");
	}
	if (/(remove|delete|hide|simplify|declutter)/i.test(clean)) {
		intents.push("remove clutter");
	}
	if (/(add|insert|include)\b.*\b(text|copy|headline|label)/i.test(clean)) {
		intents.push("copy refinement");
	}

	if (intents.length > 0) {
		return `Refine ${intents.join(", ")} in this region while preserving slide intent.`;
	}
	return "Apply the requested visual/content refinement intent in this region without introducing debug or UI-chrome copy.";
}

function normalizeAnnotationNoteForModel(note: string): string {
	const clean = note.replace(/\s+/g, " ").trim();
	if (!clean) {
		return "Polish this area for clearer hierarchy and cleaner composition.";
	}
	if (TEST_COPY_HINTS.test(clean)) {
		return "Remove accidental placeholder/debug text and keep professional content only.";
	}
	return clean;
}

export function getOpenAnnotationsForSlide(
	slide: SlideState,
	state: DeckState,
) {
	const variantId = slide.variants?.[slide.activeVariant]?.id;
	const key = annotationKey(slide, variantId);
	const scoped = (state.annotationsFile.annotations[key] || []).filter(
		(a) => a.status === "open" && a.note?.trim(),
	);

	const current = state.slides[state.currentSlide];
	const isCurrentScope =
		!!current &&
		current.index === slide.index &&
		current.renderMode === slide.renderMode &&
		(current.variants?.[current.activeVariant]?.id || "") === (variantId || "");

	if (!isCurrentScope) return scoped;

	const live = loadLiveAgentationAnnotations().filter(
		(a) => a.status === "open" && a.note?.trim(),
	);
	if (!live.length) return scoped;

	// Guard against cross-slide bleed from Agentation's page-level local storage:
	// only merge live records that already belong to this scoped annotation set.
	const scopedById = new Map(scoped.map((a) => [a.id, a]));
	const liveScoped = live.filter((a) => scopedById.has(a.id));
	if (!liveScoped.length) return scoped;

	const merged = scoped.map((a) => {
		const fresh = liveScoped.find((l) => l.id === a.id);
		if (!fresh) return a;
		return {
			...a,
			note: fresh.note || a.note,
			element: fresh.element || a.element,
			intent: fresh.intent || a.intent,
			severity: fresh.severity || a.severity,
		};
	});

	return dedupeOpenAnnotations(merged);
}

export function getGenerationAnnotationsForSlide(
	slide: SlideState,
	state: DeckState,
): Array<{
	note: string;
	x: number;
	y: number;
	element?: { type: string; currentText?: string };
}> {
	const anns = getOpenAnnotationsForSlide(slide, state);
	const filtered = anns.filter(
		(ann) =>
			ann.status === "open" &&
			ann.intent !== "approve" &&
			!isLikelyUiChromeAnnotation(ann) &&
			!TEST_COPY_HINTS.test((ann.note || "").trim()),
	);
	if (anns.length > 0 && filtered.length < anns.length) {
		console.error(
			`Filtered ${
				anns.length - filtered.length
			} annotation(s) for slide ${slide.index}:${slide.renderMode} before generation`,
		);
	}
	return filtered.map((ann) => ({
		note: normalizeAnnotationNoteForModel(ann.note),
		x: ann.x,
		y: ann.y,
		element: ann.element,
	}));
}

export function useInitialize(
	dispatch: React.Dispatch<DeckAction>,
	_state: DeckState,
) {
	const initialized = useRef(false);

	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;

		Promise.all([fetchConfig(), fetchVariants()])
			.then(async ([config, persistedVariants]) => {
				const ds = config.deckState || {};
				const persistedStyleId = ds.styleId as string | null | undefined;
				if (persistedStyleId) {
					const styleExists = (config.styles || []).some(
						(s) =>
							s.id === persistedStyleId || s.shortName === persistedStyleId,
					);
					if (!styleExists) {
						throw new Error(
							`Persisted styleId "${persistedStyleId}" is not available in styles registry`,
						);
					}
				}
				const persistedStyleRecipeId = ds.styleRecipeId as
					| string
					| null
					| undefined;
				if (persistedStyleRecipeId) {
					const recipeExists = (config.styleRecipes || []).some(
						(r) => r.id === persistedStyleRecipeId,
					);
					if (!recipeExists) {
						throw new Error(
							`Persisted styleRecipeId "${persistedStyleRecipeId}" is not available`,
						);
					}
				}
				const slides: SlideState[] = [];
				const fallbackThemeMode: "light" | "dark" =
					ds.slideThemeMode === "light" ? "light" : "dark";

				if (ds.slides && (ds.slides as unknown[]).length > 0) {
					for (const s of ds.slides as Array<Record<string, unknown>>) {
						const idx = (s.index as number) || slides.length + 1;
						const filename =
							(s.filename as string) ||
							`${String(idx).padStart(2, "0")}-slide.png`;
						const persisted =
							persistedVariants[String(idx)] || persistedVariants[filename];
						const variantState = parsePersistedVariantsEntry(
							persisted,
							fallbackThemeMode,
						);
						slides.push({
							index: idx,
							title: (s.title as string) || `Slide ${idx}`,
							headline: (s.headline as string) || "",
							content: (s.content as string) || "",
							visualConcept: (s.visualConcept as string) || "",
							backgroundMode:
								(s.backgroundMode as SlideState["backgroundMode"]) || "opaque",
							type: (s.type as string) || "Content",
							status: "pending",
							filename:
								variantState.filename !== undefined
									? variantState.filename
									: filename,
							renderMode: (s.renderMode as "image" | "html") || "html",
							backdropVideo: (s.backdropVideo as string) || undefined,
							backdropVideoLoop: s.backdropVideoLoop === false ? false : undefined,
							variants: variantState.variants,
							activeVariant: variantState.activeVariant,
						});
					}
				}

				// If the parsed slide list has more entries than the header's
				// slideCount, the list is authoritative — use the actual count.
				const headerSlideCount = (ds.slideCount as number) || 10;
				const effectiveSlideCount = slides.length > headerSlideCount
					? slides.length
					: headerSlideCount;

				const initConfig: Partial<DeckState> = {
					// Explicit null means user selected "None" for this setting.
					// Undefined means no persisted value; use defaults.
					deckDir: (config.deckDir as string) || "",
					deckSelected: config.deckSelected === true,
					aspectRatio: isDeckAspectRatio(String(ds.aspectRatio || ""))
						? (ds.aspectRatio as DeckState["aspectRatio"])
						: "16:9",
					styles: config.styles || [],
					categories: config.categories || {},
					slidesDir: config.slidesDir || (ds.slidesDir as string) || "slides",
					title: (ds.title as string) || "",
					audience: (ds.audience as string) || "",
					purpose: (ds.purpose as string) || "",
					keyMessage: (ds.keyMessage as string) || "",
					tone: (ds.tone as string) || "",
					fontFamily: (ds.fontFamily as string) || "",
					slideThemeMode:
						(ds.slideThemeMode as DeckState["slideThemeMode"]) || "dark",
					slideCount: effectiveSlideCount,
					styleId: (ds.styleId as string) || null,
					styleRecipeId:
						ds.styleRecipeId === null || ds.styleRecipeId === ""
							? null
							: ds.styleRecipeId !== undefined
								? (ds.styleRecipeId as string)
								: (config.defaultStyleRecipeId ?? null),
					stylePrompt: (ds.stylePrompt as string) || "",
					videoUrl:
						(ds.videoBackground as string) === "none"
							? ""
							: (ds.videoBackground as string) || "",
					videoLoop: ds.videoLoop !== false,
					themeConfig:
						(ds.themeConfig as DeckState["themeConfig"]) || undefined,
					themeModes: (ds.themeModes as DeckState["themeModes"]) || undefined,
					styleRecipes: config.styleRecipes || [],
					existingVideos: (ds.existingVideos as string[]) || [],
					existingBackgroundImages:
						(ds.existingBackgroundImages as string[]) || [],
					slides: slides.length > 0 ? slides : undefined,
					models: config.models as DeckState["models"] | undefined,
				};

				if (ds.annotationsFile) {
					const af = ds.annotationsFile as DeckState["annotationsFile"];
					if (af.annotations) {
						af.annotations = sanitizeLegacyAnnotations(
							af.annotations as Record<string, unknown[]>,
						) as typeof af.annotations;
					}
					initConfig.annotationsFile = af;
					initConfig.annotations = af.notes || {};
				} else if (ds.annotations) {
					const notes = ds.annotations as Record<number, string>;
					initConfig.annotations = notes;
					initConfig.annotationsFile = {
						notes,
						annotations: {},
					};
				}

				dispatch({
					type: "INIT_FROM_CONFIG",
					config: initConfig,
				});

				if (!slides.length) {
					const count = initConfig.slideCount || 10;
					const defaultSlides: SlideState[] = [];
					for (let i = 0; i < count; i++) {
						defaultSlides.push({
							index: i + 1,
							title: i === 0 ? "Title Slide" : `Slide ${i + 1}`,
							headline: "",
							content: "",
							visualConcept: "",
							backgroundMode: "opaque",
							type: i === 0 ? "Title" : "Content",
							status: "pending",
							filename: `${String(i + 1).padStart(2, "0")}-slide.png`,
							renderMode: "html",
							variants: [],
							activeVariant: 0,
						});
					}
					dispatch({
						type: "SET_SLIDES",
						slides: defaultSlides,
					});
				}

				dispatch({
					type: "SET_STATUS",
					text: "Checking existing slides...",
				});
				const slidesToCheck = slides.length > 0 ? slides : [];
				await Promise.all(
					slidesToCheck.map(async (slide, i) => {
						if (!slide.filename?.trim()) return;
						const exists = await checkSlideExists(slide.filename);
						if (exists) {
							let htmlContent: string | undefined;
							if (
								slide.renderMode === "html" &&
								slide.filename.endsWith(".html")
							) {
								htmlContent =
									(await fetchSlideHtml(slide.filename)) || undefined;
							}
							dispatch({
								type: "SET_SLIDE_STATUS",
								index: i,
								status: "done",
								htmlContent,
								filename: slide.filename,
							});
						}
					}),
				);
				dispatch({ type: "SET_STATUS", text: "Ready" });
			})
			.catch((error: unknown) => {
				const msg = error instanceof Error ? error.message : String(error);
				console.error(`Initialization failed: ${msg}`);
				dispatch({
					type: "SET_STATUS",
					text: `Initialization failed: ${msg}`,
				});
				dispatch({ type: "INIT_FROM_CONFIG", config: {} });
			});
	}, [dispatch]);
}

export function useKeyboard(
	dispatch: React.Dispatch<DeckAction>,
	state: DeckState,
) {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			const slide = state.slides[state.currentSlide];

			if (e.key === "ArrowLeft") {
				e.preventDefault();
				if (state.currentSlide > 0) {
					dispatch({
						type: "SET_CURRENT_SLIDE",
						index: state.currentSlide - 1,
					});
				}
			}
			if (e.key === "ArrowRight") {
				e.preventDefault();
				if (state.currentSlide < state.slides.length - 1) {
					dispatch({
						type: "SET_CURRENT_SLIDE",
						index: state.currentSlide + 1,
					});
				}
			}
			if (e.key === "ArrowUp") {
				if (!slide || !slide.variants?.length) return;
				const visibleVariants = deriveDisplayVariants(slide);
				if (!visibleVariants.length) return;
				const activeVisible = visibleVariants.findIndex((v) => v.isActive);
				e.preventDefault();
				if (activeVisible > 0) {
					const prev = visibleVariants[activeVisible - 1];
					if (!prev) return;
					dispatch({
						type: "SELECT_VARIANT",
						slideIndex: state.currentSlide,
						variantIndex: prev.originalIndex,
					});
				}
			}
			if (e.key === "ArrowDown") {
				if (!slide || !slide.variants?.length) return;
				const visibleVariants = deriveDisplayVariants(slide);
				if (!visibleVariants.length) return;
				const activeVisible = visibleVariants.findIndex((v) => v.isActive);
				e.preventDefault();
				if (activeVisible < 0) {
					const first = visibleVariants[0];
					if (!first) return;
					dispatch({
						type: "SELECT_VARIANT",
						slideIndex: state.currentSlide,
						variantIndex: first.originalIndex,
					});
					return;
				}
				if (activeVisible < visibleVariants.length - 1) {
					const next = visibleVariants[activeVisible + 1];
					if (!next) return;
					dispatch({
						type: "SELECT_VARIANT",
						slideIndex: state.currentSlide,
						variantIndex: next.originalIndex,
					});
				}
			}
			if (e.key === "Escape") {
				if (state.annotateMode) {
					dispatch({
						type: "SET_ANNOTATION_MODE",
						active: false,
					});
				}
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [
		dispatch,
		state.currentSlide,
		state.slides,
		state.slides.length,
		state.annotateMode,
	]);
}

// Module-level guard to prevent autosave during deck switching.
let _autoSaveEnabled = true;
export function setAutoSaveEnabled(v: boolean) {
	_autoSaveEnabled = v;
}

export function useAutoSave(
	state: DeckState,
	dispatch: React.Dispatch<DeckAction>,
) {
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const lastSavedRef = useRef("");

	const save = useCallback(() => {
		if (!_autoSaveEnabled) return;
		if (!state.initialized) return; // Don't save before initialization completes
		if (!state.deckDir) return; // Don't save without a valid deck directory
		const body = {
			deckDir: state.deckDir,
			aspectRatio: state.aspectRatio,
			title: state.title,
			audience: state.audience,
			purpose: state.purpose,
			context: state.context,
			keyMessage: state.keyMessage,
			brandNotes: state.brandNotes,
			tone: state.tone,
			fontFamily: state.fontFamily,
			slideThemeMode: state.slideThemeMode,
			themeConfig: state.themeConfig,
			themeModes: state.themeModes,
			slideCount: state.slideCount,
			styleId: state.styleId,
			styleRecipeId: state.styleRecipeId,
			styleRecipes: state.styleRecipes,
			stylePrompt: state.stylePrompt,
			backgroundMedia: state.videoUrl,
			videoLoop: state.videoLoop,
			slides: state.slides.map((s) => ({
				index: s.index,
				title: s.title,
				headline: s.headline,
				content: s.content,
				visualConcept: s.visualConcept,
				backgroundMode: s.backgroundMode,
				type: s.type,
				filename: s.filename,
				renderMode: s.renderMode,
				...(s.backdropVideo ? { backdropVideo: s.backdropVideo } : {}),
				...(s.backdropVideoLoop === false ? { backdropVideoLoop: false } : {}),
				...(s.backgroundMediaUrl ? { backgroundMediaUrl: s.backgroundMediaUrl } : {}),
			})),
			annotations: state.annotations,
		};
			const variantsBody = {
				deckDir: state.deckDir,
				variants: Object.fromEntries(
					state.slides.map((s) => [
						String(s.index),
					{
						variants: (s.variants || []).map(({ themeConfig: _strip, ...rest }: SlideVariant & { themeConfig?: unknown }) => rest),
						activeVariant: s.activeVariant || 0,
						filename: s.filename,
					},
				]),
			),
		};

		const hash = JSON.stringify({
			body,
			variants: variantsBody.variants,
		});
		if (hash === lastSavedRef.current) return;
		lastSavedRef.current = hash;

		Promise.all([saveDeck(body), saveVariants(variantsBody)]).catch(
			(error: unknown) => {
				const msg = error instanceof Error ? error.message : String(error);
				console.error(`Auto-save failed: ${msg}`);
				dispatch({
					type: "SET_STATUS",
					text: `Auto-save failed: ${msg}`,
				});
			},
		);
	}, [state, dispatch]);

	useEffect(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(save, 3000);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [save]);
}

export function buildSlidePrompt(slide: SlideState, state: DeckState): string {
	const tc = state.themeConfig;
	const variantId = slide.variants?.[slide.activeVariant]?.id;
	const selectedFont = state.fontFamily?.trim();
	const contentLines = slide.content
		.split("\n")
		.map((line) => line.replace(/^\s*[-*•\d.]+\s*/, "").trim())
		.filter(Boolean);
	const allowedText = [slide.headline?.trim() || "", ...contentLines].filter(
		Boolean,
	);
	const parts = [
		"Create a professional keynote-grade presentation slide image.",
		"",
		`**Slide ${slide.index}: ${slide.headline || slide.title}**`,
		"",
		"Specifications:",
		`- Aspect: ${state.aspectRatio}`,
		`- Background: ${tc.background || "#0a0e1a"}`,
		`- Primary/accent color: ${tc.primary || "#00d4aa"}`,
		`- Foreground/text color target: ${tc.foreground || "#e2e8f0"}`,
		`- Card/surface color target: ${tc.card || "#1a1f2e"}`,
		"- Global aesthetic source: selected Art Style + Style Recipe for structure/treatment. Theme colors above are authoritative and must not be overridden.",
		`- Generation context: mode=${slide.renderMode}, variation=${variantId || "base"}`,
		selectedFont
			? `- Typography target: use "${selectedFont}" or a very close visual equivalent if unavailable.`
			: "- Typography target: choose a distinctive premium display/body pairing; avoid bland defaults.",
		"- Follow scene-description prompting best practices: compose a clear visual scene with deliberate hierarchy, spacing, and contrast (avoid keyword salad).",
		"- Per-slide direction is for unique composition/content only, not global theme or aesthetic settings.",
		"- Treat all edit/annotation directives as operator instructions, NOT on-slide copy.",
		"- Never render internal instructions, annotation note sentences, debug text, placeholder copy, or UI chrome labels (like toggle/helper text) unless explicitly provided as intended slide copy.",
		"",
	];

	if (slide.headline) parts.push(`Headline: "${slide.headline}"`);
	if (slide.content) parts.push(`Content:\n${slide.content}`);
	if (slide.visualConcept)
		parts.push(
			`Per-slide composition/content direction (not global style): ${slide.visualConcept}`,
		);
	parts.push(`Slide type: ${slide.type}`);
	if (state.title) parts.push(`Deck title: ${state.title}`);
	if (state.audience) parts.push(`Target audience: ${state.audience}`);
	parts.push("");
	parts.push("Allowed on-slide text:");
	if (allowedText.length > 0) {
		for (const text of allowedText) {
			parts.push(`- "${text}"`);
		}
	} else {
		parts.push("- No required text. Use visual-only composition.");
	}
	parts.push(
		"- Do not invent unrelated words, badges, captions, labels, or debug phrases.",
	);
	parts.push(
		"- Text gating rule: on-slide text must come from the Allowed on-slide text list or from explicit quoted replacements in edit directives.",
	);

	const anns = getOpenAnnotationsForSlide(slide, state);
	const modelDirectives = anns
		.filter(
			(ann) =>
				ann.intent !== "approve" &&
				!isLikelyUiChromeAnnotation(ann) &&
				!TEST_COPY_HINTS.test((ann.note || "").trim()),
		)
		.map((ann) => {
			const xZone = ann.x < 33 ? "left" : ann.x > 66 ? "right" : "center";
			const yZone = ann.y < 33 ? "top" : ann.y > 66 ? "bottom" : "middle";
			const region =
				yZone === "middle" && xZone === "center"
					? "center of the slide"
					: `${yZone}-${xZone} area`;
			const elementCtx =
				ann.element && ann.element.type !== "background"
					? ` (targeting the ${ann.element.type})`
					: "";
			const intentLabel =
				ann.intent === "fix"
					? "fix"
					: ann.intent === "change"
						? "change"
						: ann.intent === "question"
							? "clarify"
							: "refine";
			const priorityLabel =
				ann.severity === "blocking"
					? "[High priority] "
					: ann.severity === "important"
						? "[Important] "
						: "";
			const intent = summarizeDirectiveIntent(ann.note);
			return `- ${priorityLabel}Directive (${intentLabel}) for ${region}${elementCtx}: ${intent}`;
		});

	if (modelDirectives.length > 0) {
		parts.push("");
		parts.push("Edit directives (instruction-only; never render verbatim):");
		parts.push(
			"- Apply these as visual/layout/content edits to this generation.",
		);
		parts.push(
			"- If a directive implies text change, rewrite that copy to match deck voice unless exact replacement text is explicitly quoted.",
		);
		parts.push(...modelDirectives);
	}

	return parts.join("\n");
}

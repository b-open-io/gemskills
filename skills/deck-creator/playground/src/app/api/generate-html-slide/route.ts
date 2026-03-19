import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isDeckAspectRatio } from "@/lib/aspect-ratio";
import {
	getGoogleFontImportUrl,
	getPreferredFontStack,
	isSupportedFontFamily,
} from "@/lib/font-catalog";
import {
	buildHtmlSlideSystemPrompt,
	getSlidesDir,
	getStylesRegistry,
	getVideoLibraryEntry,
	TILES_DIR,
} from "@/lib/server/deck";
import {
	callGemini,
	callGeminiImage,
	getApiKey,
	loadImage,
	saveImage,
} from "@/lib/server/gemini";
import {
	composeStyleInstructionsForRole,
	isKnownStyleRecipeId,
	type StyleRecipeInfo,
} from "@/lib/style-recipes";

const UI_CHROME_HINTS =
	/\b(sidebar|toolbar|navbar|dropdown|toggle|tablist|drawer|menu|settings|theme toggle|slide mode)\b/i;
const TEST_COPY_HINTS =
	/\b(hi mom|lorem ipsum|test(?:ing)?\b|placeholder\b|debug\b)\b/i;

function isExternalVideoUrl(videoUrl?: string): boolean {
	if (!videoUrl) return false;
	return /^https?:\/\//i.test(videoUrl) || /^\/\//.test(videoUrl);
}

function buildVideoBackdropContext(videoUrl?: string): string {
	if (!videoUrl) return "";
	if (isExternalVideoUrl(videoUrl)) {
		return `Video backdrop source: external URL (${videoUrl}). Design overlay content to complement this motion and color atmosphere.`;
	}

	const videoMeta = getVideoLibraryEntry(videoUrl);
	if (!videoMeta) {
		return `Video backdrop file: ${videoUrl}.`;
	}

	const lines = [
		`Video backdrop file: ${videoUrl}.`,
		`Original video prompt: ${videoMeta.prompt}`,
	];
	if (
		videoMeta.composedPrompt &&
		videoMeta.composedPrompt !== videoMeta.prompt
	) {
		lines.push(`Composed generation prompt: ${videoMeta.composedPrompt}`);
	}
	if (videoMeta.styleId) {
		lines.push(`Source art style id: ${videoMeta.styleId}`);
	}
	if (videoMeta.styleRecipeId) {
		lines.push(`Source style recipe id: ${videoMeta.styleRecipeId}`);
	}
	if (videoMeta.themeConfig?.primary) {
		lines.push(
			`Video palette primary/accent: ${videoMeta.themeConfig.primary}`,
		);
	}
	if (videoMeta.themeConfig?.background) {
		lines.push(
			`Video palette base background: ${videoMeta.themeConfig.background}`,
		);
	}
	if (videoMeta.duration) {
		lines.push(`Loop duration: ${videoMeta.duration}s`);
	}
	if (videoMeta.aspectRatio) {
		lines.push(`Video aspect ratio: ${videoMeta.aspectRatio}`);
	}
	return lines.join("\n");
}

function enforceSelectedFont(html: string, fontFamily?: string): string {
	const selected = fontFamily?.trim();
	if (!selected) return html;

	const fontStack = getPreferredFontStack(selected);
	const importUrl = getGoogleFontImportUrl(selected);
	const rules = [
		importUrl ? `@import url('${importUrl}');` : "",
		`.slide-wrapper, .slide-wrapper * { font-family: ${fontStack} !important; }`,
	]
		.filter(Boolean)
		.join("\n");

	// Append a final override style block so selected font wins even if
	// model CSS declares its own font-family rules later in earlier blocks.
	return `${html}\n<style>\n${rules}\n</style>`;
}

function isLikelyUiChromeAnnotation(annotation: {
	note: string;
	element?: { type: string; currentText?: string };
}): boolean {
	const note = annotation.note || "";
	const type = annotation.element?.type || "";
	const path = annotation.element?.currentText || "";
	const haystack = `${note} ${type} ${path}`.toLowerCase();

	if (
		haystack.includes("__next_root_layout_boundary__") ||
		haystack.includes("deckplayground") ||
		haystack.includes("slidenav") ||
		haystack.includes("sidebar")
	) {
		return true;
	}

	if (UI_CHROME_HINTS.test(haystack)) {
		const referencesSlideSurface =
			haystack.includes("slide-scope") ||
			haystack.includes("slide-wrapper") ||
			haystack.includes("slide-container");
		if (!referencesSlideSurface) return true;
	}
	return false;
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

function normalizeForCopyCheck(value: string): string {
	return value
		.toLowerCase()
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/<[^>]+>/g, " ")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractVisibleText(html: string): string {
	return html
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

interface ResolvedStyle {
	id: string;
	name: string;
	promptHints: string;
	category: string;
}

interface BackdropInput {
	apiKey: string;
	slideIndex: number;
	filename: string;
	aspectRatio: string;
	visualConcept?: string;
	style: ResolvedStyle | null;
	styleAssetInstructions: string;
	themeConfig: Record<string, string>;
}

interface BackdropResult {
	filename: string;
	url: string;
	prompt: string;
	rawOutput?: string;
}

function buildBackdropPrompt(input: BackdropInput): string {
	const tc = input.themeConfig;
	const themeLines = [
		`Theme palette constraints:`,
		`- Background/base tone: ${tc.background || "#0a0e1a"}`,
		`- Primary/accent hue: ${tc.primary || "#00d4aa"}`,
		`- Foreground contrast target: ${tc.foreground || "#e2e8f0"}`,
		`- Surface color family: ${tc.card || "#1a1f2e"}`,
		`- Muted detail tone: ${tc["muted-foreground"] || "#94a3b8"}`,
	];

	const styleLines = input.style
		? [
				`Art style reference: ${input.style.name}`,
				`Style guidance: ${input.style.promptHints}`,
				"IMPORTANT: The attached reference image is a STYLE SAMPLE ONLY. Copy its visual aesthetic (color treatment, texture, rendering technique, mood, and composition style) but DO NOT reproduce its subject matter. Generate original content appropriate for a presentation backdrop using the style's aesthetic language.",
			]
		: [
				"No explicit art style selected: keep a premium cinematic presentation backdrop treatment.",
			];

	return [
		`Create a ${input.aspectRatio} background image plate for a presentation slide.`,
		"No text, no numbers, no logos, no UI controls, no labels, no watermarks.",
		"No legible glyphs or pseudo-text forms: avoid letters, monograms, wordmarks, typographic shapes, and character-like symbols.",
		"Keep the composition suitable for overlay content (clear hierarchy and readable central regions).",
		"Per-slide direction is slide-specific composition/content guidance only; do not treat it as global aesthetic/theme input.",
		...themeLines,
		...styleLines,
		input.styleAssetInstructions
			? `Role style directives:\n${input.styleAssetInstructions}`
			: "",
		input.visualConcept
			? `Per-slide composition/content direction (not global style): ${input.visualConcept}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

async function generateBackdropImage(
	input: BackdropInput,
	precomputedFilename?: string,
): Promise<BackdropResult> {
	const baseName = input.filename.replace(/\.\w+$/, "");
	const backdropFilename =
		precomputedFilename || `${baseName}-bg-${Date.now()}.png`;
	const outputPath = join(getSlidesDir(), backdropFilename);

	const prompt = buildBackdropPrompt(input);
	const options: Parameters<typeof callGeminiImage>[2] = {
		aspectRatio: input.aspectRatio,
		imageSize: "2K",
	};

	if (input.style) {
		const tilePath = join(TILES_DIR, `${input.style.id}.png`);
		if (existsSync(tilePath)) {
			const tileImage = await loadImage(tilePath);
			if (tileImage) {
				options.inputImages = [tileImage];
			}
		}
	}

	const result = await callGeminiImage(input.apiKey, prompt, options);
	if (result.images.length === 0) {
		throw new Error(
			`Backdrop generation returned no image${result.text ? `: ${result.text}` : ""}`,
		);
	}

	const image = result.images[0];
	await saveImage(image.data, image.mimeType, outputPath);

	return {
		filename: backdropFilename,
		url: `/slides/${backdropFilename}`,
		prompt,
		rawOutput: result.text,
	};
}

export async function POST(req: Request) {
	const wantsStream = req.headers.get("accept")?.includes("text/x-ndjson");

	// When the client requests streaming, we return NDJSON with status updates.
	// Otherwise, fall back to the original single-JSON response.
	if (wantsStream) {
		const body = await req.json();
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				const send = (data: Record<string, unknown>) => {
					controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
				};
				try {
					const result = await generateHtmlSlideImpl(body, send);
					send(result);
				} catch (error: unknown) {
					const msg = error instanceof Error ? error.message : String(error);
					send({ type: "result", ok: false, error: msg });
				}
				controller.close();
			},
		});
		return new Response(stream, {
			headers: { "Content-Type": "text/x-ndjson", "Cache-Control": "no-cache" },
		});
	}

	// Non-streaming path — original behavior
	try {
		const body = await req.json();
		const result = await generateHtmlSlideImpl(body);
		if (!result.ok) {
			return NextResponse.json(result, {
				status: (result.httpStatus as number) || 500,
			});
		}
		return NextResponse.json(result);
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`  HTML slide generation failed: ${msg}`);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

type StatusCallback = (data: Record<string, unknown>) => void;

async function generateHtmlSlideImpl(
	body: {
		slideIndex: number;
		aspectRatio?: string;
		headline: string;
		content: string;
		type: string;
		visualConcept?: string;
		backgroundMode?: "transparent" | "opaque" | "solid" | "gradient";
		styleId?: string;
		styleRecipeId?: string | null;
		styleRecipes?: StyleRecipeInfo[];
		stylePrompt?: string;
		deckTitle?: string;
		audience?: string;
		filename: string;
		annotations?: Array<{
			note: string;
			x: number;
			y: number;
			element?: { type: string };
		}>;
		hasVideoBackground?: boolean;
		videoUrl?: string;
		backgroundMediaType?: "none" | "video" | "image";
		backgroundMediaUrl?: string;
		fontFamily?: string;
		themeConfig?: Record<string, string>;
		skipReview?: boolean;
	},
	sendStatus?: StatusCallback,
): Promise<Record<string, unknown>> {
	const styleRecipeId =
		typeof body.styleRecipeId === "string"
			? body.styleRecipeId.trim() || null
			: body.styleRecipeId;

	if (!Number.isFinite(body.slideIndex) || body.slideIndex <= 0) {
		return {
			type: "result",
			ok: false,
			error: "slideIndex must be a positive number",
			httpStatus: 400,
		};
	}
	if (!body.filename?.trim()) {
		return {
			type: "result",
			ok: false,
			error: "filename is required",
			httpStatus: 400,
		};
	}
	const rawAspectRatio = String(body.aspectRatio || "").trim();
	if (rawAspectRatio && !isDeckAspectRatio(rawAspectRatio)) {
		return {
			type: "result",
			ok: false,
			error: `Unsupported aspectRatio "${rawAspectRatio}"`,
			httpStatus: 400,
		};
	}
	const aspectRatio = isDeckAspectRatio(rawAspectRatio)
		? rawAspectRatio
		: "16:9";
	if (body.fontFamily?.trim() && !isSupportedFontFamily(body.fontFamily)) {
		return {
			type: "result",
			ok: false,
			error: `Unsupported fontFamily "${body.fontFamily}". Choose a supported font from the selector.`,
			httpStatus: 422,
		};
	}
	if (
		typeof styleRecipeId === "string" &&
		!isKnownStyleRecipeId(styleRecipeId, body.styleRecipes)
	) {
		return {
			type: "result",
			ok: false,
			error: `Unknown styleRecipeId "${styleRecipeId}"`,
			httpStatus: 400,
		};
	}

	sendStatus?.({ type: "status", message: "Resolving style..." });

	try {
		const apiKey = getApiKey();
		const registry = getStylesRegistry();

		// Resolve art style — this drives the entire aesthetic
		let resolvedStyle: ResolvedStyle | null = null;
		if (body.styleId) {
			const style = registry.styles.find(
				(s) => s.id === body.styleId || s.shortName === body.styleId,
			);
			if (!style) {
				return {
					type: "result",
					ok: false,
					error: `Unknown styleId "${body.styleId}"`,
					httpStatus: 400,
				};
			}
			resolvedStyle = {
				id: style.id,
				name: style.name,
				promptHints: style.promptHints,
				category: style.category,
			};
		}

		const tc = body.themeConfig || {};
		const accentColor = tc.primary || "#00d4aa";
		const bgColor = tc.background || "#0a0e1a";
		const styleRecipeInstructions = composeStyleInstructionsForRole({
			role: "html-slide",
			styleRecipeId,
			styleRecipes: body.styleRecipes,
			customPrompt: body.stylePrompt,
		});
		const styleAssetInstructions = composeStyleInstructionsForRole({
			role: "image-asset",
			styleRecipeId,
			styleRecipes: body.styleRecipes,
			customPrompt: body.stylePrompt,
		});

		let annotationEdits = "";
		const rawAnnotations = Array.isArray(body.annotations)
			? body.annotations
			: [];
		const nonEmptyAnnotations = rawAnnotations.filter(
			(a) => (a.note || "").trim().length > 0,
		);
		const uiChromeAnnotations = nonEmptyAnnotations.filter((a) =>
			isLikelyUiChromeAnnotation(a),
		);
		const sanitizedAnnotations = nonEmptyAnnotations
			.filter((a) => !isLikelyUiChromeAnnotation(a))
			.map((a) => ({
				...a,
				note: normalizeAnnotationNoteForModel(a.note),
			}));
		if (rawAnnotations.length > 0 && sanitizedAnnotations.length === 0) {
			const droppedEmpty = rawAnnotations.length - nonEmptyAnnotations.length;
			const droppedUiChrome = uiChromeAnnotations.length;
			console.error(
				`[generate-html-slide] rejected annotation payload for slide ${body.slideIndex}`,
				{ provided: rawAnnotations.length, droppedEmpty, droppedUiChrome },
			);
			return {
				type: "result",
				ok: false,
				error:
					"All provided annotations were filtered out as empty or non-slide UI notes. Clear stale annotations and retry.",
				details: {
					provided: rawAnnotations.length,
					droppedEmpty,
					droppedUiChrome,
				},
				httpStatus: 422,
			};
		}
		if (rawAnnotations.length > sanitizedAnnotations.length) {
			console.error(
				`[generate-html-slide] filtered annotations for slide ${body.slideIndex}`,
				{
					provided: rawAnnotations.length,
					used: sanitizedAnnotations.length,
					droppedEmpty: rawAnnotations.length - nonEmptyAnnotations.length,
					droppedUiChrome: uiChromeAnnotations.length,
				},
			);
		}
		if (sanitizedAnnotations.length > 0) {
			annotationEdits =
				"\n\nEdit instructions (incorporate these changes):\n" +
				sanitizedAnnotations
					.map((a) => {
						const xZone = a.x < 33 ? "left" : a.x > 66 ? "right" : "center";
						const yZone = a.y < 33 ? "top" : a.y > 66 ? "bottom" : "middle";
						const region =
							yZone === "middle" && xZone === "center"
								? "center"
								: `${yZone}-${xZone}`;
						const elemCtx =
							a.element && a.element.type !== "background"
								? ` (targeting ${a.element.type})`
								: "";
						return `- In the ${region} area${elemCtx}: ${a.note}`;
					})
					.join("\n");
		}

		const backgroundMode =
			body.backgroundMode === "transparent" ? "transparent" : "opaque";
		const transparentMode = backgroundMode === "transparent";
		const mediaType =
			body.backgroundMediaType === "video" ||
			body.backgroundMediaType === "image"
				? body.backgroundMediaType
				: body.hasVideoBackground
					? "video"
					: "none";
		const hasSelectedVideoMedia = mediaType === "video";
		const hasSelectedImageMedia = mediaType === "image";
		const selectedImageBackdropUrl = hasSelectedImageMedia
			? (body.backgroundMediaUrl || body.videoUrl || "").trim()
			: "";
		if (hasSelectedImageMedia && !selectedImageBackdropUrl) {
			return {
				type: "result",
				ok: false,
				error:
					'backgroundMediaUrl is required when backgroundMediaType is "image"',
				httpStatus: 400,
			};
		}
		const useGlobalVideoLayer = transparentMode && hasSelectedVideoMedia;
		const useGlobalImageLayer = transparentMode && hasSelectedImageMedia;
		const shouldGenerateBackdrop = backgroundMode === "opaque";
		// Pre-compute backdrop details so HTML generation can start in parallel
		const backdropInput: BackdropInput = {
			apiKey,
			slideIndex: body.slideIndex,
			filename: body.filename,
			aspectRatio,
			visualConcept: body.visualConcept,
			style: resolvedStyle,
			styleAssetInstructions,
			themeConfig: tc,
		};
		let backdropInfo: { filename: string; url: string; prompt: string } | null =
			null;
		if (shouldGenerateBackdrop) {
			const baseName = body.filename.replace(/\.\w+$/, "");
			const backdropFilename = `${baseName}-bg-${Date.now()}.png`;
			backdropInfo = {
				filename: backdropFilename,
				url: `/slides/${backdropFilename}`,
				prompt: buildBackdropPrompt(backdropInput),
			};
		}

		sendStatus?.({ type: "status", message: "Building generation prompt..." });

		const systemPrompt = buildHtmlSlideSystemPrompt({
			backgroundMode,
			hasGlobalVideoBackground: hasSelectedVideoMedia,
			hasGlobalImageBackdrop: hasSelectedImageMedia,
			hasGeneratedBackdrop: !!backdropInfo,
			aspectRatio,
			fontFamily: body.fontFamily,
			themeConfig: tc,
			style: resolvedStyle,
			styleRecipeInstructions,
		});

		const bgLine = useGlobalVideoLayer
			? `Background mode: transparent. Use global video backdrop and keep slide wrapper transparent.`
			: useGlobalImageLayer
				? `Background mode: transparent. Use global image backdrop URL: ${selectedImageBackdropUrl}. Keep slide wrapper transparent.`
				: transparentMode
					? `Background mode: transparent. No global media selected; keep wrapper transparent so presenter/theme background shows through.`
					: backdropInfo
						? `Background mode: opaque. Required backdrop image URL: ${backdropInfo.url}. Build the slide as self-contained content on this backdrop.`
						: `Background mode: opaque. Use theme background color: ${bgColor}.`;
		const videoBackdropContext = hasSelectedVideoMedia
			? buildVideoBackdropContext(body.videoUrl)
			: "";
		const requiredHeadline = body.headline?.trim() || "";
		const requiredContentLines = (body.content || "")
			.split("\n")
			.map((line) => line.replace(/^\s*[-*•\d.]+\s*/, "").trim())
			.filter(Boolean);
		const requiredCopyContract = [
			"REQUIRED VERBATIM ON-SLIDE COPY CONTRACT:",
			requiredHeadline
				? `- Headline (must appear verbatim): "${requiredHeadline}"`
				: "",
			...requiredContentLines.map(
				(line, idx) =>
					`- Content line ${idx + 1} (must appear verbatim): "${line}"`,
			),
			"- Do not paraphrase, summarize, or rewrite required copy unless an explicit quoted replacement is provided in edit instructions.",
		]
			.filter(Boolean)
			.join("\n");

		const userPrompt = [
			"Generate an HTML slide for a presentation.",
			"Per-slide direction contract: if provided, it controls only this slide's unique composition/content emphasis. Global aesthetic is controlled by art style + style recipe + theme variables.",
			"",
			`Background mode (hard requirement): ${backgroundMode}`,
			`Target composition aspect ratio: ${aspectRatio}`,
			`Slide ${body.slideIndex}: ${body.headline || "Untitled"}`,
			`Type: ${body.type || "Content"}`,
			requiredCopyContract,
			body.headline ? `Headline: "${body.headline}"` : "",
			body.content ? `Content:\n${body.content}` : "",
			body.visualConcept
				? `Per-slide composition/content direction (not global style): ${body.visualConcept}`
				: "",
			body.deckTitle ? `Deck title: "${body.deckTitle}"` : "",
			body.audience ? `Audience: ${body.audience}` : "",
			body.fontFamily ? `Font family: ${body.fontFamily}` : "",
			`Accent color: ${accentColor}`,
			bgLine,
			hasSelectedImageMedia
				? transparentMode
					? `Selected global backdrop image (active): ${selectedImageBackdropUrl}`
					: `Selected global backdrop image (style context only): ${selectedImageBackdropUrl}`
				: "",
			hasSelectedVideoMedia && !transparentMode
				? "Global video media is provided for style context only. Do not rely on transparency; generate an opaque, self-contained slide backdrop."
				: "",
			backdropInfo
				? `REQUIRED backdrop filename token (must appear verbatim in output): ${backdropInfo.filename}`
				: "",
			backdropInfo
				? `Valid example: .slide-wrapper{background-image:url('/slides/${backdropInfo.filename}');}`
				: "",
			backdropInfo
				? `Generated backdrop prompt context:\n${backdropInfo.prompt}`
				: "",
			videoBackdropContext
				? `Video backdrop context:\n${videoBackdropContext}`
				: "",
			resolvedStyle
				? `\nArt style: "${resolvedStyle.name}" — ${resolvedStyle.promptHints}. This is the primary aesthetic. Make every visual decision reflect this style.`
				: "",
			styleRecipeInstructions
				? `\nRole style directives:\n${styleRecipeInstructions}`
				: "",
			annotationEdits,
		]
			.filter(Boolean)
			.join("\n");

		// Run backdrop image + HTML text generation in parallel when backdrop is needed
		sendStatus?.({
			type: "status",
			message: shouldGenerateBackdrop
				? "Generating backdrop + HTML in parallel..."
				: "Generating HTML with Gemini...",
		});

		console.error(
			`Generating HTML slide ${body.slideIndex}: ${body.filename}${resolvedStyle ? ` [style: ${resolvedStyle.name}]` : ""}${shouldGenerateBackdrop ? " (+ backdrop in parallel)" : ""}...`,
		);

		let result: { content: string; finishReason?: string };
		if (shouldGenerateBackdrop && backdropInfo) {
			const [backdropSettled, htmlSettled] = await Promise.allSettled([
				generateBackdropImage(backdropInput, backdropInfo.filename),
				callGemini(apiKey, userPrompt, {
					instructions: systemPrompt,
					temperature: 0.7,
				}),
			]);
			if (backdropSettled.status === "rejected") {
				const msg =
					backdropSettled.reason instanceof Error
						? backdropSettled.reason.message
						: String(backdropSettled.reason);
				return {
					type: "result",
					ok: false,
					error: `Backdrop generation failed: ${msg}`,
					httpStatus: 502,
				};
			}
			if (htmlSettled.status === "rejected") {
				throw htmlSettled.reason;
			}
			result = htmlSettled.value;
		} else {
			result = await callGemini(apiKey, userPrompt, {
				instructions: systemPrompt,
				temperature: 0.7,
			});
		}
		const finishReason = result.finishReason?.toUpperCase();
		if (
			finishReason &&
			finishReason !== "STOP" &&
			finishReason !== "FINISH_REASON_UNSPECIFIED"
		) {
			return {
				type: "result",
				ok: false,
				error: `Model finished early with reason ${result.finishReason} — retry generation`,
				rawOutput: result.content,
				finishReason: result.finishReason,
				httpStatus: 502,
			};
		}

		sendStatus?.({ type: "status", message: "Validating generated HTML..." });

		let html = result.content;
		html = html
			.replace(/^```html?\s*\n?/i, "")
			.replace(/\n?```\s*$/i, "")
			.trim();

		if (!html.includes("<") || !html.includes(">")) {
			return {
				type: "result",
				ok: false,
				error: "Generated content is not valid HTML",
				rawOutput: result.content,
				httpStatus: 500,
			};
		}

		// If it has a style block but no closing tag, it's truncated
		if (/<style[\s>]/i.test(html) && !/<\/style>/i.test(html)) {
			return {
				type: "result",
				ok: false,
				error:
					"Generated HTML is truncated (incomplete style block) — try again",
				rawOutput: result.content,
				httpStatus: 500,
			};
		}

		const trimmed = html.trim();
		if (!trimmed.endsWith(">") || /<[^>]*$/.test(trimmed)) {
			return {
				type: "result",
				ok: false,
				error:
					"Generated HTML appears truncated (dangling/incomplete tag) — try again",
				rawOutput: result.content,
				httpStatus: 500,
			};
		}
		if (/<svg[\s>]/i.test(trimmed) && !/<\/svg>/i.test(trimmed)) {
			return {
				type: "result",
				ok: false,
				error: "Generated HTML is truncated (incomplete SVG block) — try again",
				rawOutput: result.content,
				httpStatus: 500,
			};
		}

		// Strip document wrapper tags if the model ignored our instructions.
		// We asked for a fragment (<style> + content), but some models still
		// output a full document. Extract just the content we need.
		if (/<html[\s>]/i.test(html)) {
			// Check for truncation first
			if (!/<\/html>/i.test(html)) {
				return {
					type: "result",
					ok: false,
					error: "Generated HTML is truncated — try again with shorter content",
					rawOutput: result.content,
					httpStatus: 500,
				};
			}
			// Extract styles from anywhere in the document
			const styleBlocks: string[] = [];
			html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
				styleBlocks.push(css);
				return "";
			});
			// Extract body content
			const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
			const bodyContent = bodyMatch
				? bodyMatch[1].replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").trim()
				: "";
			// Reconstruct as fragment
			html =
				(styleBlocks.length > 0
					? `<style>\n${styleBlocks.join("\n")}\n</style>\n`
					: "") + bodyContent;
		}

		html = enforceSelectedFont(html, body.fontFamily);

		if (backdropInfo && !html.includes(backdropInfo.filename)) {
			return {
				type: "result",
				ok: false,
				error: `Generated HTML did not reference required backdrop image (${backdropInfo.filename}). The slide must include this exact backdrop filename token in its CSS/HTML.`,
				rawOutput: result.content,
				httpStatus: 422,
			};
		}

		// Fail-fast content integrity check: do not accept decorative-only output
		// when the brief includes required copy.
		const visibleText = extractVisibleText(html);
		const normalizedVisible = normalizeForCopyCheck(visibleText);
		const missing: string[] = [];

		if (requiredHeadline) {
			const normalizedHeadline = normalizeForCopyCheck(requiredHeadline);
			if (!normalizedVisible.includes(normalizedHeadline)) {
				missing.push(`headline "${requiredHeadline}"`);
			}
		}

		if (requiredContentLines.length > 0) {
			const hasAnyContentLine = requiredContentLines.some((line) =>
				normalizedVisible.includes(normalizeForCopyCheck(line)),
			);
			if (!hasAnyContentLine) {
				missing.push("at least one provided content line");
			}
		}

		if (missing.length > 0) {
			console.error(
				`[generate-html-slide] rejected content-incomplete output for slide ${body.slideIndex}`,
				{
					missing,
					visibleTextPreview: visibleText.slice(0, 240),
				},
			);
			return {
				type: "result",
				ok: false,
				error: `Generated HTML omitted required slide copy: ${missing.join(", ")}`,
				rawOutput: result.content,
				httpStatus: 422,
			};
		}

		// --- Review pass: let the model self-review and fix issues ---
		if (!body.skipReview) {
			sendStatus?.({ type: "status", message: "Running review pass..." });

			const reviewPrompt = `Review this HTML slide and fix any issues. Output ONLY the corrected HTML — no explanation, no markdown fences, no wrapping.

Slide brief:
- Headline: ${body.headline}
- Content: ${body.content || "(none)"}
- Type: ${body.type}
- Visual direction: ${body.visualConcept || "(none)"}
- Aspect ratio: ${aspectRatio}

Generated HTML to review:
${html}

Check and fix:
1. All provided copy (headline, content lines) must be visible and prominently placed — not hidden, clipped, or microscopic
2. Typography hierarchy: headline should be the largest text element
3. Layout should use the full slide area without content overflow or large dead zones
4. CSS must be syntactically complete (balanced braces, no broken selectors)
5. Colors must have sufficient contrast for readability
6. Background/foreground separation must be clear

If no fixes are needed, output the HTML exactly as provided.`;

			console.error(`  Review pass for slide ${body.slideIndex}...`);
			try {
				const reviewResult = await callGemini(apiKey, reviewPrompt, {
					instructions:
						"You are an expert HTML slide reviewer. Fix layout, typography, and visibility issues. Output only valid HTML — no markdown fences, no explanation.",
					temperature: 0.5,
				});

				let reviewedHtml = reviewResult.content
					.replace(/^```html?\s*\n?/i, "")
					.replace(/\n?```\s*$/i, "")
					.trim();

				// Basic sanity check — only use reviewed HTML if it's valid
				if (
					reviewedHtml.includes("<") &&
					reviewedHtml.includes(">") &&
					(!/<style[\s>]/i.test(reviewedHtml) ||
						/<\/style>/i.test(reviewedHtml))
				) {
					// Re-run content integrity check on reviewed HTML
					const reviewedVisible = extractVisibleText(reviewedHtml);
					const reviewedNormalized = normalizeForCopyCheck(reviewedVisible);
					const reviewMissing: string[] = [];

					if (requiredHeadline) {
						const nh = normalizeForCopyCheck(requiredHeadline);
						if (!reviewedNormalized.includes(nh))
							reviewMissing.push("headline");
					}
					if (requiredContentLines.length > 0) {
						const hasAny = requiredContentLines.some((line) =>
							reviewedNormalized.includes(normalizeForCopyCheck(line)),
						);
						if (!hasAny) reviewMissing.push("content");
					}

					if (reviewMissing.length === 0) {
						// Strip document wrapper if model added one during review
						if (
							/<html[\s>]/i.test(reviewedHtml) &&
							/<\/html>/i.test(reviewedHtml)
						) {
							const styleBlocks: string[] = [];
							reviewedHtml.replace(
								/<style[^>]*>([\s\S]*?)<\/style>/gi,
								(_, css: string) => {
									styleBlocks.push(css);
									return "";
								},
							);
							const bodyMatch = reviewedHtml.match(
								/<body[^>]*>([\s\S]*)<\/body>/i,
							);
							const bodyContent = bodyMatch
								? bodyMatch[1]
										.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
										.trim()
								: "";
							reviewedHtml =
								(styleBlocks.length > 0
									? `<style>\n${styleBlocks.join("\n")}\n</style>\n`
									: "") + bodyContent;
						}

						reviewedHtml = enforceSelectedFont(reviewedHtml, body.fontFamily);
						html = reviewedHtml;
						console.error(
							`  Review pass applied fixes for slide ${body.slideIndex}`,
						);
					} else {
						console.error(
							`  Review pass dropped — missing content: ${reviewMissing.join(", ")}`,
						);
					}
				} else {
					console.error(`  Review pass returned invalid HTML — using original`);
				}
			} catch (reviewError: unknown) {
				const msg =
					reviewError instanceof Error
						? reviewError.message
						: String(reviewError);
				console.error(`  Review pass failed (using original): ${msg}`);
			}
		} // end skipReview check

		sendStatus?.({ type: "status", message: "Saving slide..." });

		const filename = `${body.filename.replace(/\.\w+$/, "")}.html`;
		const outputPath = join(getSlidesDir(), filename);
		await writeFile(outputPath, html, "utf-8");
		console.error(`  Saved: ${filename}`);

		return {
			type: "result",
			ok: true,
			filename,
			html,
			backdropFilename: backdropInfo?.filename,
		};
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`  HTML slide generation failed: ${msg}`);
		return { type: "result", ok: false, error: msg, httpStatus: 500 };
	}
}

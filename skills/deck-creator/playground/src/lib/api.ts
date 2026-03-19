import type { StyleRecipeInfo } from "./style-recipes";
import type { DeckAspectRatio } from "./aspect-ratio";
import type {
	AnnotationsFile,
	SlideVariant,
	ThemeConfig,
	ThemeModes,
} from "./types";

function extractErrorMessage(data: unknown): string | null {
	if (!data || typeof data !== "object") return null;
	if (!("error" in data)) return null;
	const err = (data as { error?: unknown }).error;
	return typeof err === "string" && err.trim() ? err : null;
}

function normalizeSlideFilename(
	filename: string | undefined,
	slideIndex: number,
	ext: "png" | "html",
): string {
	const trimmed = (filename || "").trim();
	if (!trimmed) {
		return `${String(slideIndex).padStart(2, "0")}-slide.${ext}`;
	}
	if (trimmed.toLowerCase().endsWith(`.${ext}`)) return trimmed;
	return trimmed.replace(/\.\w+$/, `.${ext}`);
}

function toUniqueVariantFilename(filename: string, ext: "png" | "html"): string {
	const dotExt = `.${ext}`;
	const normalized = filename.toLowerCase().endsWith(dotExt)
		? filename
		: filename.replace(/\.\w+$/, dotExt);
	const stem = normalized.slice(0, -dotExt.length);
	const baseStem = stem.replace(/-v\d+$/, "");
	return `${baseStem}-v${Date.now()}${dotExt}`;
}

async function readJsonResponse<T>(res: Response, context: string): Promise<T> {
	let data: unknown;
	try {
		data = await res.json();
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		throw new Error(
			`${context} returned invalid JSON (HTTP ${res.status}): ${msg}`,
		);
	}
	if (!res.ok) {
		const msg = extractErrorMessage(data) || `HTTP ${res.status}`;
		throw new Error(`${context} failed: ${msg}`);
	}
	return data as T;
}

export async function fetchConfig(): Promise<{
	categories: Record<string, string[]>;
	styles: Array<{
		id: string;
		name: string;
		shortName?: string;
		promptHints: string;
		category: string;
		hasTile: boolean;
	}>;
	styleRecipes: StyleRecipeInfo[];
	defaultStyleRecipeId: string;
	deckDir: string;
	deckSelected: boolean;
	slidesDir: string;
	deckState: Record<string, unknown>;
	models?: { text: string; image: string; video: string };
}> {
	const res = await fetch("/api/config");
	return readJsonResponse(res, "fetchConfig");
}

export async function saveDeck(body: {
	deckDir: string;
	aspectRatio?: DeckAspectRatio;
	title: string;
	audience: string;
	purpose: string;
	context: string;
	keyMessage: string;
	brandNotes: string;
	tone: string;
	fontFamily: string;
	slideThemeMode?: "light" | "dark";
	themeConfig: ThemeConfig;
	themeModes?: ThemeModes;
	slideCount: number;
	styleId: string | null;
	styleRecipeId: string | null;
	styleRecipes: StyleRecipeInfo[];
	stylePrompt: string;
	backgroundMedia: string;
	slides: Array<{
		index: number;
		title: string;
		headline: string;
		content: string;
		visualConcept: string;
		backgroundMode?: "transparent" | "opaque" | "solid" | "gradient";
		type: string;
		filename: string;
		renderMode: string;
	}>;
	annotations: Record<number, string>;
}): Promise<{ ok: boolean; error?: string }> {
	const res = await fetch("/api/deck", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJsonResponse(res, "saveDeck");
}

export async function generateImageSlide(body: {
	slideIndex: number;
	prompt: string;
	aspectRatio?: DeckAspectRatio;
	styleId?: string;
	styleRecipeId?: string | null;
	styleRecipes?: StyleRecipeInfo[];
	stylePrompt?: string;
	filename?: string;
}): Promise<{
	ok: boolean;
	filename?: string;
	error?: string;
	rawOutput?: string;
}> {
	const baseFilename = normalizeSlideFilename(
		body.filename,
		body.slideIndex,
		"png",
	);
	const payload = {
		...body,
		// Image variants must be unique files so regenerations don't overwrite
		// prior variants and collapse history.
		filename: toUniqueVariantFilename(baseFilename, "png"),
	};
	const res = await fetch("/api/generate-slide", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	let data: unknown;
	try {
		data = await res.json();
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		throw new Error(
			`generateImageSlide returned invalid JSON (HTTP ${res.status}): ${msg}`,
		);
	}
	return data as {
		ok: boolean;
		filename?: string;
		error?: string;
		rawOutput?: string;
	};
}

export async function generateHtmlSlide(
	body: {
		slideIndex: number;
		headline: string;
		content: string;
		type: string;
		aspectRatio?: DeckAspectRatio;
		visualConcept?: string;
		backgroundMode?: "transparent" | "opaque" | "solid" | "gradient";
		styleId?: string;
		styleRecipeId?: string | null;
		styleRecipes?: StyleRecipeInfo[];
		stylePrompt?: string;
		deckTitle?: string;
		audience?: string;
		filename?: string;
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
		themeConfig?: ThemeConfig;
		skipReview?: boolean;
	},
	onStatus?: (message: string) => void,
): Promise<{
	ok: boolean;
	filename?: string;
	html?: string;
	error?: string;
	rawOutput?: string;
}> {
	const payload = {
		...body,
		filename: normalizeSlideFilename(body.filename, body.slideIndex, "html"),
	};
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (onStatus) {
		headers.Accept = "text/x-ndjson";
	}
	const res = await fetch("/api/generate-html-slide", {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
	});

	// Stream mode — read NDJSON lines, forward status updates, return final result
	if (onStatus && res.body && res.headers.get("content-type")?.includes("text/x-ndjson")) {
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let result: Record<string, unknown> = {};

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const parsed = JSON.parse(line);
					if (parsed.type === "status" && parsed.message) {
						onStatus(parsed.message);
					} else if (parsed.type === "result") {
						result = parsed;
					}
				} catch {
					// skip malformed lines
				}
			}
		}
		// Process remaining buffer
		if (buffer.trim()) {
			try {
				const parsed = JSON.parse(buffer);
				if (parsed.type === "result") result = parsed;
			} catch {
				// skip
			}
		}

		return result as {
			ok: boolean;
			filename?: string;
			html?: string;
			error?: string;
			rawOutput?: string;
		};
	}

	// Non-streaming fallback
	let data: unknown;
	try {
		data = await res.json();
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		throw new Error(
			`generateHtmlSlide returned invalid JSON (HTTP ${res.status}): ${msg}`,
		);
	}
	return data as {
		ok: boolean;
		filename?: string;
		html?: string;
		error?: string;
		rawOutput?: string;
	};
}

export async function generateVideo(body: {
	prompt: string;
	aspectRatio?: DeckAspectRatio;
	styleId?: string;
	styleRecipeId?: string | null;
	styleRecipes?: StyleRecipeInfo[];
	stylePrompt?: string;
	themeConfig?: ThemeConfig;
	duration?: string;
	inputImagePath?: string;
}): Promise<{
	ok: boolean;
	jobId?: string;
	filename?: string;
	error?: string;
}> {
	const res = await fetch("/api/generate-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJsonResponse(res, "generateVideo");
}

export interface PersistedSlideVariants {
	variants: SlideVariant[];
	activeVariant: number;
	filename?: string;
}

export async function fetchVariants(): Promise<
	Record<string, PersistedSlideVariants | SlideVariant[]>
> {
	const res = await fetch("/api/variants");
	const data = await readJsonResponse<{
		variants?: Record<string, PersistedSlideVariants | SlideVariant[]>;
	}>(res, "fetchVariants");
	return data.variants || {};
}

export async function saveVariants(body: {
	deckDir?: string;
	variants: Record<string, PersistedSlideVariants>;
}): Promise<{ ok: boolean; error?: string }> {
	const res = await fetch("/api/variants", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJsonResponse(res, "saveVariants");
}

export async function getVideoStatus(jobId: string): Promise<{
	status: "generating" | "done" | "error";
	filename?: string;
	videoPath?: string;
	error?: string;
}> {
	const res = await fetch(`/api/video-status/${jobId}`);
	return readJsonResponse(res, "getVideoStatus");
}

export async function saveAnnotations(
	data: AnnotationsFile,
): Promise<{ ok: boolean }> {
	const res = await fetch("/api/annotations", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
	return readJsonResponse(res, "saveAnnotations");
}

export async function fetchAnnotationSessions(): Promise<
	Record<string, string>
> {
	const res = await fetch("/api/annotation-sessions");
	const data = await readJsonResponse<{
		sessions?: Record<string, string>;
	}>(res, "fetchAnnotationSessions");
	return data.sessions || {};
}

export async function saveAnnotationSessions(body: {
	sessions: Record<string, string>;
}): Promise<{ ok: boolean; error?: string }> {
	const res = await fetch("/api/annotation-sessions", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJsonResponse(res, "saveAnnotationSessions");
}

export async function applyAnnotationEdit(body: {
	slideIndex: number;
	annotationId: string;
	maskBase64?: string;
	prompt: string;
	renderMode?: string;
}): Promise<{ ok: boolean; mode?: string; error?: string }> {
	const res = await fetch("/api/annotations/apply", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJsonResponse(res, "applyAnnotationEdit");
}

export async function applyHtmlAnnotationEdit(body: {
	html: string;
	annotations: Array<{
		note: string;
		x: number;
		y: number;
		element?: { type: string; currentText?: string };
		intent?: "fix" | "change" | "question" | "approve";
		severity?: "blocking" | "important" | "suggestion";
	}>;
	themeConfig?: Record<string, string>;
	slideIndex: number;
}): Promise<{ ok: boolean; html?: string; error?: string }> {
	const res = await fetch("/api/annotations/apply-html", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJsonResponse(res, "applyHtmlAnnotationEdit");
}

export async function buildPdf(): Promise<{
	ok: boolean;
	path?: string;
	error?: string;
}> {
	const res = await fetch("/api/build-pdf", { method: "POST" });
	return readJsonResponse(res, "buildPdf");
}

export async function buildPresenter(
	backgroundMedia?: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
	const res = await fetch("/api/build-presenter", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ backgroundMedia }),
	});
	return readJsonResponse(res, "buildPresenter");
}

export async function uploadBackground(file: File): Promise<{
	ok: boolean;
	mediaType?: "video" | "image";
	filename?: string;
	error?: string;
}> {
	const formData = new FormData();
	formData.append("file", file);
	const res = await fetch("/api/upload-background", {
		method: "POST",
		body: formData,
	});
	return readJsonResponse(res, "uploadBackground");
}

export async function getGitUrl(): Promise<{ url: string | null }> {
	const res = await fetch("/api/git-url");
	return readJsonResponse(res, "getGitUrl");
}

export async function fetchPublishContext(): Promise<{
	ok: boolean;
	deckDir: string;
	title: string;
	suggestedProjectName: string;
	slidesSubdir: "slides" | "pages";
	summary: {
		hasDeckPlan: boolean;
		hasDeckIndex: boolean;
		hasTheme: boolean;
		hasPresenter: boolean;
		hasPdf: boolean;
		slideFileCount: number;
		htmlSlideCount: number;
		imageSlideCount: number;
	};
	git: {
		repoRoot: string | null;
		originUrl: string | null;
		isDeckRepoRoot: boolean;
		isGitRepo: boolean;
	};
	vercel: {
		hasVercelJson: boolean;
		isLinked: boolean;
		project: {
			projectId?: string;
			orgId?: string;
			projectName?: string;
		} | null;
		scopes: Array<{ id: string; name: string; current: boolean }>;
		scopesError: string | null;
	};
	error?: string;
}> {
	const res = await fetch("/api/publish-context");
	return readJsonResponse(res, "fetchPublishContext");
}

export async function startPublish(body: {
	method: "vercel" | "react-onchain";
	deckDir: string;
	scope?: string;
	projectName?: string;
	repoMode?: "keep-nested" | "init-deck-repo";
	projectStrategy?:
		| "create-new-project"
		| "link-existing-project"
		| "reuse-current-link";
	deployTarget?: "production" | "preview";
	ensureVercelJson?: boolean;
	appName?: string;
	versionTag?: string;
	versionDescription?: string;
	paymentKey?: string;
	satsPerKb?: number;
	dryRun?: boolean;
	ordinalContentUrl?: string;
	ordinalIndexerUrl?: string;
	promptText?: string;
}): Promise<{
	ok: boolean;
	job?: {
		id: string;
		status: "running" | "done" | "error" | "cancelled";
		startedAt: number;
		endedAt?: number;
		intent: Record<string, unknown>;
		steps: Array<{
			id: string;
			label: string;
			status: "pending" | "running" | "done" | "error" | "cancelled";
			startedAt?: number;
			endedAt?: number;
			command?: string;
			output?: string;
			error?: string;
		}>;
		logs: string[];
		result?: {
			deploymentUrl?: string;
			deploymentId?: string;
			linkedProjectName?: string;
			scope?: string;
			protocol?: "vercel" | "react-onchain";
			createdFiles?: string[];
		};
		error?: string;
	};
	error?: string;
}> {
	const res = await fetch("/api/publish/start", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJsonResponse(res, "startPublish");
}

export async function getPublishStatus(jobId: string): Promise<{
	ok: boolean;
	job?: {
		id: string;
		status: "running" | "done" | "error" | "cancelled";
		startedAt: number;
		endedAt?: number;
		intent: Record<string, unknown>;
		steps: Array<{
			id: string;
			label: string;
			status: "pending" | "running" | "done" | "error" | "cancelled";
			startedAt?: number;
			endedAt?: number;
			command?: string;
			output?: string;
			error?: string;
		}>;
		logs: string[];
		result?: {
			deploymentUrl?: string;
			deploymentId?: string;
			linkedProjectName?: string;
			scope?: string;
			protocol?: "vercel" | "react-onchain";
			createdFiles?: string[];
		};
		error?: string;
	};
	error?: string;
}> {
	const res = await fetch(`/api/publish/status/${encodeURIComponent(jobId)}`);
	return readJsonResponse(res, "getPublishStatus");
}

export async function cancelPublish(jobId: string): Promise<{
	ok: boolean;
	job?: {
		id: string;
		status: "running" | "done" | "error" | "cancelled";
		startedAt: number;
		endedAt?: number;
		intent: Record<string, unknown>;
		steps: Array<{
			id: string;
			label: string;
			status: "pending" | "running" | "done" | "error" | "cancelled";
			startedAt?: number;
			endedAt?: number;
			command?: string;
			output?: string;
			error?: string;
		}>;
		logs: string[];
		result?: {
			deploymentUrl?: string;
			deploymentId?: string;
			linkedProjectName?: string;
			scope?: string;
			createdFiles?: string[];
		};
		error?: string;
	};
	error?: string;
}> {
	const res = await fetch(`/api/publish/cancel/${encodeURIComponent(jobId)}`, {
		method: "POST",
	});
	return readJsonResponse(res, "cancelPublish");
}

export async function getSiblingDecks(): Promise<{
	current: string;
	parent: string;
	siblings: Array<{ name: string; path: string; hasPlan: boolean }>;
	recent: Array<{ name: string; path: string; hasPlan: boolean }>;
}> {
	const res = await fetch("/api/switch-deck");
	return readJsonResponse(res, "getSiblingDecks");
}

export async function pickDeckDirectory(): Promise<{
	ok: boolean;
	path?: string;
	cancelled?: boolean;
	error?: string;
}> {
	const res = await fetch("/api/pick-deck-dir", { method: "POST" });
	return readJsonResponse(res, "pickDeckDirectory");
}

export async function bootstrapDeck(body: {
	title: string;
	audience?: string;
	purpose?: string;
	context?: string;
	keyMessage?: string;
	tone?: string;
	slideCount: number;
}): Promise<{
	ok: boolean;
	slideCount: number;
	slides: Array<{
		index: number;
		title: string;
		type: string;
		headline: string;
		content: string;
		visualConcept: string;
		backgroundMode?: "transparent" | "opaque" | "solid" | "gradient";
		renderMode: "image" | "html";
		filename: string;
	}>;
	error?: string;
	rawOutput?: string;
	finishReason?: string;
}> {
	const res = await fetch("/api/bootstrap-deck", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return readJsonResponse(res, "bootstrapDeck");
}

export async function switchDeck(
	path: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
	const res = await fetch("/api/switch-deck", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path }),
	});
	return readJsonResponse(res, "switchDeck");
}

export async function checkSlideExists(filename: string): Promise<boolean> {
	try {
		const res = await fetch(`/slides/${filename}`, { method: "HEAD" });
		return res.ok;
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`checkSlideExists failed for "${filename}": ${msg}`);
		return false;
	}
}

export async function fetchSlideHtml(filename: string): Promise<string | null> {
	try {
		const res = await fetch(`/slides/${filename}`);
		return res.ok ? res.text() : null;
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`fetchSlideHtml failed for "${filename}": ${msg}`);
		return null;
	}
}

export async function buildBackdropPrompt(body: {
	aspectRatio?: string;
	styleId?: string;
	styleRecipeId?: string | null;
	styleRecipes?: { id: string; name: string; description: string; instructions?: string }[];
	stylePrompt?: string;
	themeConfig?: Record<string, string>;
	visualConcept?: string;
}): Promise<{ ok: boolean; prompt?: string; error?: string }> {
	const res = await fetch("/api/build-backdrop-prompt", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return res.json();
}

export async function regenerateBackdrop(body: {
	prompt: string;
	aspectRatio?: string;
	styleId?: string;
	styleRecipeId?: string | null;
	styleRecipes?: { id: string; name: string; description: string; instructions?: string }[];
	stylePrompt?: string;
}): Promise<{ ok: boolean; filename?: string; error?: string }> {
	const res = await fetch("/api/generate-image-asset", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...body, saveToSlides: true }),
	});
	return res.json();
}

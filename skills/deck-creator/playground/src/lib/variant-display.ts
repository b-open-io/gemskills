import type { SlideState, SlideVariant } from "./types";

export type VariantRenderMode = "image" | "html";

export type DisplayVariant = {
	originalIndex: number;
	variant: SlideVariant;
	renderMode: VariantRenderMode;
	payloadKey: string;
	isActive: boolean;
	isBlank: boolean;
};

function hasHtmlPayload(variant: SlideVariant): boolean {
	return !!variant.htmlContent?.trim();
}

function hasFilePayload(variant: SlideVariant): boolean {
	return !!variant.filename?.trim();
}

export function isVariantRenderable(variant: SlideVariant): boolean {
	return hasHtmlPayload(variant) || hasFilePayload(variant);
}

export function inferVariantRenderMode(
	variant: SlideVariant,
	fallback: VariantRenderMode = "image",
): VariantRenderMode {
	// Filename is the definitive signal — a .png variant with htmlContent
	// (the template used to generate it) should render as image, not html.
	const filename = variant.filename?.trim().toLowerCase();
	if (filename) {
		return filename.endsWith(".html") ? "html" : "image";
	}
	if (hasHtmlPayload(variant)) return "html";
	return fallback;
}

export function getVariantPayloadKey(variant: SlideVariant): string {
	// Prefer filename-based keys when a file exists — this prevents
	// image variants from being collapsed with HTML variants that share
	// the same htmlContent template.
	const filename = variant.filename?.trim().toLowerCase();
	if (filename) return `file:${filename}`;
	const html = variant.htmlContent?.replace(/\s+/g, " ").trim();
	if (html) return `html:${html}`;
	return `id:${variant.id}`;
}

/**
 * Returns variants that should be shown in UI:
 * - hide non-renderable entries (except the active variant — always shown)
 * - collapse duplicate payloads (keep newest/first)
 * - preserve active selection by mapping hidden duplicates to representative
 */
export function deriveDisplayVariants(slide: SlideState): DisplayVariant[] {
	const variants = slide.variants || [];
	if (variants.length === 0) return [];

	const activeVariant = variants[slide.activeVariant];
	const activeKey = activeVariant ? getVariantPayloadKey(activeVariant) : null;

	const out: DisplayVariant[] = [];
	const payloadIndex = new Map<string, number>();

	for (let i = 0; i < variants.length; i++) {
		const variant = variants[i];
		const isActive = i === slide.activeVariant;
		const renderable = isVariantRenderable(variant);
		// Always include the active variant so users can see blank placeholders
		if (!renderable && !isActive) continue;
		const payloadKey = getVariantPayloadKey(variant);
		if (payloadIndex.has(payloadKey) && !isActive) continue;
		if (!payloadIndex.has(payloadKey)) {
			payloadIndex.set(payloadKey, out.length);
		}
		out.push({
			originalIndex: i,
			variant,
			renderMode: inferVariantRenderMode(variant, slide.renderMode),
			payloadKey,
			isActive: false,
			isBlank: !renderable,
		});
	}

	if (out.length === 0) return out;

	let activeDisplayIndex = -1;
	if (activeKey && payloadIndex.has(activeKey)) {
		activeDisplayIndex = payloadIndex.get(activeKey) ?? -1;
	}
	if (activeDisplayIndex < 0) {
		const exact = out.findIndex((entry) => entry.originalIndex === slide.activeVariant);
		activeDisplayIndex = exact >= 0 ? exact : 0;
	}

	return out.map((entry, index) => ({
		...entry,
		isActive: index === activeDisplayIndex,
	}));
}

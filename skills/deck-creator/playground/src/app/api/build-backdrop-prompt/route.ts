import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getStylesRegistry, TILES_DIR } from "@/lib/server/deck";
import {
	composeStyleInstructionsForRole,
	isKnownStyleRecipeId,
	type StyleRecipeInfo,
} from "@/lib/style-recipes";
import { isDeckAspectRatio } from "@/lib/aspect-ratio";

interface ResolvedStyle {
	name: string;
	promptHints: string;
	hasTile: boolean;
}

function buildBackdropPrompt(opts: {
	aspectRatio: string;
	themeConfig: Record<string, string>;
	style: ResolvedStyle | null;
	styleAssetInstructions: string;
	visualConcept?: string;
}): string {
	const tc = opts.themeConfig;
	const themeLines = [
		"Theme palette constraints:",
		`- Background/base tone: ${tc.background || "#0a0e1a"}`,
		`- Primary/accent hue: ${tc.primary || "#00d4aa"}`,
		`- Foreground contrast target: ${tc.foreground || "#e2e8f0"}`,
		`- Surface color family: ${tc.card || "#1a1f2e"}`,
		`- Muted detail tone: ${tc["muted-foreground"] || "#94a3b8"}`,
	];

	const styleLines = opts.style
		? [
				`Art style reference: ${opts.style.name}`,
				`Style guidance: ${opts.style.promptHints}`,
				"IMPORTANT: The attached reference image is a STYLE SAMPLE ONLY. Copy its visual aesthetic (color treatment, texture, rendering technique, mood, and composition style) but DO NOT reproduce its subject matter. Generate original content appropriate for a presentation backdrop using the style's aesthetic language.",
			]
		: [
				"No explicit art style selected: keep a premium cinematic presentation backdrop treatment.",
			];

	return [
		`Create a ${opts.aspectRatio} background image plate for a presentation slide.`,
		"No text, no numbers, no logos, no UI controls, no labels, no watermarks.",
		"No legible glyphs or pseudo-text forms: avoid letters, monograms, wordmarks, typographic shapes, and character-like symbols.",
		"Keep the composition suitable for overlay content (clear hierarchy and readable central regions).",
		...themeLines,
		...styleLines,
		opts.styleAssetInstructions
			? `Role style directives:\n${opts.styleAssetInstructions}`
			: "",
		opts.visualConcept
			? `Per-slide composition direction: ${opts.visualConcept}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

export async function POST(req: Request) {
	try {
		const body = (await req.json()) as {
			aspectRatio?: string;
			styleId?: string;
			styleRecipeId?: string | null;
			styleRecipes?: StyleRecipeInfo[];
			stylePrompt?: string;
			themeConfig?: Record<string, string>;
			visualConcept?: string;
		};

		const aspectRatio = isDeckAspectRatio(body.aspectRatio || "")
			? body.aspectRatio!
			: "16:9";

		const registry = getStylesRegistry();
		const style = body.styleId
			? registry.styles.find(
					(s) => s.id === body.styleId || s.shortName === body.styleId,
				)
			: null;

		const resolvedStyle: ResolvedStyle | null = style
			? {
					name: style.name,
					promptHints: style.promptHints || "",
					hasTile: existsSync(join(TILES_DIR, `${style.id}.png`)),
				}
			: null;

		const styleRecipeId =
			typeof body.styleRecipeId === "string"
				? body.styleRecipeId.trim() || null
				: null;

		const styleAssetInstructions = composeStyleInstructionsForRole({
			role: "image-asset",
			styleRecipeId,
			styleRecipes: body.styleRecipes,
			customPrompt: body.stylePrompt,
		});

		const prompt = buildBackdropPrompt({
			aspectRatio,
			themeConfig: body.themeConfig || {},
			style: resolvedStyle,
			styleAssetInstructions: styleAssetInstructions || "",
			visualConcept: body.visualConcept,
		});

		return NextResponse.json({ ok: true, prompt });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

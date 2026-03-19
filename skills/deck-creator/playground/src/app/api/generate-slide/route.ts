import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getSlidesDir, getStylesRegistry, TILES_DIR } from "@/lib/server/deck";
import {
	callGeminiImage,
	getApiKey,
	loadImage,
	saveImage,
} from "@/lib/server/gemini";
import {
	composeStyleInstructionsForRole,
	isKnownStyleRecipeId,
	type StyleRecipeInfo,
	styleInstructionsDisallowShadows,
} from "@/lib/style-recipes";
import { isDeckAspectRatio } from "@/lib/aspect-ratio";

function buildImageSlideSystemInstruction(opts: {
	styleName?: string;
	styleRecipeInstructions?: string;
	aspectRatio: string;
}): string {
	const noShadows = styleInstructionsDisallowShadows(
		opts.styleRecipeInstructions,
	);

	return [
		`You are a keynote slide image generator. Produce one polished ${opts.aspectRatio} presentation slide image.`,
		"",
		"Hard rules:",
		"- Theme palette constraints in the slide brief are authoritative for all color choices.",
		"- Treat annotation/edit directives as implementation intent, never as literal on-slide copy.",
		"- Never render instruction text, debug placeholders, UI chrome labels, or operator notes.",
		'- Respect the "Allowed on-slide text" section in the prompt as a text whitelist.',
		"- Only include additional text when explicitly requested as quoted replacement copy.",
		"- Keep typography deliberate and premium; avoid generic default-looking type treatment.",
		"- Maintain strong visual hierarchy and projection readability.",
		noShadows
			? "- Do not use shadows anywhere (no box-shadow, text-shadow, glow, or drop-shadow effects)."
			: "- Use depth cues through composition and contrast; avoid heavy decorative effects.",
		opts.styleName
			? `- Apply the selected art style (${opts.styleName}) to composition, form, texture, and typography treatment; do not override theme colors.`
			: "- Keep a cohesive visual style across layout, color usage, and typography.",
	].join("\n");
}

export async function POST(req: Request) {
	try {
		const body = (await req.json()) as {
			slideIndex: number;
			prompt: string;
			aspectRatio?: string;
			styleId?: string;
			styleRecipeId?: string | null;
			styleRecipes?: StyleRecipeInfo[];
			stylePrompt?: string;
			filename: string;
		};
		const styleRecipeId =
			typeof body.styleRecipeId === "string"
				? body.styleRecipeId.trim() || null
				: body.styleRecipeId;

		if (!Number.isFinite(body.slideIndex) || body.slideIndex <= 0) {
			return NextResponse.json(
				{ ok: false, error: "slideIndex must be a positive number" },
				{ status: 400 },
			);
		}
		if (!body.prompt?.trim()) {
			return NextResponse.json(
				{ ok: false, error: "prompt is required" },
				{ status: 400 },
			);
		}
		if (!body.filename?.trim()) {
			return NextResponse.json(
				{ ok: false, error: "filename is required" },
				{ status: 400 },
			);
		}
		const rawAspectRatio = String(body.aspectRatio || "").trim();
		if (rawAspectRatio && !isDeckAspectRatio(rawAspectRatio)) {
			return NextResponse.json(
				{ ok: false, error: `Unsupported aspectRatio "${rawAspectRatio}"` },
				{ status: 400 },
			);
		}
		const aspectRatio = isDeckAspectRatio(rawAspectRatio)
			? rawAspectRatio
			: "16:9";
		if (
			typeof styleRecipeId === "string" &&
			!isKnownStyleRecipeId(styleRecipeId, body.styleRecipes)
		) {
			return NextResponse.json(
				{
					ok: false,
					error: `Unknown styleRecipeId "${styleRecipeId}"`,
				},
				{ status: 400 },
			);
		}

		const prompt = body.prompt.trim();
		const apiKey = getApiKey();
		const registry = getStylesRegistry();
		let finalPrompt = prompt;
		let styleName: string | undefined;
		const options: Record<string, unknown> = {
			aspectRatio,
			imageSize: "2K",
		};

		if (body.styleId) {
			const style = registry.styles.find(
				(s) => s.id === body.styleId || s.shortName === body.styleId,
			);
			if (!style) {
				return NextResponse.json(
					{ ok: false, error: `Unknown styleId "${body.styleId}"` },
					{ status: 400 },
				);
			}
			styleName = style.name;
			finalPrompt = `Art style target: ${style.name}\nUse art style for structure, composition, texture, and type treatment. Color choices must follow the theme palette constraints in this brief.\nStyle guidance: ${style.promptHints}\n\n${finalPrompt}`;
			const tilePath = join(TILES_DIR, `${style.id}.png`);
			const tileImage = existsSync(tilePath) ? await loadImage(tilePath) : null;
			if (tileImage) {
				options.inputImages = [tileImage];
				finalPrompt = `CRITICAL: The attached reference image is a STYLE SAMPLE ONLY. Copy its visual aesthetic (rendering technique, texture, composition style, mood, line work) but DO NOT reproduce its subject matter, objects, or specific content. Generate original slide content using the style's aesthetic language.\n\n${finalPrompt}`;
			}
		}

		const styleInstructions = composeStyleInstructionsForRole({
			role: "image-slide",
			styleRecipeId,
			styleRecipes: body.styleRecipes,
			customPrompt: body.stylePrompt,
		});
		if (styleInstructions) {
			finalPrompt = `Role style directives:\n${styleInstructions}\n\nSlide brief:\n${finalPrompt}`;
		}
		const systemInstruction = buildImageSlideSystemInstruction({
			styleName,
			styleRecipeInstructions: styleInstructions || undefined,
			aspectRatio,
		});
		options.instructions = systemInstruction;

		console.error(`Generating slide ${body.slideIndex}: ${body.filename}...`);
		const result = await callGeminiImage(
			apiKey,
			finalPrompt,
			options as Parameters<typeof callGeminiImage>[2],
		);

		if (result.images.length > 0) {
			const img = result.images[0];
			const outputPath = join(getSlidesDir(), body.filename);
			await saveImage(img.data, img.mimeType, outputPath);
			console.error(`  Saved: ${body.filename}`);
			return NextResponse.json({ ok: true, filename: body.filename });
		}

		return NextResponse.json(
			{
				ok: false,
				error: "No image returned from Gemini",
				rawOutput: result.text,
			},
			{ status: 500 },
		);
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`  Slide generation failed: ${msg}`);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

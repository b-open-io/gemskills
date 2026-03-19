import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isDeckAspectRatio } from "@/lib/aspect-ratio";
import {
	getDeckDir,
	getSlidesSubdir,
	parseAnnotationsFile,
	serializeAnnotationsFile,
	writeGlobalStyleRecipes,
} from "@/lib/server/deck";
import {
	isBuiltInStyleRecipeId,
	type StyleRecipeInfo,
} from "@/lib/style-recipes";

export async function POST(req: Request) {
	try {
		const body = (await req.json()) as {
			deckDir?: string;
			aspectRatio?: string;
			title?: string;
			audience?: string;
			slideCount?: number;
			purpose?: string;
			context?: string;
			keyMessage?: string;
			brandNotes?: string;
			tone?: string;
			fontFamily?: string;
			slideThemeMode?: "light" | "dark";
			themeConfig?: Record<string, string>;
			themeModes?: {
				light?: Record<string, string>;
				dark?: Record<string, string>;
			};
			styleId?: string;
			styleRecipeId?: string | null;
			styleRecipes?: StyleRecipeInfo[];
			stylePrompt?: string;
			backgroundMedia?: string;
			videoBackground?: string;
			videoLoop?: boolean;
			slides?: Array<{
				index: number;
				title: string;
				headline: string;
				content: string;
				visualConcept: string;
				backgroundMode?: "transparent" | "opaque" | "solid" | "gradient";
				type: string;
				filename?: string;
				renderMode?: "image" | "html";
			}>;
			annotations?: Record<number, string>;
		};

		const deckDir = getDeckDir();
		const slidesSubdir = getSlidesSubdir();

		// Reject stale saves: if the client thinks it's saving to a different deck
		// than the server's current deck, refuse the write. This prevents the autosave
		// race condition where a deck switch happens server-side but the old page's
		// timer fires and overwrites the new deck's files with old data.
		if (body.deckDir && body.deckDir !== deckDir) {
			return NextResponse.json(
				{
					ok: false,
					error: "Deck directory mismatch — save rejected (stale client)",
				},
				{ status: 409 },
			);
		}

		const activeMode = body.slideThemeMode || "dark";
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
		const fallbackLight = activeMode === "light" ? body.themeConfig || {} : {};
		const fallbackDark = activeMode === "dark" ? body.themeConfig || {} : {};
		const lightTheme = body.themeModes?.light || fallbackLight;
		const darkTheme = body.themeModes?.dark || fallbackDark;
		const tc = activeMode === "light" ? lightTheme : darkTheme;
		const themeLines = ["# Theme", "", "## Colors (Active)"];
		// Write all color vars from themeConfig
		const colorKeys = [
			"background",
			"foreground",
			"card",
			"card-foreground",
			"popover",
			"popover-foreground",
			"primary",
			"primary-foreground",
			"secondary",
			"secondary-foreground",
			"muted",
			"muted-foreground",
			"accent",
			"accent-foreground",
			"destructive",
			"destructive-foreground",
			"border",
			"input",
			"ring",
			"chart-1",
			"chart-2",
			"chart-3",
			"chart-4",
			"chart-5",
		];
		for (const key of colorKeys) {
			if (tc[key]) themeLines.push(`- ${key}: ${tc[key]}`);
		}
		themeLines.push("");
		themeLines.push("## Typography (Active)");
		themeLines.push(`- Font: ${body.fontFamily || "system"}`);
		if (body.fontFamily) themeLines.push(`- font-sans: ${body.fontFamily}`);
		if (tc["letter-spacing"])
			themeLines.push(`- letter-spacing: ${tc["letter-spacing"]}`);
		themeLines.push("");
		themeLines.push("## Style (Active)");
		if (tc.radius) themeLines.push(`- radius: ${tc.radius}`);
		if (tc.spacing) themeLines.push(`- spacing: ${tc.spacing}`);
		// Shadow vars
		for (const key of [
			"shadow-color",
			"shadow-opacity",
			"shadow-blur",
			"shadow-spread",
			"shadow-offset-x",
			"shadow-offset-y",
		]) {
			if (tc[key]) themeLines.push(`- ${key}: ${tc[key]}`);
		}
		themeLines.push("");
		themeLines.push("## Settings");
		themeLines.push(`- Slide Mode: ${body.slideThemeMode || "dark"}`);
		themeLines.push(`- Art Style: ${body.styleId || "none"}`);
		themeLines.push(`- Style Recipe: ${body.styleRecipeId || "none"}`);
		if (body.stylePrompt?.trim()) {
			themeLines.push("- Style Prompt: |");
			for (const line of body.stylePrompt.trim().split("\n")) {
				themeLines.push(`  ${line}`);
			}
		}
		themeLines.push(`- Aspect Ratio: ${aspectRatio}`);
		const backgroundMedia = body.backgroundMedia ?? body.videoBackground;
		if (backgroundMedia) {
			themeLines.push(`- Background Media: ${backgroundMedia}`);
		}
		if (body.videoLoop !== undefined) {
			themeLines.push(`- Video Loop: ${body.videoLoop}`);
		}
		const allThemeKeys = [
			...colorKeys,
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
		];
		const writeModeSection = (
			label: "Light" | "Dark",
			cfg: Record<string, string>,
		) => {
			themeLines.push("");
			themeLines.push(`## Theme Variables (${label})`);
			for (const key of allThemeKeys) {
				if (cfg[key]) themeLines.push(`- ${key}: ${cfg[key]}`);
			}
		};
		writeModeSection("Light", lightTheme);
		writeModeSection("Dark", darkTheme);
		themeLines.push("");
		await writeFile(join(deckDir, "THEME.md"), themeLines.join("\n"), "utf-8");

		if (body.styleRecipes !== undefined) {
			const customStyleRecipes = (
				Array.isArray(body.styleRecipes) ? body.styleRecipes : []
			)
				.filter(
					(recipe) =>
						recipe &&
						typeof recipe.id === "string" &&
						typeof recipe.name === "string" &&
						typeof recipe.description === "string",
				)
				.map((recipe) => ({
					id: recipe.id.trim(),
					name: recipe.name.trim(),
					description: recipe.description.trim(),
					instructions: recipe.instructions?.trim() || undefined,
				}))
				.filter(
					(recipe) =>
						recipe.id &&
						recipe.name &&
						recipe.description &&
						!isBuiltInStyleRecipeId(recipe.id),
				);

			writeGlobalStyleRecipes(customStyleRecipes);

			// Legacy cleanup: custom style recipes now live in global store.
			const legacyPath = join(deckDir, "STYLE_RECIPES.json");
			if (existsSync(legacyPath)) unlinkSync(legacyPath);
		}

		if (body.slides && body.slides.length > 0) {
			// Preserve slides from the existing plan that aren't in the autosave payload.
			// This prevents the autosave from clobbering slides added to the plan file
			// externally (e.g., by an agent or manual edit) that haven't loaded into state yet.
			const planPath = join(deckDir, "DECK-PLAN.md");
			let preservedSlides: Array<{ index: number; raw: string }> = [];
			if (existsSync(planPath)) {
				const existingPlan = readFileSync(planPath, "utf-8");
				const slideBlockRegex = /### Slide (\d+):[\s\S]*?(?=### Slide \d+:|$)/g;
				let blockMatch: RegExpExecArray | null;
				const maxBodyIndex = Math.max(...body.slides.map((s: { index: number }) => s.index));
				while ((blockMatch = slideBlockRegex.exec(existingPlan)) !== null) {
					const slideNum = parseInt(blockMatch[1]);
					if (slideNum > maxBodyIndex) {
						preservedSlides.push({ index: slideNum, raw: blockMatch[0].trimEnd() });
					}
				}
			}

			const effectiveSlideCount = Math.max(
				body.slideCount || 0,
				body.slides.length,
				preservedSlides.length > 0
					? Math.max(...preservedSlides.map((s) => s.index))
					: 0,
			);

			const planLines = [
				`# ${body.title || "Untitled Deck"}`,
				"",
				"## Deck Overview",
				`- **Audience:** ${body.audience || "General"}`,
			];
			if (body.purpose) planLines.push(`- **Purpose:** ${body.purpose}`);
			if (body.keyMessage)
				planLines.push(`- **Key Message:** ${body.keyMessage}`);
			if (body.tone) planLines.push(`- **Tone:** ${body.tone}`);
			if (body.brandNotes) planLines.push(`- **Brand:** ${body.brandNotes}`);
			if (body.context) planLines.push(`- **Context:** ${body.context}`);
			planLines.push(`- **Slides:** ${effectiveSlideCount}`);
			planLines.push("");
			planLines.push("## Slides");
			planLines.push("");

			// Build a lookup of existing plan slide blocks by index for
			// content preservation: if a slide in memory is empty but the
			// plan has content, keep the plan's version.
			const existingPlanBlocks = new Map<number, string>();
			if (existsSync(planPath)) {
				const existingPlan = readFileSync(planPath, "utf-8");
				const blockRe = /### Slide (\d+):[\s\S]*?(?=### Slide \d+:|$)/g;
				let bm: RegExpExecArray | null;
				while ((bm = blockRe.exec(existingPlan)) !== null) {
					existingPlanBlocks.set(parseInt(bm[1]), bm[0].trimEnd());
				}
			}

			for (const slide of body.slides) {
				const hasContent = !!(slide.headline?.trim() || slide.content?.trim() || slide.visualConcept?.trim());
				const planBlock = existingPlanBlocks.get(slide.index);

				// If this slide is empty in memory but has content in the plan, preserve the plan version
				if (!hasContent && planBlock) {
					planLines.push(planBlock);
					planLines.push("");
					continue;
				}

				const backgroundMode =
					slide.backgroundMode === "transparent" ? "transparent" : "opaque";
				planLines.push(`### Slide ${slide.index}: ${slide.title}`);
				planLines.push(`- **Type:** ${slide.type}`);
				planLines.push(`- **Render:** ${slide.renderMode || "image"}`);
				planLines.push(`- **Background Mode:** ${backgroundMode}`);
				planLines.push(`- **Headline:** ${slide.headline}`);
				planLines.push(`- **Content:** ${slide.content}`);
				planLines.push(
					`- **Per-slide direction (content/layout only):** ${slide.visualConcept}`,
				);
				planLines.push("");
			}

			// Append preserved slides from the existing plan (beyond body range)
			for (const preserved of preservedSlides) {
				planLines.push(preserved.raw);
				planLines.push("");
			}

			await writeFile(planPath, planLines.join("\n"), "utf-8");

			const indexLines = [
				`# ${body.title || "Untitled Deck"}`,
				"",
				"## Metadata",
				`- **Title:** ${body.title || "Untitled Deck"}`,
				`- **Audience:** ${body.audience || "General"}`,
				`- **Slides:** ${effectiveSlideCount}`,
				"",
				"## Slides",
				"",
				"| # | File | Title | Type |",
				"|---|------|-------|------|",
			];
			for (const slide of body.slides) {
				const fn =
					slide.filename || `${String(slide.index).padStart(2, "0")}-slide.png`;
				indexLines.push(
					`| ${slide.index} | \`${slidesSubdir}/${fn}\` | ${slide.title} | ${slide.type} |`,
				);
			}
			indexLines.push("");
			await writeFile(
				join(deckDir, "DECK-INDEX.md"),
				indexLines.join("\n"),
				"utf-8",
			);
		}

		if (body.annotations && Object.keys(body.annotations).length > 0) {
			const annotationsJsonPath = join(deckDir, "ANNOTATIONS.json");
			let af = {
				notes: {} as Record<number, string>,
				annotations: {} as Record<string, unknown[]>,
			};
			if (existsSync(annotationsJsonPath)) {
				af = parseAnnotationsFile(
					readFileSync(annotationsJsonPath, "utf-8"),
				) as typeof af;
			}
			af.notes = body.annotations;
			await writeFile(
				annotationsJsonPath,
				serializeAnnotationsFile(
					af as Parameters<typeof serializeAnnotationsFile>[0],
				),
				"utf-8",
			);
		}

		return NextResponse.json({ ok: true });
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

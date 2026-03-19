import { NextResponse } from "next/server";
import {
	getDeckDir,
	hasExplicitDeckSelection,
	getSlidesSubdir,
	getStylesRegistry,
	getStylesWithTiles,
	loadDeckState,
} from "@/lib/server/deck";
import { getTextModel, getImageModel, getVideoModel } from "@/lib/server/gemini";
import {
	DEFAULT_STYLE_RECIPE_ID,
	getStyleRecipeOptions,
	type StyleRecipeInfo,
} from "@/lib/style-recipes";

export async function GET() {
	try {
		const deckState = loadDeckState();
		const customStyleRecipes = Array.isArray(deckState.styleRecipes)
			? (deckState.styleRecipes as StyleRecipeInfo[])
			: [];
		const registry = getStylesRegistry();
		return NextResponse.json({
			categories: registry.categories,
			styles: getStylesWithTiles(),
			styleRecipes: getStyleRecipeOptions(customStyleRecipes),
			defaultStyleRecipeId: DEFAULT_STYLE_RECIPE_ID,
			deckDir: getDeckDir(),
			deckSelected: hasExplicitDeckSelection(),
			slidesDir: getSlidesSubdir(),
			deckState,
			models: {
				text: getTextModel(),
				image: getImageModel(),
				video: getVideoModel(),
			},
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`Failed to load deck config: ${msg}`);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

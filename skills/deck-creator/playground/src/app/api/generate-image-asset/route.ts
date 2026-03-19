import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
  getGeneratedDir,
  getSlidesDir,
  getStylesRegistry,
  TILES_DIR,
} from "@/lib/server/deck";
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
} from "@/lib/style-recipes";
import { isDeckAspectRatio } from "@/lib/aspect-ratio";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      prompt: string;
      aspectRatio?: string;
      styleId?: string;
      styleRecipeId?: string | null;
      styleRecipes?: StyleRecipeInfo[];
      stylePrompt?: string;
      saveToSlides?: boolean;
    };
    const styleRecipeId =
      typeof body.styleRecipeId === "string"
        ? body.styleRecipeId.trim() || null
        : body.styleRecipeId;

    if (!body.prompt?.trim()) {
      return NextResponse.json(
        { ok: false, error: "prompt is required" },
        { status: 400 },
      );
    }
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

    const prompt = body.prompt.trim();
    const apiKey = getApiKey();
    const registry = getStylesRegistry();
    let finalPrompt = prompt;
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
      finalPrompt = `${style.promptHints}, ${finalPrompt}`;
      const tilePath = join(TILES_DIR, `${style.id}.png`);
      const tileImage = existsSync(tilePath) ? await loadImage(tilePath) : null;
      if (tileImage) {
        options.inputImages = [tileImage];
        finalPrompt = `Match the artistic style language from the reference image (composition, form, texture, rendering technique) — do not copy its subject matter or palette. ${finalPrompt}`;
      }
    }

    const styleInstructions = composeStyleInstructionsForRole({
      role: "image-asset",
      styleRecipeId,
      styleRecipes: body.styleRecipes,
      customPrompt: body.stylePrompt,
    });
    if (styleInstructions) {
      finalPrompt = `${styleInstructions}\n\nAsset brief:\n${finalPrompt}`;
    }

    const slug = prompt
      .slice(0, 40)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/-+$/, "")
      .toLowerCase();
    const filename = `${Date.now()}-${slug}.png`;

    console.error(`Generating image asset: ${filename}...`);
    const result = await callGeminiImage(
      apiKey,
      finalPrompt,
      options as Parameters<typeof callGeminiImage>[2],
    );

    if (result.images.length > 0) {
      const img = result.images[0];
      const targetDir = body.saveToSlides ? getSlidesDir() : getGeneratedDir();
      const targetLabel = body.saveToSlides ? "slides" : "generated";
      const outputPath = join(targetDir, filename);
      await saveImage(img.data, img.mimeType, outputPath);
      console.error(`  Saved: ${targetLabel}/${filename}`);
      return NextResponse.json({ ok: true, filename, dir: targetLabel });
    }

    return NextResponse.json(
      { ok: false, error: "No image returned from Gemini" },
      { status: 500 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  Image asset generation failed: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

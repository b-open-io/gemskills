#!/usr/bin/env bun
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { resolve } from "path";
import type { Image } from "@google/genai";
const { resolvePluginRoot } = await import(resolve(import.meta.dir, "../../../resolve-root.ts")).catch(async () => {
  // Fallback: find resolve-root.ts via env var or Claude Code plugin paths
  const _tryPaths = [process.env.GEMSKILLS_ROOT || ""];
  const home = process.env.HOME || process.env.USERPROFILE || "";
  try {
    const d = JSON.parse((await import("fs")).readFileSync(resolve(home, ".claude/plugins/installed_plugins.json"), "utf-8"));
    const ip = d.plugins?.["gemskills@b-open-io"]?.[0]?.installPath;
    if (ip) _tryPaths.push(ip);
  } catch {}
  try {
    const cd = resolve(home, ".claude/plugins/cache/b-open-io/gemskills");
    const vs = (await import("fs")).readdirSync(cd).filter((v: string) => /^\d+\./.test(v)).sort();
    for (let i = vs.length - 1; i >= 0; i--) _tryPaths.push(resolve(cd, vs[i]));
  } catch {}
  for (const p of _tryPaths) {
    try { if (p) return await import(resolve(p, "resolve-root.ts")); } catch {}
  }
  throw new Error("Cannot find gemskills. Set GEMSKILLS_ROOT or: claude plugin install gemskills@b-open-io");
});
const PLUGIN_ROOT = resolvePluginRoot(import.meta.dir);
const { callGeminiImage, callReplicateImage, validateImageOptions, getImageModel } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils");
type GeminiImageResult = import("../../../utils").GeminiImageResult;
const { getApiKey, getReplicateApiKey, loadImage, saveImage, parseArgs, generateTimestampFilename } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");
type Style = import("../../../shared").Style;
type StylesRegistry = import("../../../shared").StylesRegistry;

const STYLES_PATH = resolve(PLUGIN_ROOT, "skills/browsing-styles/assets/styles.json");
const TILES_DIR = resolve(PLUGIN_ROOT, "skills/browsing-styles/assets/tiles");

async function loadStyle(
  styleId: string
): Promise<{ style: Style; tileImage: Image | null } | null> {
  if (!existsSync(STYLES_PATH)) {
    console.error("Warning: styles.json not found, ignoring --style");
    return null;
  }
  const content = await readFile(STYLES_PATH, "utf-8");
  const registry: StylesRegistry = JSON.parse(content);
  const style = registry.styles.find(
    (s) => s.id === styleId || s.shortName === styleId
  );
  if (!style) {
    console.error(`Warning: Style "${styleId}" not found`);
    return null;
  }

  const tilePath = resolve(TILES_DIR, `${style.id}.png`);
  const tileImage = existsSync(tilePath) ? await loadImage(tilePath) : null;

  return { style, tileImage };
}

const { positional, flags, multi } = parseArgs();
const prompt = positional.join(" ");

if (!prompt) {
  console.error("Error: Prompt required");
  console.error("Usage: bun run generate.ts \"prompt\" [options]");
  console.error("Options:");
  console.error("  --input <path>    Reference image (can specify multiple times, up to 14)");
  console.error("  --style <id>      Apply style from styles.json");
  console.error("  --size <1K|2K|4K> Image size (default: model decides)");
  console.error("  --aspect <ratio>  Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9");
  console.error("  --negative <text> Negative prompt");
  console.error("  --count <n>       Number of images (1-4)");
  console.error("  --seed <n>        Random seed");
  console.error("  --output <path>   Output file path");
  console.error("  --model <name>    gemini (default) or grok (Replicate)");
  process.exit(1);
}

const validSizes = ["1K", "2K", "4K"];
const validAspects = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

const options: any = {};
// Only set imageSize when explicitly requested — not all models support this parameter
if (flags.size) {
  if (validSizes.includes(flags.size)) {
    options.imageSize = flags.size;
  } else {
    console.error(`Warning: Invalid size "${flags.size}". Valid: ${validSizes.join(", ")}. Omitting imageSize.`);
  }
}
if (flags.aspect) {
  if (validAspects.includes(flags.aspect)) {
    options.aspectRatio = flags.aspect;
  } else {
    console.error(`Warning: Invalid aspect ratio "${flags.aspect}". Valid: ${validAspects.join(", ")}`);
  }
}
if (flags.negative) options.negativePrompt = flags.negative;
if (flags.count) options.numberOfImages = parseInt(flags.count);
if (flags.guidance) options.guidanceScale = parseFloat(flags.guidance);
if (flags.seed) options.seed = parseInt(flags.seed);

// Load input images
const inputPaths = multi.input;
if (inputPaths.length > 0) {
  console.error(`Loading ${inputPaths.length} reference image(s)...`);
  const inputImages: Image[] = [];
  for (const path of inputPaths) {
    const img = await loadImage(path);
    if (img) {
      inputImages.push(img);
      console.error(`  ✓ ${path}`);
    }
  }
  if (inputImages.length > 0) {
    options.inputImages = inputImages;
  }
}

let finalPrompt = prompt;
const styleId = flags.style;
if (styleId) {
  const loaded = await loadStyle(styleId);
  if (loaded) {
    const { style, tileImage } = loaded;
    console.error(`Applying style: ${style.name}`);
    finalPrompt = `${style.promptHints}, ${prompt}`;

    if (tileImage) {
      console.error(`  Using tile reference: tiles/${style.id}.png`);
      if (!options.inputImages) options.inputImages = [];
      options.inputImages.unshift(tileImage);
      finalPrompt = `Match the artistic style, color palette, textures, and visual technique from the reference image — do not copy its subject matter. ${finalPrompt}`;
    }
    console.error("");
  }
}

const modelChoice = flags.model || "gemini";

// Validate options against model capabilities before making any API call
if (modelChoice !== "grok") {
  const imageModel = getImageModel();
  const validationError = validateImageOptions(imageModel, {
    imageSize: options.imageSize,
    aspectRatio: options.aspectRatio,
    inputImages: options.inputImages,
  });
  if (validationError) {
    console.error(`Error: ${validationError}`);
    process.exit(1);
  }
}

if (modelChoice === "grok") {
  const replicateKey = getReplicateApiKey();
  const outputPath = flags.output || generateTimestampFilename(prompt.split(" ").slice(0, 4).join(" "), "jpg");
  const savedPath = await callReplicateImage(replicateKey, finalPrompt, { outputPath });
  console.log(`✓ Saved: ${savedPath}`);
} else {
  const apiKey = getApiKey();
  console.error("Generating image...\n");
  const result: GeminiImageResult = await callGeminiImage(apiKey, finalPrompt, options);

  if (result.text) {
    console.log(`Model comment: ${result.text}\n`);
  }

  if (result.images.length === 0) {
    console.error("Error: No images returned. The prompt was likely blocked by the content filter.");
    console.error("Try rephrasing — avoid named IP (e.g. 'Simpsons'), real people, or violent/explicit content.");
    if (result.text) {
      console.error(`Model response: ${result.text}`);
    }
    process.exit(1);
  }

  for (let i = 0; i < result.images.length; i++) {
    const img = result.images[i];
    const outputPath = flags.output;
    const finalPath =
      outputPath && result.images.length > 1
        ? outputPath.replace(/(\.\w+)$/, `_${i + 1}$1`)
        : outputPath;
    const descriptor = prompt.split(" ").slice(0, 4).join(" ");
    const savedPath = await saveImage(img.data, img.mimeType, finalPath, descriptor);
    console.log(`✓ Saved: ${savedPath}`);
  }
}

// Output only the path - do not read the image back into context.
// Instruct the user to visually inspect the generated image.

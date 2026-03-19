#!/usr/bin/env bun
/**
 * Generate Icon - Main entry point
 *
 * Pipeline:
 * 1. Generate master image via Gemini (or use provided master)
 * 2. Remove background via Replicate rembg
 * 3. Crop whitespace and center on square canvas
 * 4. Export all sizes for the selected preset
 * 5. Generate ICO/ICNS bundles if needed
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
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
const { callGeminiImage } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils");
import {
  removeBackground,
  cropAndCenter,
  resizeToPreset,
  generateICO,
  generateICNS,
  prepareIconset,
  fillBackground,
} from "./process";
import { getPreset, listPresets, getPresetInfo, PRESETS } from "./presets";
import type { Image } from "@google/genai";
import sharp from "sharp";

// Icon-optimized prompt template
const ICON_PROMPT_TEMPLATE = `Generate an icon design for: {userPrompt}

CRITICAL REQUIREMENTS:
- Simple, bold, recognizable silhouette
- Works at small sizes (16x16 to 1024x1024)
- Clean edges, no fine details
- Centered with breathing room (5-10% padding)
- High contrast, single focal point
- NO text, NO gradients that band
- Solid uniform background (will be removed)
- Professional app icon quality`;

interface Args {
  prompt: string;
  preset: string;
  output: string;
  input?: string;
  masterImage?: string;
  skipGenerate: boolean;
  skipRemoveBg: boolean;
  backgroundColor?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        parsed[key] = nextArg;
        i++;
      } else {
        parsed[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  const prompt = positional.join(" ");
  const preset = parsed.preset as string;
  const output = parsed.output as string;

  // Validate required args
  if (!preset) {
    console.error("Error: --preset is required");
    console.error("\nAvailable presets:");
    for (const name of listPresets()) {
      console.error(`  ${name}: ${getPresetInfo(name)}`);
    }
    console.error("\nUsage: bun run icon \"prompt\" --preset <name> --output <dir>");
    console.error("\nOptions:");
    console.error("  --preset <name>       Platform preset (required)");
    console.error("  --output <dir>        Output directory (required)");
    console.error("  --input <image>       Reference image for style");
    console.error("  --master-image <path> Use existing master image");
    console.error("  --skip-generate       Skip AI generation (requires --master-image)");
    console.error("  --skip-remove-bg      Skip background removal");
    console.error("  --bg-color <hex>      Background color for non-transparent presets");
    process.exit(1);
  }

  if (!output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  if (!getPreset(preset)) {
    console.error(`Error: Unknown preset "${preset}"`);
    console.error("\nAvailable presets:");
    for (const name of listPresets()) {
      console.error(`  ${name}: ${getPresetInfo(name)}`);
    }
    process.exit(1);
  }

  const skipGenerate = parsed["skip-generate"] === true;
  const masterImage = parsed["master-image"] as string | undefined;

  if (skipGenerate && !masterImage) {
    console.error("Error: --skip-generate requires --master-image");
    process.exit(1);
  }

  if (!skipGenerate && !prompt && !masterImage) {
    console.error("Error: Prompt required (or use --master-image with --skip-generate)");
    process.exit(1);
  }

  return {
    prompt,
    preset,
    output: resolve(output),
    input: parsed.input as string | undefined,
    masterImage: masterImage ? resolve(masterImage) : undefined,
    skipGenerate,
    skipRemoveBg: parsed["skip-remove-bg"] === true,
    backgroundColor: parsed["bg-color"] as string | undefined,
  };
}

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable not set");
    process.exit(1);
  }
  return apiKey;
}

async function loadImage(filePath: string): Promise<Image | null> {
  if (!existsSync(filePath)) {
    console.error(`Warning: Image not found: ${filePath}`);
    return null;
  }
  const buffer = await readFile(filePath);
  const base64 = buffer.toString("base64");
  const ext = filePath.toLowerCase().split(".").pop();
  const mimeType =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : "image/png";
  return { imageBytes: base64, mimeType };
}

async function prepareInputImagePath(filePath: string): Promise<{ path: string; cleanup?: () => Promise<void> }> {
  const ext = filePath.toLowerCase().split(".").pop();
  if (ext !== "svg") return { path: filePath };

  const tempPath = join(tmpdir(), `generate-icon-input-${randomUUID()}.png`);
  await sharp(filePath)
    .resize(1024, 1024, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toFile(tempPath);

  return {
    path: tempPath,
    cleanup: async () => {
      await rm(tempPath, { force: true });
    },
  };
}

/**
 * Detects the common "checkerboard transparency preview" artifact that
 * image models sometimes bake into generated pixels.
 */
async function hasCheckerboardArtifact(filePath: string): Promise<boolean> {
  const { data, info } = await sharp(filePath)
    .resize(256, 256, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const x0 = Math.floor(info.width * 0.2);
  const x1 = Math.floor(info.width * 0.8);
  const y0 = Math.floor(info.height * 0.2);
  const y1 = Math.floor(info.height * 0.8);

  const bins = new Array<number>(256).fill(0);
  let total = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 245) continue;

      // gray-ish pixels only
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min > 8) continue;

      const v = Math.round((r + g + b) / 3);
      bins[v] += 1;
      total += 1;
    }
  }

  if (total < 1000) return false;

  const peaks = bins
    .map((count, value) => ({ count, value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  if (peaks.length < 2) return false;
  const [p1, p2] = peaks;
  const dominantRatio = (p1.count + p2.count) / total;
  if (Math.abs(p1.value - p2.value) < 12) return false;
  if (dominantRatio < 0.45) return false;

  // Alternating pattern test.
  let alternating = 0;
  let comparable = 0;
  const classify = (v: number) => {
    const d1 = Math.abs(v - p1.value);
    const d2 = Math.abs(v - p2.value);
    if (Math.min(d1, d2) > 8) return 0;
    return d1 <= d2 ? 1 : 2;
  };

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1 - 1; x++) {
      const i1 = (y * info.width + x) * 4;
      const i2 = (y * info.width + x + 1) * 4;
      const a1 = data[i1 + 3];
      const a2 = data[i2 + 3];
      if (a1 < 245 || a2 < 245) continue;

      const v1 = Math.round((data[i1] + data[i1 + 1] + data[i1 + 2]) / 3);
      const v2 = Math.round((data[i2] + data[i2 + 1] + data[i2 + 2]) / 3);
      const c1 = classify(v1);
      const c2 = classify(v2);
      if (!c1 || !c2) continue;
      comparable += 1;
      if (c1 !== c2) alternating += 1;
    }
  }

  if (comparable < 1000) return false;
  return alternating / comparable > 0.28;
}

async function main() {
  const args = parseArgs();
  const preset = getPreset(args.preset)!;

  console.log(`\n=== Generate Icon: ${preset.name} ===\n`);
  console.log(`Output: ${args.output}`);
  console.log(`Sizes: ${preset.sizes.length} variants`);
  console.log(`Master: ${preset.masterSize}x${preset.masterSize}px\n`);

  // Create output directory
  await mkdir(args.output, { recursive: true });

  const masterRawPath = join(args.output, "master-raw.png");
  const masterNoBgPath = join(args.output, "master-nobg.png");
  const masterCroppedPath = join(args.output, "master-cropped.png");
  const masterFinalPath = join(args.output, "master-final.png");

  // Stage 1: Generate or use existing master
  if (args.masterImage) {
    console.log("Stage 1: Using provided master image");
    if (!existsSync(args.masterImage)) {
      console.error(`Error: Master image not found: ${args.masterImage}`);
      process.exit(1);
    }
    // Copy to output directory
    await writeFile(masterRawPath, await readFile(args.masterImage));
  } else if (!args.skipGenerate) {
    console.log("Stage 1: Generating master image via Gemini...");

    const apiKey = getApiKey();
    const basePrompt = ICON_PROMPT_TEMPLATE.replace("{userPrompt}", args.prompt);

    const options: {
      imageSize: string;
      aspectRatio: string;
      inputImage?: Image;
    } = {
      imageSize: "1K", // Generate at 1K, will resize to preset master
      aspectRatio: "1:1",
    };

    // Add reference image if provided
    let inputImageCleanup: (() => Promise<void>) | undefined;
    if (args.input) {
      const prepared = await prepareInputImagePath(args.input);
      inputImageCleanup = prepared.cleanup;
      const inputImage = await loadImage(prepared.path);
      if (inputImage) {
        console.log(`  Using reference image: ${args.input}`);
        options.inputImage = inputImage;
      }
    }

    try {
      let saved = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const iconPrompt =
          attempt === 1
            ? basePrompt
            : `${basePrompt}\n\nCRITICAL: Do NOT render checkerboard transparency previews, tiled transparency patterns, or gray square grids. Keep interior regions as solid color or true transparency only.`;
        const result = await callGeminiImage(apiKey, iconPrompt, options);

        if (result.images.length === 0) {
          console.error("Error: No image generated");
          if (result.text) console.error(`Model response: ${result.text}`);
          process.exit(1);
        }

        // Save master
        const imageData = result.images[0];
        await writeFile(masterRawPath, Buffer.from(imageData.data, "base64"));

        const checkerboard = await hasCheckerboardArtifact(masterRawPath);
        if (checkerboard && attempt < 2) {
          console.warn("  Detected checkerboard artifact in generated icon; retrying once...");
          continue;
        }

        if (checkerboard) {
          console.warn("  Warning: checkerboard-like artifact may still be present in generated icon.");
        }
        console.log(`  Saved: master-raw.png`);
        saved = true;
        break;
      }

      if (!saved) {
        console.error("Error: Failed to save generated master icon");
        process.exit(1);
      }
    } finally {
      if (inputImageCleanup) {
        await inputImageCleanup();
      }
    }
  } else {
    console.log("Stage 1: Skipped (--skip-generate)");
  }

  // Stage 2: Remove background
  let currentMaster = masterRawPath;
  if (!args.skipRemoveBg) {
    console.log("\nStage 2: Removing background...");
    await removeBackground(currentMaster, masterNoBgPath);
    currentMaster = masterNoBgPath;
    console.log(`  Saved: master-nobg.png`);
  } else {
    console.log("\nStage 2: Skipped (--skip-remove-bg)");
  }

  // Stage 3: Crop and center
  console.log("\nStage 3: Cropping and centering...");
  await cropAndCenter(currentMaster, masterCroppedPath, {
    targetSize: preset.masterSize,
    padding: 0.05,
  });
  currentMaster = masterCroppedPath;
  console.log(`  Saved: master-cropped.png (${preset.masterSize}x${preset.masterSize})`);

  // Stage 3.5: Fill background for non-transparent presets (iOS)
  if (!preset.requiresTransparency) {
    console.log("\nStage 3.5: Filling background (preset requires no transparency)...");
    const bgColor = args.backgroundColor
      ? hexToRgb(args.backgroundColor)
      : { r: 255, g: 255, b: 255 };
    await fillBackground(currentMaster, masterFinalPath, bgColor);
    currentMaster = masterFinalPath;
    console.log(`  Saved: master-final.png (white background)`);
  }

  // Stage 4: Export all sizes
  console.log("\nStage 4: Exporting all sizes...");
  const createdFiles = await resizeToPreset(currentMaster, args.output, args.preset);
  console.log(`  Created ${createdFiles.length} icon files`);

  // Stage 5: Generate bundles if needed
  if (preset.generateBundle) {
    console.log("\nStage 5: Generating bundles...");

    if (preset.format === "ico") {
      const icoPath = join(args.output, "favicon.ico");
      const success = await generateICO(args.output, icoPath);
      if (success) {
        console.log(`  Created: favicon.ico`);
        createdFiles.push(icoPath);
      }
    }

    if (preset.format === "icns") {
      const iconsetDir = join(args.output, "AppIcon.iconset");
      const icnsPath = join(args.output, "AppIcon.icns");

      // Prepare iconset directory
      await prepareIconset(currentMaster, iconsetDir);
      console.log(`  Prepared: AppIcon.iconset/`);

      const success = await generateICNS(iconsetDir, icnsPath);
      if (success) {
        console.log(`  Created: AppIcon.icns`);
        createdFiles.push(icnsPath);
        // Clean up iconset directory
        await rm(iconsetDir, { recursive: true });
      }
    }
  } else {
    console.log("\nStage 5: Skipped (no bundle required)");
  }

  // Summary
  console.log("\n=== Complete ===\n");
  console.log(`Output directory: ${args.output}`);
  console.log(`Total files: ${createdFiles.length + 3} (including masters)`);
  console.log("\nMaster files:");
  console.log(`  - master-raw.png`);
  if (!args.skipRemoveBg) console.log(`  - master-nobg.png`);
  console.log(`  - master-cropped.png`);
  if (!preset.requiresTransparency) console.log(`  - master-final.png`);
  console.log("\nIcon files:");
  for (const file of createdFiles.slice(0, 5)) {
    console.log(`  - ${file.replace(args.output + "/", "")}`);
  }
  if (createdFiles.length > 5) {
    console.log(`  ... and ${createdFiles.length - 5} more`);
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

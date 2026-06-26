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
const { callGeminiVideo, callGeminiImage, callReplicateVeo } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils");
const { getApiKey, getReplicateApiKey, loadImage, saveImage, parseArgs, generateTimestampFilename } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");
const { xaiVideo, xaiImage } = await import(resolve(PLUGIN_ROOT, "providers/xai.ts")) as typeof import("../../../providers/xai");
const { resolveProvider } = await import(resolve(PLUGIN_ROOT, "providers/config.ts")) as typeof import("../../../providers/config");
type VideoCapability = import("../../../providers/types").Capability;
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

const { positional, flags, booleans, multi } = parseArgs(process.argv.slice(2), ["input", "ref"]);
const prompt = positional.join(" ");

if (!prompt) {
  console.error("Error: Prompt required");
  console.error("Usage: bun run generate.ts \"prompt\" [options]");
  console.error("Options:");
  console.error("  --input <path>       Starting frame image (image-to-video)");
  console.error("  --ref <path>         Reference image for subject consistency (up to 3, Replicate Veo only)");
  console.error("  --last-frame <path>  Ending frame for interpolation (Replicate Veo only)");
  console.error("  --style <id>         Art style from styles.json");
  console.error("  --aspect <ratio>     16:9 (default) or 9:16");
  console.error("  --resolution <res>   720p (default), 1080p, 4k");
  console.error("  --duration <sec>     4, 6, 8 (default: 8)");
  console.error("  --negative <text>    Negative prompt");
  console.error("  --seed <n>           Random seed");
  console.error("  --output <path>      Output .mp4 path");
  console.error("  --provider <name>    gemini (Veo) | xai (Grok Imagine). Omit to auto-pick by available keys.");
  console.error("                       (--model is a legacy alias: veo/replicate-veo→gemini, grok→xai)");
  console.error("  --oneshot            xAI only: direct text-to-video on grok-imagine-video (v1),");
  console.error("                       instead of the default auto-frame → grok-imagine-video-1.5 i2v");
  console.error("  --no-audio           Disable audio generation (Replicate Veo only)");
  console.error("  --auto-image         With --style, auto-generate styled image first (Veo)");
  process.exit(1);
}

const validAspects = ["16:9", "9:16"];
const validResolutions = ["480p", "720p", "1080p", "4k"]; // 480p = xAI only
const validDurations = ["4", "6", "8"];

// Validate options
if (flags.aspect && !validAspects.includes(flags.aspect)) {
  console.error(`Warning: Invalid aspect ratio "${flags.aspect}". Valid: ${validAspects.join(", ")}`);
}
if (flags.resolution && !validResolutions.includes(flags.resolution)) {
  console.error(`Warning: Invalid resolution "${flags.resolution}". Valid: ${validResolutions.join(", ")}`);
}
if (flags.duration && !validDurations.includes(flags.duration)) {
  console.error(`Warning: Invalid duration "${flags.duration}". Valid: ${validDurations.join(", ")}`);
}

// Load input image if provided (--input goes into multi.input via parseArgs)
let inputImage: Image | undefined;
const inputPath = multi.input?.[0];
if (inputPath) {
  const img = await loadImage(inputPath);
  if (img) {
    inputImage = img;
    console.error(`Loaded input image: ${inputPath}`);
  } else {
    console.error(`Error: Could not load input image: ${inputPath}`);
    process.exit(1);
  }
}

// Apply style
let finalPrompt = prompt;
const styleId = flags.style;
if (styleId) {
  const loaded = await loadStyle(styleId);
  if (loaded) {
    const { style } = loaded;
    console.error(`Applying style: ${style.name}`);
    finalPrompt = `${style.promptHints}, ${prompt}`;
    console.error("");
  }
}

// Auto-image: generate a styled image first, then use it as input
if (booleans.has("auto-image") && styleId && !inputImage) {
  console.error("Generating styled starting frame...");
  const apiKey = getApiKey();
  const loaded = await loadStyle(styleId);
  const imageOptions: any = { imageSize: "1K", aspectRatio: flags.aspect === "9:16" ? "9:16" : "16:9" };

  let imagePrompt = `${finalPrompt}. Single frame composition, detailed and vivid.`;
  if (loaded?.tileImage) {
    imageOptions.inputImages = [loaded.tileImage];
    imagePrompt = `Match the artistic style, color palette, textures, and visual technique from the reference image — do not copy its subject matter. ${imagePrompt}`;
  }

  const imageResult = await callGeminiImage(apiKey, imagePrompt, imageOptions);
  if (imageResult.images.length > 0) {
    const img = imageResult.images[0];
    const tempPath = generateTimestampFilename("auto-frame", "png");
    await saveImage(img.data, img.mimeType, tempPath);
    console.error(`  Generated starting frame: ${tempPath}`);
    inputImage = { imageBytes: img.data, mimeType: img.mimeType };
  } else {
    console.error("  Warning: Auto-image generation returned no images, proceeding with text-only");
  }
}

const outputPath = flags.output || generateTimestampFilename(prompt.split(" ").slice(0, 4).join(" "), "mp4");

const refPaths = multi.ref || [];
const lastFramePath = flags["last-frame"];

// Resolve provider. Legacy --model aliases: veo/replicate-veo → gemini, grok → xai.
let explicit = flags.provider || flags.model;
if (explicit === "veo" || explicit === "replicate-veo") explicit = "gemini";
if (explicit === "grok") explicit = "xai";

// Reference images / last-frame interpolation are Veo-only (via Replicate) →
// force gemini when requested without an explicit override.
const wantsVeoAdvanced = refPaths.length > 0 || lastFramePath;
if (wantsVeoAdvanced && !explicit) {
  console.error("Reference images / last frame require Veo — using --provider gemini.");
  explicit = "gemini";
}

const caps: VideoCapability[] = [inputImage ? "i2v" : "t2v"];
const { provider, source } = await resolveProvider("video", { explicit, caps });
console.error(`Provider: ${provider}${source === "auto" ? " (auto-picked)" : ` (${source})`}\n`);

if (provider === "xai") {
  // grok-imagine-video-1.5 is image-to-video only (highest quality); v1 does t2v.
  const oneshot = booleans.has("oneshot");
  const duration = flags.duration ? parseInt(flags.duration) : undefined;
  let resolution = flags.resolution;
  if (resolution === "4k") { console.error("Note: xAI has no 4k; using 1080p."); resolution = "1080p"; }

  let framePath = inputPath; // explicit --input start frame → direct i2v

  if (!framePath && !oneshot) {
    // Default "video from a prompt": make a start frame, then i2v with 1.5.
    console.error("Generating start frame for image-to-video (grok-imagine-video-1.5)...");
    framePath = generateTimestampFilename("xai-frame", "png");
    const framePrompt = `${finalPrompt}. Single frame, detailed and vivid composition.`;
    if (process.env.GEMINI_API_KEY) {
      // Prefer a Gemini frame (supports style tiles) when available.
      const apiKey = getApiKey();
      const imgOpts: any = { imageSize: "1K", aspectRatio: flags.aspect === "9:16" ? "9:16" : "16:9" };
      const loaded = styleId ? await loadStyle(styleId) : null;
      let p = framePrompt;
      if (loaded?.tileImage) {
        imgOpts.inputImages = [loaded.tileImage];
        p = `Match the artistic style, palette, textures, and technique from the reference image — do not copy its subject. ${p}`;
      }
      const r = await callGeminiImage(apiKey, p, imgOpts);
      if (r.images.length) await saveImage(r.images[0].data, r.images[0].mimeType, framePath);
      else { console.error("  Frame gen returned nothing; falling back to xAI image."); framePath = undefined; }
    }
    if (!framePath) {
      framePath = generateTimestampFilename("xai-frame", "png");
      await xaiImage(framePrompt, { outputPath: framePath });
    }
    console.error(`  Start frame: ${framePath}\n`);
  }

  const result = await xaiVideo(finalPrompt, {
    image: framePath, // undefined → text-to-video on v1 (oneshot)
    duration,
    aspectRatio: flags.aspect,
    resolution,
    outputPath,
  });
  if (result.costUsd != null) console.error(`Cost: ~$${result.costUsd.toFixed(2)}`);
  console.log(result.path);
} else if (provider === "gemini" && wantsVeoAdvanced) {
  // Replicate Veo 3.1 — supports image, reference_images, last_frame
  const replicateKey = getReplicateApiKey();
  const inputPath2 = multi.input?.[0];

  const result = await callReplicateVeo(replicateKey, finalPrompt, {
    image: inputPath2 || undefined,
    referenceImages: refPaths.length > 0 ? refPaths : undefined,
    lastFrame: lastFramePath || undefined,
    aspectRatio: (flags.aspect as "16:9" | "9:16") || undefined,
    resolution: (flags.resolution as "720p" | "1080p") || undefined,
    duration: flags.duration ? parseInt(flags.duration) as 4 | 6 | 8 : undefined,
    generateAudio: booleans.has("no-audio") ? false : undefined,
    negativePrompt: flags.negative || undefined,
    seed: flags.seed ? parseInt(flags.seed) : undefined,
    outputPath,
  });
  console.log(result.videoPath);
} else {
  // Default: Veo 3.1 via Gemini API (primary)
  const apiKey = getApiKey();

  console.error(`Generating video with Veo 3.1 (Gemini API)...`);
  console.error(`  Mode: ${inputImage ? "image-to-video" : "text-to-video"}`);
  console.error(`  Duration: ${flags.duration || "8"}s`);
  console.error(`  Aspect: ${flags.aspect || "16:9"}`);
  console.error(`  Resolution: ${flags.resolution || "720p"}`);
  console.error("  Polling");

  const result = await callGeminiVideo(apiKey, finalPrompt, {
    image: inputImage,
    aspectRatio: (flags.aspect as "16:9" | "9:16") || undefined,
    resolution: (flags.resolution as "720p" | "1080p" | "4k") || undefined,
    durationSeconds: (flags.duration as "4" | "6" | "8") || undefined,
    negativePrompt: flags.negative || undefined,
    seed: flags.seed ? parseInt(flags.seed) : undefined,
    outputPath,
  });
  console.log(result.videoPath);
}

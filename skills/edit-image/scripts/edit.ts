#!/usr/bin/env bun
import { resolve } from "path";

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
const { callGeminiEdit } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils");
type GeminiImageResult = import("../../../utils").GeminiImageResult;
const { getApiKey, loadImageRequired, loadImage, saveImage, parseArgs } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");

const { positional, flags, multi } = parseArgs(undefined, ["input"]);

const inputPath = positional[0];
const prompt = positional.slice(1).join(" ");

if (!inputPath || !prompt) {
  console.error("Error: Input image and prompt required");
  console.error("Usage: bun run edit.ts <input-image> \"edit prompt\" [options]");
  console.error("Options:");
  console.error("  --input <path>    Additional reference image (multiple allowed)");
  console.error("  --mask <path>     Mask image for targeted editing");
  console.error("  --mode <mode>     Edit mode: inpaint or outpaint");
  console.error("  --aspect <ratio>  Aspect ratio");
  console.error("  --size <size>     Image size");
  console.error("  --count <n>       Number of variations");
  console.error("  --seed <n>        Random seed");
  console.error("  --output <path>   Output file path");
  process.exit(1);
}

const options: any = {};
if (flags.format) options.outputFormat = flags.format;
if (flags.quality) options.jpegQuality = parseInt(flags.quality);
if (flags.negative) options.negativePrompt = flags.negative;
if (flags.count) options.numberOfImages = parseInt(flags.count);
if (flags.guidance) options.guidanceScale = parseFloat(flags.guidance);
if (flags.seed) options.seed = parseInt(flags.seed);
if (flags.mode) options.editMode = flags.mode;
if (flags.aspect) options.aspectRatio = flags.aspect;
if (flags.size) options.imageSize = flags.size;

const apiKey = getApiKey();
const imageData = await loadImageRequired(inputPath);
const maskData = flags.mask ? await loadImage(flags.mask) : undefined;

if (multi.input.length > 0) {
  const refs = [];
  for (const p of multi.input) {
    const img = await loadImage(p);
    if (img) refs.push(img);
  }
  if (refs.length > 0) options.referenceImages = refs;
}

console.error("Editing image...\n");
const result: GeminiImageResult = await callGeminiEdit(
  apiKey,
  prompt,
  imageData,
  maskData || undefined,
  options
);

for (let i = 0; i < result.images.length; i++) {
  const img = result.images[i];
  const outputPath = flags.output;
  const finalPath =
    outputPath && result.images.length > 1
      ? outputPath.replace(/(\.\w+)$/, `_${i + 1}$1`)
      : outputPath;
  const savedPath = await saveImage(img.data, img.mimeType, finalPath);
  console.log(`✓ Saved: ${savedPath}`);
}

// Do not read generated images back. Instruct user to visually inspect.

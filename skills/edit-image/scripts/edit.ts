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
const { openaiEdit, resolveImageModelFlag, resolveOpenAISize, parseOpenAIQuality } = await import(resolve(PLUGIN_ROOT, "providers/openai.ts")) as typeof import("../../../providers/openai");
const { resolveProvider } = await import(resolve(PLUGIN_ROOT, "providers/config.ts")) as typeof import("../../../providers/config");
type EditCapability = import("../../../providers/types").Capability;

const { positional, flags, multi, booleans } = parseArgs(undefined, ["input"]);

const inputPath = positional[0];
const prompt = positional.slice(1).join(" ");

if (!inputPath || !prompt) {
  console.error("Error: Input image and prompt required");
  console.error("Usage: bun run edit.ts <input-image> \"edit prompt\" [options]");
  console.error("Options:");
  console.error("  --input <path>    Additional reference image (multiple allowed)");
  console.error("  --mask <path>     Mask image for targeted editing");
  console.error("  --mode <mode>     Edit mode: inpaint or outpaint");
  console.error("  --aspect <ratio>  Aspect ratio (openai: any W:H from 1:3 to 3:1)");
  console.error("  --size <size>     Image size: 1K | 2K | 4K (openai also takes WxH, e.g. 3840x1280)");
  console.error("  --quality <q>     openai only: low | medium | high | xhigh | max | auto (default auto)");
  console.error("  --jpeg-quality <n> gemini only: JPEG quality (1-100)");
  console.error("  --count <n>       Number of variations");
  console.error("  --seed <n>        Random seed");
  console.error("  --output <path>   Output file path");
  console.error("  --transparent     Transparent PNG output (OpenAI background=transparent)");
  console.error("  --provider <name> gemini (default) or openai (Image 2.5 Flare / Sunburst)");
  console.error("  --model <id>      flare | sunburst | gpt-image-2.5-flare | gpt-image-2.5-sunburst");
  console.error("                    (sets openai + API model). Legacy gemini|openai aliases deprecated");
  process.exit(1);
}

const options: any = {};
if (flags.format) options.outputFormat = flags.format;
if (flags["jpeg-quality"]) options.jpegQuality = parseInt(flags["jpeg-quality"]);
if (flags.negative) options.negativePrompt = flags.negative;
if (flags.count) options.numberOfImages = parseInt(flags.count);
if (flags.guidance) options.guidanceScale = parseFloat(flags.guidance);
if (flags.seed) options.seed = parseInt(flags.seed);
if (flags.mode) options.editMode = flags.mode;
if (flags.aspect) options.aspectRatio = flags.aspect;
if (flags.size) options.imageSize = flags.size;

// Resolve provider. Negative prompts and outpaint mode are Gemini-only;
// transparency, mask, and multi-image compose work on openai + gemini.
const wantTransparent = booleans.has("transparent") || flags.transparent === "true";
const editCaps: EditCapability[] = [];
if (flags.negative) editCaps.push("negative");
if (flags.mask) editCaps.push("mask");
if (multi.input.length > 0) editCaps.push("multiRef");
if (wantTransparent) editCaps.push("transparent");
const modelFlag = resolveImageModelFlag(flags.model);
if (modelFlag.deprecatedAlias) {
  console.error("Warning: --model as a provider alias is deprecated; use --provider instead.\n");
}
let editExplicit = flags.provider || modelFlag.provider;
if (flags.mode && !editExplicit) editExplicit = "gemini"; // inpaint/outpaint mode is Gemini-specific
const { provider, source } = await resolveProvider("edit", { explicit: editExplicit, caps: editCaps });
console.error(`Provider: ${provider}${source === "auto" ? " (auto-picked)" : ` (${source})`}\n`);
if (flags.quality && provider !== "openai") {
  console.error(`Error: --quality is openai only (provider is ${provider}). For JPEG quality use --jpeg-quality.`);
  process.exit(1);
}
if (flags["jpeg-quality"] && provider === "openai") {
  console.error("Error: --jpeg-quality is gemini only. For openai use --quality low|medium|high|xhigh|max|auto.");
  process.exit(1);
}

if (provider === "openai") {
  if (flags.negative) console.error("Note: openai has no negative param; fold exclusions into the prompt.\n");
  let size: string;
  let quality: ReturnType<typeof parseOpenAIQuality>;
  try {
    size = resolveOpenAISize(flags.size, flags.aspect);
    quality = parseOpenAIQuality(flags.quality);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
  console.error(`Size: ${size}, quality: ${quality}`);
  const res = await openaiEdit(prompt, {
    images: [inputPath, ...multi.input],
    mask: flags.mask,
    model: modelFlag.openaiModel,
    size,
    quality,
    background: wantTransparent ? "transparent" : undefined,
    outputPath: flags.output,
  });
  for (const p of res.paths) console.log(`✓ Saved: ${p}`);
  console.error(res.costUsd != null ? `Cost: ~$${res.costUsd.toFixed(4)}` : `Cost: no price data for ${res.model}`);
} else {
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
}

// Do not read generated images back. Instruct user to visually inspect.

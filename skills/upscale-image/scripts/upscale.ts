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
const { callGeminiUpscale } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils");
type GeminiImageResult = import("../../../utils").GeminiImageResult;
const { loadImageRequired, saveImage, parseArgs } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");
const { atlasUpscale } = await import(resolve(PLUGIN_ROOT, "providers/atlas-upscale.ts")) as typeof import("../../../providers/atlas-upscale");

const { positional, flags } = parseArgs();
const inputPath = positional[0];

if (!inputPath) {
  console.error("Error: Input image path required");
  console.error("Usage: bun run upscale.ts <input-image> [options]");
  console.error("Options:");
  console.error("  --factor <x2|x4>   Upscale factor (default: x2)");
  console.error("  --format <fmt>     Output format: png, jpeg, webp");
  console.error("  --quality <n>      JPEG quality (1-100)");
  console.error("  --provider <name>  vertex | atlas (default: vertex)");
  console.error("  --project <id>     Google Cloud project");
  console.error("  --output <path>    Output file path");
  console.error("\nCredentials:");
  console.error("  - Vertex (default): GOOGLE_CLOUD_PROJECT + gcloud ADC");
  console.error("  - Atlas: ATLASCLOUD_API_KEY");
  process.exit(1);
}

const provider = flags.provider || "vertex";
if (provider !== "vertex" && provider !== "atlas") {
  console.error(`Error: Invalid provider "${provider}". Valid: vertex, atlas`);
  process.exit(1);
}
if (flags.factor && flags.factor !== "x2" && flags.factor !== "x4") {
  console.error(`Error: Invalid factor "${flags.factor}". Valid: x2, x4`);
  process.exit(1);
}
if (flags.format && !["png", "jpeg", "jpg", "webp"].includes(flags.format)) {
  console.error(`Error: Invalid format "${flags.format}". Valid: png, jpeg, jpg, webp`);
  process.exit(1);
}

const options: any = {};
if (flags.factor) options.upscaleFactor = flags.factor;
if (flags.format) options.outputFormat = flags.format;
if (flags.quality) options.jpegQuality = parseInt(flags.quality);
if (flags.project) options.project = flags.project;
if (flags.location) options.location = flags.location;

let result: GeminiImageResult;
if (provider === "atlas") {
  if (flags.project || flags.location || flags.quality) {
    console.error("Note: Atlas Cloud ignores --project, --location, and --quality.\n");
  }
  console.error("Upscaling image (via Atlas Cloud)...\n");
  const atlasResult = await atlasUpscale(inputPath, {
    factor: flags.factor === "x4" ? "x4" : "x2",
    outputFormat: (flags.format || "png") as "jpeg" | "png" | "webp" | "jpg",
  });
  result = { images: [{ data: atlasResult.data, mimeType: atlasResult.mimeType }] };
} else {
  const imageData = await loadImageRequired(inputPath);
  console.error("Upscaling image (via Vertex AI)...\n");
  result = await callGeminiUpscale(imageData, options);
}

for (let i = 0; i < result.images.length; i++) {
  const img = result.images[i];
  const savedPath = await saveImage(img.data, img.mimeType, flags.output);
  console.log(`✓ Saved: ${savedPath}`);
}

// Do not read generated images back. Instruct user to visually inspect.

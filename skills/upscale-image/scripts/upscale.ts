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

const { positional, flags } = parseArgs();
const inputPath = positional[0];

if (!inputPath) {
  console.error("Error: Input image path required");
  console.error("Usage: bun run upscale.ts <input-image> [options]");
  console.error("Options:");
  console.error("  --factor <x2|x4>   Upscale factor (default: x2)");
  console.error("  --format <fmt>     Output format: png, jpeg, webp");
  console.error("  --quality <n>      JPEG quality (1-100)");
  console.error("  --project <id>     Google Cloud project");
  console.error("  --output <path>    Output file path");
  console.error("\nRequires Vertex AI credentials:");
  console.error("  - GOOGLE_CLOUD_PROJECT environment variable");
  console.error("  - Run: gcloud auth application-default login");
  process.exit(1);
}

const options: any = {};
if (flags.factor) options.upscaleFactor = flags.factor;
if (flags.format) options.outputFormat = flags.format;
if (flags.quality) options.jpegQuality = parseInt(flags.quality);
if (flags.project) options.project = flags.project;
if (flags.location) options.location = flags.location;

const imageData = await loadImageRequired(inputPath);

console.error("Upscaling image (via Vertex AI)...\n");
const result: GeminiImageResult = await callGeminiUpscale(imageData, options);

for (let i = 0; i < result.images.length; i++) {
  const img = result.images[i];
  const savedPath = await saveImage(img.data, img.mimeType, flags.output);
  console.log(`✓ Saved: ${savedPath}`);
}

// Do not read generated images back. Instruct user to visually inspect.

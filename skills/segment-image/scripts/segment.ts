#!/usr/bin/env bun
import { resolve } from "path";
import { writeFile, mkdir } from "fs/promises";
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
const { callGeminiSegment } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils");
type GeminiSegmentResult = import("../../../utils").GeminiSegmentResult;
const { getApiKey, loadImageRequired, parseArgs } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");

const { positional, flags } = parseArgs();
const inputPath = positional[0];

if (!inputPath) {
  console.error("Error: Input image path required");
  console.error("Usage: bun run segment.ts <input-image> [options]");
  console.error("Options:");
  console.error("  --prompt <text>   Custom segmentation prompt");
  console.error("  --output <dir>    Directory to save mask PNGs");
  process.exit(1);
}

const apiKey = getApiKey();
const imageData = await loadImageRequired(inputPath);

console.error("Segmenting image...\n");
const result: GeminiSegmentResult = await callGeminiSegment(apiKey, imageData, flags.prompt);

console.log(`Found ${result.masks.length} objects:\n`);
for (let i = 0; i < result.masks.length; i++) {
  const mask = result.masks[i];
  console.log(`${i + 1}. ${mask.label}`);
  console.log(`   Box: [${mask.box_2d.join(", ")}]`);
  console.log(`   Mask data length: ${mask.mask?.length || 0}`);

  if (flags.output && mask.mask) {
    await mkdir(flags.output, { recursive: true });
    const filename = `mask_${i + 1}_${mask.label.replace(/[^a-zA-Z0-9]+/g, "_")}.png`;
    let maskData = mask.mask;
    if (maskData.includes(",")) {
      maskData = maskData.split(",")[1];
    }
    await writeFile(`${flags.output}/${filename}`, Buffer.from(maskData, "base64"));
  }
}

if (flags.output) {
  console.log(`\n✓ Saved ${result.masks.length} masks to: ${flags.output}`);
}

if (result.usage) {
  console.log(`\n---`);
  console.log(
    `Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`
  );
}

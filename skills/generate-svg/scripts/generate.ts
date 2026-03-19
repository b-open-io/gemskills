#!/usr/bin/env bun
import { resolve } from "path";
import { writeFile } from "fs/promises";
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
const { callArrowSvg, callArrowVectorize } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils");
type GeminiSvgResult = import("../../../utils").GeminiSvgResult;
const { getQuiverApiKey, parseArgs } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");

const { positional, flags, multi, booleans } = parseArgs(process.argv.slice(2), ["references"]);
const prompt = positional.join(" ");
const isVectorize = booleans.has("vectorize");

if (!prompt && !isVectorize) {
  console.error("Error: Prompt required");
  console.error("Usage: bun run generate.ts \"prompt\" [options]");
  console.error("       bun run generate.ts --vectorize --image <url|base64> [options]");
  console.error("");
  console.error("Text-to-SVG options:");
  console.error("  --instructions <text>      Additional style/formatting guidance");
  console.error("  --references <url>         Reference image URL or base64 (up to 4, repeatable)");
  console.error("  --count <n>                Outputs to generate (1-16, default 1)");
  console.error("  --temperature <n>          Sampling temperature 0-2 (default 1)");
  console.error("  --top-p <n>                Nucleus sampling 0-1 (default 1)");
  console.error("  --presence-penalty <n>     Presence penalty -2 to 2 (default 0)");
  console.error("  --max-tokens <n>           Max output tokens 1-131072");
  console.error("");
  console.error("Image-to-SVG (vectorize) options:");
  console.error("  --vectorize                Enable vectorization mode");
  console.error("  --image <url|base64>       Source image URL or base64 (required)");
  console.error("  --auto-crop                Auto-crop to dominant subject");
  console.error("  --target-size <n>          Square resize target 128-4096 px");
  console.error("  --count, --temperature, --top-p, --presence-penalty, --max-tokens (same as above)");
  console.error("");
  console.error("  --output <path>            Output path (default: output.svg)");
  process.exit(1);
}

const apiKey = getQuiverApiKey();

// Shared numeric options
const count = flags.count ? parseInt(flags.count, 10) : undefined;
const temperature = flags.temperature ? parseFloat(flags.temperature) : undefined;
const topP = flags["top-p"] ? parseFloat(flags["top-p"]) : undefined;
const presencePenalty = flags["presence-penalty"] ? parseFloat(flags["presence-penalty"]) : undefined;
const maxOutputTokens = flags["max-tokens"] ? parseInt(flags["max-tokens"], 10) : undefined;
const outputPath = flags.output || "output.svg";

let result: GeminiSvgResult;

if (isVectorize) {
  const image = flags.image;
  if (!image) {
    console.error("Error: --image required in vectorize mode");
    process.exit(1);
  }
  const targetSize = flags["target-size"] ? parseInt(flags["target-size"], 10) : undefined;
  const autoCrop = booleans.has("auto-crop");
  console.error("Vectorizing image to SVG...\n");
  result = await callArrowVectorize(apiKey, image, {
    n: count,
    temperature,
    topP,
    presencePenalty,
    maxOutputTokens,
    autoCrop,
    targetSize,
  });
} else {
  const instructions = flags.instructions;
  const references = multi.references?.length ? multi.references : undefined;
  console.error("Generating SVG...\n");
  result = await callArrowSvg(apiKey, prompt, {
    instructions,
    references,
    n: count,
    temperature,
    topP,
    presencePenalty,
    maxOutputTokens,
  });
}

await writeFile(outputPath, result.svg);
console.log(`✓ Saved: ${outputPath}`);

if (result.usage) {
  console.log(`\n---`);
  console.log(
    `Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`
  );
}

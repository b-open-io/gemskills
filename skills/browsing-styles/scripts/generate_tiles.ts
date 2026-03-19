#!/usr/bin/env bun
import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
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
const { getApiKey, parseArgs } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");
type StylesRegistry = import("../../../shared").StylesRegistry;

const __dirname = dirname(fileURLToPath(import.meta.url));
const STYLES_PATH = resolve(__dirname, "../assets/styles.json");
const TILES_DIR = resolve(__dirname, "../assets/tiles");
const OPTIMIZE_SCRIPT = resolve(PLUGIN_ROOT, "skills/optimize-images/scripts/optimize-images.ts");

async function main() {
  const apiKey = getApiKey();
  const content = await readFile(STYLES_PATH, "utf-8");
  const registry: StylesRegistry = JSON.parse(content);

  if (!existsSync(TILES_DIR)) {
    await mkdir(TILES_DIR, { recursive: true });
  }

  const { flags, booleans } = parseArgs();
  const startFrom = flags.start || null;
  const onlyCategory = flags.category || null;
  const onlyStyle = flags.style || null;
  const skipExisting = booleans.has("skip-existing");
  const dryRun = booleans.has("dry-run");
  const shouldOptimize = !booleans.has("no-optimize"); // optimize by default
  const concurrency = flags.concurrency ? parseInt(flags.concurrency) : 2;

  let styles = registry.styles;

  if (onlyCategory) {
    styles = styles.filter((s) => s.category === onlyCategory);
    console.log(`Filtering to category: ${onlyCategory} (${styles.length} styles)`);
  }

  if (onlyStyle) {
    styles = styles.filter((s) => s.id === onlyStyle || s.shortName === onlyStyle);
    console.log(`Filtering to style: ${onlyStyle}`);
  }

  if (startFrom) {
    const idx = styles.findIndex((s) => s.id === startFrom || s.shortName === startFrom);
    if (idx !== -1) {
      styles = styles.slice(idx);
      console.log(`Starting from: ${startFrom} (${styles.length} remaining)`);
    }
  }

  if (skipExisting) {
    styles = styles.filter((s) => !existsSync(resolve(TILES_DIR, `${s.id}.png`)));
    console.log(`After skipping existing: ${styles.length} styles to generate`);
  }

  console.log(`\nGenerating ${styles.length} style tiles (1:1, 1K)`);
  console.log(`Output: ${TILES_DIR}\n`);

  if (dryRun) {
    for (const style of styles) {
      console.log(`  [DRY RUN] ${style.id}: ${style.tilePrompt.slice(0, 80)}...`);
    }
    return;
  }

  let completed = 0;
  let failed = 0;
  const generatedPaths: string[] = [];

  for (let i = 0; i < styles.length; i += concurrency) {
    const batch = styles.slice(i, i + concurrency);
    const promises = batch.map(async (style) => {
      const outputPath = resolve(TILES_DIR, `${style.id}.png`);
      try {
        console.log(`  [${completed + 1}/${styles.length}] Generating: ${style.name}...`);

        const result = await callGeminiImage(apiKey, style.tilePrompt, {
          aspectRatio: "1:1",
          imageSize: "512",
        });

        if (result.images.length > 0) {
          const imageData = Buffer.from(result.images[0].data, "base64");
          await writeFile(outputPath, imageData);
          completed++;
          generatedPaths.push(outputPath);
          console.log(`  ✓ ${style.id}.png (${(imageData.length / 1024).toFixed(0)}KB)`);
        } else {
          failed++;
          console.error(`  ✗ ${style.id}: No image returned`);
        }
      } catch (error: unknown) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ ${style.id}: ${msg}`);
      }
    });

    await Promise.all(promises);

    if (i + concurrency < styles.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\nDone! ${completed} generated, ${failed} failed out of ${styles.length} total.`);

  // Auto-optimize generated tiles
  if (shouldOptimize && generatedPaths.length > 0) {
    console.log(`\nOptimizing ${generatedPaths.length} tile(s)...`);
    for (const tilePath of generatedPaths) {
      const result = spawnSync("bun", ["run", OPTIMIZE_SCRIPT, `--file=${tilePath}`], {
        stdio: "pipe",
        cwd: resolve(PLUGIN_ROOT, "skills/optimize-images"),
      });
      if (result.status !== 0) {
        console.error(`  Warning: Failed to optimize ${tilePath}`);
      }
    }
    console.log("Optimization complete.");
  }
}

main().catch(console.error);

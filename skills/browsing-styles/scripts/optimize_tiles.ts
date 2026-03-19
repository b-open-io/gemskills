#!/usr/bin/env bun

/**
 * Optimize style tile reference images.
 *
 * Resizes 1024x1024 tiles to 512x512 and compresses PNG.
 * These tiles are sent as base64 to Gemini API, so smaller = fewer tokens.
 *
 * Usage:
 *   bun run scripts/optimize_tiles.ts              # Optimize all tiles
 *   bun run scripts/optimize_tiles.ts --dry-run    # Preview savings
 *   bun run scripts/optimize_tiles.ts --size 256   # Custom target size
 */

import sharp from "sharp";
import { readdir, stat } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TILES_DIR = resolve(__dirname, "../assets/tiles");

const DRY_RUN = process.argv.includes("--dry-run");
const TARGET_SIZE = Number(
  process.argv.find((a) => a.startsWith("--size="))?.split("=")[1] || "512"
);

interface Result {
  file: string;
  originalSize: number;
  newSize: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function main() {
  const entries = await readdir(TILES_DIR);
  const pngs = entries.filter((f) => f.endsWith(".png")).sort();

  console.log(`Tiles directory: ${TILES_DIR}`);
  console.log(`Found ${pngs.length} tiles to optimize`);
  console.log(`Target size: ${TARGET_SIZE}x${TARGET_SIZE}`);
  if (DRY_RUN) console.log("DRY RUN - no files will be modified");
  console.log("");

  const results: Result[] = [];

  for (const file of pngs) {
    const filePath = join(TILES_DIR, file);
    const originalStat = await stat(filePath);
    const originalSize = originalStat.size;

    const outputBuffer = await sharp(filePath)
      .resize(TARGET_SIZE, TARGET_SIZE, { fit: "cover" })
      .png({
        quality: 80,
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true,
      })
      .toBuffer();

    const newSize = outputBuffer.length;

    if (!DRY_RUN && newSize < originalSize) {
      await Bun.write(filePath, outputBuffer);
    }

    const savings = ((originalSize - newSize) / originalSize * 100).toFixed(0);
    console.log(`  ${file}: ${formatBytes(originalSize)} -> ${formatBytes(newSize)} (-${savings}%)`);

    results.push({ file, originalSize, newSize: Math.min(newSize, originalSize) });
  }

  const totalOriginal = results.reduce((s, r) => s + r.originalSize, 0);
  const totalNew = results.reduce((s, r) => s + r.newSize, 0);
  const totalSavings = totalOriginal - totalNew;
  const pct = ((totalSavings / totalOriginal) * 100).toFixed(1);

  console.log("");
  console.log(`Total: ${formatBytes(totalOriginal)} -> ${formatBytes(totalNew)} (-${pct}%)`);
  console.log(`Saved: ${formatBytes(totalSavings)}`);
  if (DRY_RUN) console.log("\nRun without --dry-run to apply changes.");
}

main().catch(console.error);

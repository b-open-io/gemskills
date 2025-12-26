#!/usr/bin/env bun
import { readFile, writeFile, mkdir } from "fs/promises";
import { callGeminiSegment, type GeminiSegmentResult } from "../../../utils";
import type { Image } from "@google/genai";

const args = process.argv.slice(2);

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }
  return apiKey;
}

async function loadImage(path: string): Promise<Image> {
  const buffer = await readFile(path);
  const ext = path.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return {
    imageBytes: buffer.toString("base64"),
    mimeType: mimeTypes[ext || ""] || "image/png",
  };
}

function parseArgs(): { inputPath: string; prompt?: string; outputDir?: string } {
  const parsed: Record<string, any> = { _: [] };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        parsed[key] = nextArg;
        i++;
      }
    } else {
      parsed._.push(arg);
    }
  }

  const inputPath = parsed._[0];
  if (!inputPath) {
    console.error("Error: Input image path required");
    console.error("Usage: bun run segment.ts <input-image> [options]");
    process.exit(1);
  }

  return {
    inputPath,
    prompt: parsed.prompt,
    outputDir: parsed.output
  };
}

const apiKey = getApiKey();
const { inputPath, prompt, outputDir } = parseArgs();

const imageData = await loadImage(inputPath);

console.error("🔍 Segmenting image...\n");
const result: GeminiSegmentResult = await callGeminiSegment(apiKey, imageData, prompt);

console.log(`Found ${result.masks.length} objects:\n`);
for (let i = 0; i < result.masks.length; i++) {
  const mask = result.masks[i];
  console.log(`${i + 1}. ${mask.label}`);
  console.log(`   Box: [${mask.box_2d.join(", ")}]`);

  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    const filename = `mask_${i + 1}_${mask.label.replace(/\s+/g, "_")}.png`;
    await writeFile(
      `${outputDir}/${filename}`,
      Buffer.from(mask.mask, "base64")
    );
  }
}

if (outputDir) {
  console.log(`\n✓ Saved ${result.masks.length} masks to: ${outputDir}`);
}

if (result.usage) {
  console.log(`\n---`);
  console.log(
    `Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`
  );
}

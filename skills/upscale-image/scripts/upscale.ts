#!/usr/bin/env bun
import { readFile, writeFile } from "fs/promises";
import { callGeminiUpscale, type GeminiImageResult } from "../../../utils";
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

async function saveImage(data: string, mimeType: string, outputPath?: string): Promise<string> {
  const ext = mimeType.split("/")[1] || "png";
  const path = outputPath || `upscaled_${Date.now()}.${ext}`;
  const buffer = Buffer.from(data, "base64");
  await writeFile(path, buffer);
  return path;
}

function parseArgs(): { inputPath: string; options: any } {
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
    console.error("Usage: bun run upscale.ts <input-image> [options]");
    process.exit(1);
  }

  const options: any = {};
  if (parsed.factor) options.upscaleFactor = parsed.factor;
  if (parsed.format) options.outputFormat = parsed.format;
  if (parsed.quality) options.jpegQuality = parseInt(parsed.quality);

  return { inputPath, options };
}

const apiKey = getApiKey();
const { inputPath, options } = parseArgs();

const imageData = await loadImage(inputPath);

console.error("🔍 Upscaling image...\n");
const result: GeminiImageResult = await callGeminiUpscale(apiKey, imageData, options);

const outputPath = args.find(a => a === "--output")
  ? args[args.indexOf("--output") + 1]
  : undefined;

for (let i = 0; i < result.images.length; i++) {
  const img = result.images[i];
  const savedPath = await saveImage(img.data, img.mimeType, outputPath);
  console.log(`✓ Saved: ${savedPath}`);
}

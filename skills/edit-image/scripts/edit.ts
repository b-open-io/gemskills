#!/usr/bin/env bun
import { readFile, writeFile } from "fs/promises";
import { callGeminiEdit, type GeminiImageResult } from "../../../utils";
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
  const path = outputPath || `edited_${Date.now()}.${ext}`;
  const buffer = Buffer.from(data, "base64");
  await writeFile(path, buffer);
  return path;
}

function parseArgs(): { inputPath: string; prompt: string; maskPath?: string; options: any } {
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
  const prompt = parsed._.slice(1).join(" ");

  if (!inputPath || !prompt) {
    console.error("Error: Input image and prompt required");
    console.error("Usage: bun run edit.ts <input-image> \"edit prompt\" [options]");
    process.exit(1);
  }

  const options: any = {};
  if (parsed.format) options.outputFormat = parsed.format;
  if (parsed.quality) options.jpegQuality = parseInt(parsed.quality);
  if (parsed.negative) options.negativePrompt = parsed.negative;
  if (parsed.count) options.numberOfImages = parseInt(parsed.count);
  if (parsed.guidance) options.guidanceScale = parseFloat(parsed.guidance);
  if (parsed.seed) options.seed = parseInt(parsed.seed);
  if (parsed.mode) options.editMode = parsed.mode;

  return { inputPath, prompt, maskPath: parsed.mask, options };
}

const apiKey = getApiKey();
const { inputPath, prompt, maskPath, options } = parseArgs();

const imageData = await loadImage(inputPath);
const maskData = maskPath ? await loadImage(maskPath) : undefined;

console.error("✏️  Editing image...\n");
const result: GeminiImageResult = await callGeminiEdit(
  apiKey,
  prompt,
  imageData,
  maskData,
  options
);

const outputPath = args.find(a => a === "--output")
  ? args[args.indexOf("--output") + 1]
  : undefined;

for (let i = 0; i < result.images.length; i++) {
  const img = result.images[i];
  const finalPath = outputPath && result.images.length > 1
    ? outputPath.replace(/(\.\w+)$/, `_${i + 1}$1`)
    : outputPath;
  const savedPath = await saveImage(img.data, img.mimeType, finalPath);
  console.log(`✓ Saved: ${savedPath}`);
}

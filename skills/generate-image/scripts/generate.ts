#!/usr/bin/env bun
import { writeFile } from "fs/promises";
import { callGeminiImage, type GeminiImageResult } from "../../../utils";

const args = process.argv.slice(2);

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }
  return apiKey;
}

function parseArgs(): { prompt: string; options: any } {
  const parsed: Record<string, any> = { _: [] };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        parsed[key] = nextArg;
        i++;
      } else {
        parsed[key] = true;
      }
    } else {
      parsed._.push(arg);
    }
  }

  const prompt = parsed._.join(" ");
  if (!prompt) {
    console.error("Error: Prompt required");
    console.error("Usage: bun run generate.ts \"prompt\" [options]");
    process.exit(1);
  }

  const sizeMap: Record<string, any> = {
    "1K": "SIZE_1024",
    "2K": "SIZE_2048",
    "4K": "SIZE_4096",
  };

  const aspectMap: Record<string, any> = {
    "1:1": "RATIO_1_1",
    "16:9": "RATIO_16_9",
    "9:16": "RATIO_9_16",
    "4:3": "RATIO_4_3",
    "3:4": "RATIO_3_4",
  };

  const options: any = {};
  if (parsed.size) options.imageSize = sizeMap[parsed.size];
  if (parsed.aspect) options.aspectRatio = aspectMap[parsed.aspect];
  if (parsed.negative) options.negativePrompt = parsed.negative;
  if (parsed.count) options.numberOfImages = parseInt(parsed.count);
  if (parsed.guidance) options.guidanceScale = parseFloat(parsed.guidance);
  if (parsed.seed) options.seed = parseInt(parsed.seed);

  return { prompt, options };
}

async function saveImage(data: string, mimeType: string, outputPath?: string): Promise<string> {
  const ext = mimeType.split("/")[1] || "png";
  const path = outputPath || `output_${Date.now()}.${ext}`;
  const buffer = Buffer.from(data, "base64");
  await writeFile(path, buffer);
  return path;
}

const apiKey = getApiKey();
const { prompt, options } = parseArgs();

console.error("🎨 Generating image...\n");
const result: GeminiImageResult = await callGeminiImage(apiKey, prompt, options);

if (result.text) {
  console.log(`Model comment: ${result.text}\n`);
}

for (let i = 0; i < result.images.length; i++) {
  const img = result.images[i];
  const outputPath = args.find(a => a === "--output")
    ? args[args.indexOf("--output") + 1]
    : undefined;
  const finalPath = outputPath && result.images.length > 1
    ? outputPath.replace(/(\.\w+)$/, `_${i + 1}$1`)
    : outputPath;
  const savedPath = await saveImage(img.data, img.mimeType, finalPath);
  console.log(`✓ Saved: ${savedPath}`);
}

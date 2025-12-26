#!/usr/bin/env bun
import { readFile, writeFile } from "fs/promises";
import {
  callGemini,
  callGeminiWithMessages,
  callGeminiImage,
  callGeminiUpscale,
  callGeminiEdit,
  callGeminiSvg,
  callGeminiSegment,
  type GeminiResult,
  type GeminiImageResult,
  type GeminiSvgResult,
  type GeminiSegmentResult,
} from "../../../utils";
import type { Image } from "@google/genai";

const args = process.argv.slice(2);
const command = args[0];

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    console.error("\nGet an API key from: https://aistudio.google.com/apikey");
    console.error("\nThen add to your environment:");
    console.error('  export GEMINI_API_KEY="your-api-key-here"');
    process.exit(1);
  }
  return apiKey;
}

function showHelp() {
  console.log(`
Gemini Operations CLI

Usage: bun run gemini.ts <command> [options]

Commands:
  generate <prompt>              Generate text content
  image <prompt> [options]       Generate images
  upscale <input> [options]      Upscale an image
  edit <input> <prompt> [opts]   Edit an image
  svg <prompt>                   Generate SVG
  segment <input>                Segment image objects

Text Generation:
  bun run gemini.ts generate "your prompt"
    --model <model>              Model name (default: gemini-3-pro-preview)
    --instructions <text>        System instructions
    --max-tokens <n>             Max output tokens
    --temperature <n>            Temperature (0.0-1.0)

Image Generation:
  bun run gemini.ts image "a sunset over mountains"
    --size <size>                Image size: 1K, 2K, 4K (default: 2K)
    --aspect <ratio>             Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4
    --negative <prompt>          Negative prompt
    --count <n>                  Number of images (1-4)
    --guidance <n>               Guidance scale
    --seed <n>                   Random seed
    --input <path>               Input image for img2img
    --output <path>              Output path (default: output_<timestamp>.png)

Upscale:
  bun run gemini.ts upscale input.png
    --factor <x2|x4>             Upscale factor (default: x2)
    --format <fmt>               Output format: png, jpeg, webp
    --quality <n>                JPEG quality (1-100)
    --output <path>              Output path

Edit:
  bun run gemini.ts edit input.png "add a sunset sky"
    --mask <path>                Mask image
    --mode <mode>                Edit mode: inpaint, outpaint
    --format <fmt>               Output format: png, jpeg, webp
    --quality <n>                JPEG quality (1-100)
    --negative <prompt>          Negative prompt
    --count <n>                  Number of images
    --guidance <n>               Guidance scale
    --seed <n>                   Random seed
    --output <path>              Output path

SVG:
  bun run gemini.ts svg "minimalist mountain logo"
    --instructions <text>        Custom system instructions
    --output <path>              Output path (default: output.svg)

Segment:
  bun run gemini.ts segment input.png
    --prompt <text>              Custom segmentation prompt
    --output <dir>               Output directory for masks

Examples:
  bun run gemini.ts generate "Explain quantum computing"
  bun run gemini.ts image "cyberpunk cityscape" --size 4K --aspect 16:9
  bun run gemini.ts upscale photo.png --factor x4 --output hires.png
  bun run gemini.ts edit scene.png "replace sky with stars" --mode inpaint
  bun run gemini.ts svg "geometric pattern" --output logo.svg
  bun run gemini.ts segment photo.png --output ./masks
`);
}

function parseArgs(startIndex: number): Record<string, any> {
  const parsed: Record<string, any> = { _: [] };
  for (let i = startIndex; i < args.length; i++) {
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
  return parsed;
}

async function saveImage(
  data: string,
  mimeType: string,
  outputPath?: string
): Promise<string> {
  const ext = mimeType.split("/")[1] || "png";
  const path = outputPath || `output_${Date.now()}.${ext}`;
  const buffer = Buffer.from(data, "base64");
  await writeFile(path, buffer);
  return path;
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

async function handleGenerate() {
  const parsed = parseArgs(1);
  const prompt = parsed._.join(" ");
  if (!prompt) {
    console.error("Error: Prompt required");
    process.exit(1);
  }

  const apiKey = getApiKey();
  const result: GeminiResult = await callGemini(apiKey, prompt, {
    model: parsed.model,
    instructions: parsed.instructions,
    maxTokens: parsed["max-tokens"] ? parseInt(parsed["max-tokens"]) : undefined,
    temperature: parsed.temperature ? parseFloat(parsed.temperature) : undefined,
  });

  console.log(result.content);
  if (result.usage) {
    console.log(`\n---`);
    console.log(
      `Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`
    );
  }
}

async function handleImage() {
  const parsed = parseArgs(1);
  const prompt = parsed._.join(" ");
  if (!prompt) {
    console.error("Error: Prompt required");
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
  if (parsed.input) options.inputImage = await loadImage(parsed.input);

  console.error("🎨 Generating image...\n");
  const apiKey = getApiKey();
  const result: GeminiImageResult = await callGeminiImage(apiKey, prompt, options);

  if (result.text) {
    console.log(`Model comment: ${result.text}\n`);
  }

  for (let i = 0; i < result.images.length; i++) {
    const img = result.images[i];
    const outputPath = parsed.output
      ? result.images.length > 1
        ? parsed.output.replace(/(\.\w+)$/, `_${i + 1}$1`)
        : parsed.output
      : undefined;
    const savedPath = await saveImage(img.data, img.mimeType, outputPath);
    console.log(`✓ Saved: ${savedPath}`);
  }

  if (result.usage) {
    console.log(`\n---`);
    console.log(
      `Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`
    );
  }
}

async function handleUpscale() {
  const parsed = parseArgs(1);
  const inputPath = parsed._[0];
  if (!inputPath) {
    console.error("Error: Input image path required");
    process.exit(1);
  }

  const imageData = await loadImage(inputPath);
  const options: any = {};
  if (parsed.factor) options.upscaleFactor = parsed.factor;
  if (parsed.format) options.outputFormat = parsed.format;
  if (parsed.quality) options.jpegQuality = parseInt(parsed.quality);

  console.error("🔍 Upscaling image...\n");
  const apiKey = getApiKey();
  const result: GeminiImageResult = await callGeminiUpscale(apiKey, imageData, options);

  for (let i = 0; i < result.images.length; i++) {
    const img = result.images[i];
    const outputPath = parsed.output || `upscaled_${Date.now()}.png`;
    const savedPath = await saveImage(img.data, img.mimeType, outputPath);
    console.log(`✓ Saved: ${savedPath}`);
  }
}

async function handleEdit() {
  const parsed = parseArgs(1);
  const inputPath = parsed._[0];
  const prompt = parsed._.slice(1).join(" ");

  if (!inputPath || !prompt) {
    console.error("Error: Input image and prompt required");
    process.exit(1);
  }

  const imageData = await loadImage(inputPath);
  const maskData = parsed.mask ? await loadImage(parsed.mask) : undefined;

  const options: any = {};
  if (parsed.format) options.outputFormat = parsed.format;
  if (parsed.quality) options.jpegQuality = parseInt(parsed.quality);
  if (parsed.negative) options.negativePrompt = parsed.negative;
  if (parsed.count) options.numberOfImages = parseInt(parsed.count);
  if (parsed.guidance) options.guidanceScale = parseFloat(parsed.guidance);
  if (parsed.seed) options.seed = parseInt(parsed.seed);
  if (parsed.mode) options.editMode = parsed.mode;

  console.error("✏️  Editing image...\n");
  const apiKey = getApiKey();
  const result: GeminiImageResult = await callGeminiEdit(
    apiKey,
    prompt,
    imageData,
    maskData,
    options
  );

  for (let i = 0; i < result.images.length; i++) {
    const img = result.images[i];
    const outputPath = parsed.output
      ? result.images.length > 1
        ? parsed.output.replace(/(\.\w+)$/, `_${i + 1}$1`)
        : parsed.output
      : undefined;
    const savedPath = await saveImage(img.data, img.mimeType, outputPath);
    console.log(`✓ Saved: ${savedPath}`);
  }
}

async function handleSvg() {
  const parsed = parseArgs(1);
  const prompt = parsed._.join(" ");
  if (!prompt) {
    console.error("Error: Prompt required");
    process.exit(1);
  }

  console.error("🎨 Generating SVG...\n");
  const apiKey = getApiKey();
  const result: GeminiSvgResult = await callGeminiSvg(apiKey, prompt, {
    instructions: parsed.instructions,
  });

  const outputPath = parsed.output || "output.svg";
  await writeFile(outputPath, result.svg);
  console.log(`✓ Saved: ${outputPath}`);

  if (result.usage) {
    console.log(`\n---`);
    console.log(
      `Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`
    );
  }
}

async function handleSegment() {
  const parsed = parseArgs(1);
  const inputPath = parsed._[0];
  if (!inputPath) {
    console.error("Error: Input image path required");
    process.exit(1);
  }

  const imageData = await loadImage(inputPath);
  console.error("🔍 Segmenting image...\n");
  const apiKey = getApiKey();
  const result: GeminiSegmentResult = await callGeminiSegment(
    apiKey,
    imageData,
    parsed.prompt
  );

  console.log(`Found ${result.masks.length} objects:\n`);
  for (let i = 0; i < result.masks.length; i++) {
    const mask = result.masks[i];
    console.log(`${i + 1}. ${mask.label}`);
    console.log(`   Box: [${mask.box_2d.join(", ")}]`);

    if (parsed.output) {
      const outputDir = parsed.output;
      await writeFile(
        `${outputDir}/mask_${i + 1}_${mask.label.replace(/\s+/g, "_")}.png`,
        Buffer.from(mask.mask, "base64")
      );
    }
  }

  if (parsed.output) {
    console.log(`\n✓ Saved ${result.masks.length} masks to: ${parsed.output}`);
  }

  if (result.usage) {
    console.log(`\n---`);
    console.log(
      `Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`
    );
  }
}

// Main command router
if (!command || command === "help" || command === "--help") {
  showHelp();
  process.exit(0);
}

try {
  switch (command) {
    case "generate":
      await handleGenerate();
      break;
    case "image":
      await handleImage();
      break;
    case "upscale":
      await handleUpscale();
      break;
    case "edit":
      await handleEdit();
      break;
    case "svg":
      await handleSvg();
      break;
    case "segment":
      await handleSegment();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "bun run gemini.ts help" for usage');
      process.exit(1);
  }
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}

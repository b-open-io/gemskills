#!/usr/bin/env bun
import { GoogleGenAI } from "@google/genai";
import { readFile } from "fs/promises";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("Error: GEMINI_API_KEY environment variable is not set.");
  console.error("\nGet an API key from: https://aistudio.google.com/apikey");
  console.error("\nThen add to your environment:");
  console.error('  export GEMINI_API_KEY="your-api-key-here"');
  process.exit(1);
}

const args = process.argv.slice(2);
const imagePaths: string[] = [];
let prompt: string;

// Parse arguments - collect all images (up to 10)
let i = 0;
while (i < args.length) {
  if (args[i] === '--image' || args[i] === '-i') {
    // Next arg should be image path
    if (i + 1 < args.length) {
      imagePaths.push(args[i + 1]);
      i += 2;
    } else {
      i++;
    }
  } else if (args[i]?.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i)) {
    // Auto-detect image by extension
    imagePaths.push(args[i]);
    i++;
  } else {
    // Everything else is part of the prompt
    prompt = args.slice(i).join(" ");
    break;
  }
}

if (!prompt) {
  console.error("Usage: bun run ask_gemini.ts [--image <path>]... <your question>");
  console.error("\nExamples:");
  console.error("  bun run ask_gemini.ts 'What is the best color scheme for web3 sites?'");
  console.error("  bun run ask_gemini.ts --image screenshot.png 'Analyze this design'");
  console.error("  bun run ask_gemini.ts screenshot.png 'What Three.js elements are shown?'");
  console.error("  bun run ask_gemini.ts --image current.png --image target.png 'Compare these designs'");
  console.error("  bun run ask_gemini.ts current.png target.png 'What are the differences?'");
  console.error("\nSupports up to 10 images per request.");
  process.exit(1);
}

if (imagePaths.length > 10) {
  console.error("Error: Maximum 10 images supported per request.");
  console.error(`You provided ${imagePaths.length} images.`);
  process.exit(1);
}

function getMimeType(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  const types: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp'
  };
  return types[ext || ''] || 'image/png';
}

async function askGemini(question: string, imageFilePaths: string[]) {
  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  // Add all images if provided
  if (imageFilePaths.length > 0) {
    console.error(`📷 Attaching ${imageFilePaths.length} image(s)...\n`);
    for (const imageFilePath of imageFilePaths) {
      try {
        const imageBuffer = await readFile(imageFilePath);
        const mimeType = getMimeType(imageFilePath);
        parts.push({
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType
          }
        });
        console.error(`   ✓ ${imageFilePath}`);
      } catch (error) {
        console.error(`   ✗ Error reading ${imageFilePath}: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }
    console.error('');
  }

  // Add text prompt after images
  parts.push({ text: question });

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ role: 'user', parts }],
    config: {
      temperature: 0.7,
    }
  });

  let content = '';
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) content += part.text;
    }
  }

  console.log(content);

  if (response.usageMetadata) {
    console.log(`\n---`);
    console.log(`Tokens: ${response.usageMetadata.promptTokenCount} prompt, ${response.usageMetadata.candidatesTokenCount} completion, ${response.usageMetadata.totalTokenCount} total`);
  }
}

await askGemini(prompt, imagePaths);

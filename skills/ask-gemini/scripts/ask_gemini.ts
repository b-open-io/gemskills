#!/usr/bin/env bun
import { resolve } from "path";
import { readFile } from "fs/promises";
import { GoogleGenAI } from "@google/genai";
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
const { callGemini, getTextModel } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils");
const { getApiKey, getMimeType, parseArgs } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");

const apiKey = getApiKey();

const { positional, multi } = parseArgs(undefined, ["image"]);

// Also auto-detect image files from positional args
const imagePaths: string[] = [...multi.image];
const promptParts: string[] = [];

for (const arg of positional) {
  if (arg.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i)) {
    imagePaths.push(arg);
  } else {
    promptParts.push(arg);
  }
}

const prompt = promptParts.join(" ");

if (!prompt) {
  console.error("Usage: bun run ask_gemini.ts [--image <path>]... <your question>");
  console.error("\nExamples:");
  console.error("  bun run ask_gemini.ts 'What is the best color scheme for web3 sites?'");
  console.error("  bun run ask_gemini.ts --image screenshot.png 'Analyze this design'");
  console.error("  bun run ask_gemini.ts screenshot.png 'What Three.js elements are shown?'");
  console.error("  bun run ask_gemini.ts --image current.png --image target.png 'Compare these designs'");
  console.error("\nSupports up to 10 images per request.");
  process.exit(1);
}

if (imagePaths.length > 10) {
  console.error(`Error: Maximum 10 images supported per request. You provided ${imagePaths.length}.`);
  process.exit(1);
}

// If no images, use the simpler callGemini text wrapper
if (imagePaths.length === 0) {
  const result = await callGemini(apiKey, prompt);
  console.log(result.content);
  if (result.usage) {
    console.log(`\n---`);
    console.log(`Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`);
  }
} else {
  // With images, use direct API call (callGemini doesn't support image parts)
  console.error(`Attaching ${imagePaths.length} image(s)...\n`);
  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  for (const imagePath of imagePaths) {
    try {
      const imageBuffer = await readFile(imagePath);
      parts.push({
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType: getMimeType(imagePath),
        },
      });
      console.error(`   ✓ ${imagePath}`);
    } catch (error) {
      console.error(`   ✗ Error reading ${imagePath}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  console.error("");

  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: getTextModel(),
    contents: [{ role: "user", parts }],
    config: { temperature: 0.7 },
  });

  let content = "";
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

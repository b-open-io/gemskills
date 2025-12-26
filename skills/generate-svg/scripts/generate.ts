#!/usr/bin/env bun
import { writeFile } from "fs/promises";
import { callGeminiSvg, type GeminiSvgResult } from "../../../utils";

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

  const options: any = {};
  if (parsed.instructions) options.instructions = parsed.instructions;

  return { prompt, options };
}

const apiKey = getApiKey();
const { prompt, options } = parseArgs();

console.error("🎨 Generating SVG...\n");
const result: GeminiSvgResult = await callGeminiSvg(apiKey, prompt, options);

const outputPath = args.find(a => a === "--output")
  ? args[args.indexOf("--output") + 1]
  : "output.svg";

await writeFile(outputPath, result.svg);
console.log(`✓ Saved: ${outputPath}`);

if (result.usage) {
  console.log(`\n---`);
  console.log(
    `Tokens: ${result.usage.promptTokens} prompt, ${result.usage.completionTokens} completion, ${result.usage.totalTokens} total`
  );
}

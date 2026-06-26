#!/usr/bin/env bun
/**
 * DEV-ONLY benchmark harness — NOT shipped (excluded via package.json "files").
 *
 * Purpose: tune the per-provider prompt templates (providers/prompts/*.md) by
 * running the same logical prompt(s) through each image provider and producing a
 * side-by-side contact sheet + results.json (provider, model, latency, cost).
 * Eyeball the sheet, edit the prompt template, bump its `version`, re-run.
 *
 * Usage:
 *   bun run dev/benchmark.ts "a red maple leaf on white" [--providers openai,xai,gemini] [--out dir]
 *   bun run dev/benchmark.ts --file dev/prompts.json
 *
 * prompts.json: { "prompts": [{ "id": "leaf", "prompt": "..." }, ...] }
 */
import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";
import { openaiImage } from "../providers/openai";
import { xaiImage } from "../providers/xai";
import { hasKey } from "../providers/keys";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const providers = (flag("providers") || "openai,xai,gemini").split(",").map((s) => s.trim());
const outDir = flag("out") || resolve("dev/bench-output", `${stamp()}`);
const file = flag("file");

function stamp(): string {
  // Date.* is fine here — dev tool, not a workflow.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

interface PromptItem { id: string; prompt: string }
let items: PromptItem[];
if (file) {
  const data = JSON.parse(await Bun.file(file).text());
  items = data.prompts;
} else {
  const valueFlags = new Set(["providers", "out", "file"]);
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) { if (valueFlags.has(args[i].slice(2))) i++; continue; }
    positional.push(args[i]);
  }
  const prompt = positional.join(" ");
  if (!prompt) { console.error("Provide a prompt or --file <json>"); process.exit(1); }
  items = [{ id: "p1", prompt }];
}

await mkdir(outDir, { recursive: true });

interface Row { id: string; prompt: string; provider: string; model?: string; path?: string; ms: number; costUsd?: number; error?: string }
const rows: Row[] = [];

for (const item of items) {
  for (const provider of providers) {
    if (!hasKey(provider as any)) { console.error(`Skipping ${provider} (no key)`); continue; }
    const out = resolve(outDir, `${item.id}.${provider}.png`);
    const t0 = Date.now();
    try {
      let model: string | undefined;
      let costUsd: number | undefined;
      if (provider === "openai") {
        const r = await openaiImage(item.prompt, { quality: "medium", outputPath: out });
        model = r.model; costUsd = r.costUsd;
      } else if (provider === "xai") {
        const r = await xaiImage(item.prompt, { outputPath: out });
        model = r.model; costUsd = r.costUsd;
      } else if (provider === "gemini") {
        const { callGeminiImage } = await import("../utils");
        const { getApiKey } = await import("../shared");
        const r = await callGeminiImage(getApiKey(), item.prompt, { imageSize: "1K" });
        if (r.images[0]) { await Bun.write(out, Buffer.from(r.images[0].data, "base64")); model = "gemini-3-pro-image"; }
      }
      rows.push({ id: item.id, prompt: item.prompt, provider, model, path: out, ms: Date.now() - t0, costUsd });
      console.error(`✓ ${item.id} / ${provider} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      rows.push({ id: item.id, prompt: item.prompt, provider, ms: Date.now() - t0, error: (e as Error).message });
      console.error(`✗ ${item.id} / ${provider}: ${(e as Error).message}`);
    }
  }
}

await writeFile(resolve(outDir, "results.json"), JSON.stringify(rows, null, 2));

// Minimal HTML contact sheet grouped by prompt.
const byId = new Map<string, Row[]>();
for (const r of rows) { (byId.get(r.id) || byId.set(r.id, []).get(r.id)!).push(r); }
let html = `<!doctype html><meta charset=utf8><title>gemskills bench</title><style>body{font:14px system-ui;background:#111;color:#eee;padding:20px}img{max-width:320px;border:1px solid #333;border-radius:8px}.g{display:flex;gap:16px;flex-wrap:wrap;margin:8px 0 28px}figure{margin:0}figcaption{font-size:12px;color:#aaa;margin-top:4px}h3{margin:24px 0 4px}</style>`;
for (const [id, rs] of byId) {
  html += `<h3>${id}</h3><div style=color:#888>${rs[0].prompt}</div><div class=g>`;
  for (const r of rs) {
    html += r.error
      ? `<figure><div style="width:320px;height:180px;display:flex;align-items:center;justify-content:center;border:1px solid #533;color:#f88">${r.provider}: ${r.error}</div></figure>`
      : `<figure><img src="file://${r.path}"><figcaption>${r.provider} · ${r.model || ""} · ${(r.ms/1000).toFixed(1)}s${r.costUsd != null ? ` · $${r.costUsd.toFixed(4)}` : ""}</figcaption></figure>`;
  }
  html += `</div>`;
}
const sheet = resolve(outDir, "index.html");
await writeFile(sheet, html);
console.log(`\nResults: ${outDir}\nContact sheet: ${sheet}`);

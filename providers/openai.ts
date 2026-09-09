/**
 * OpenAI image provider — direct api.openai.com integration (raw fetch, no SDK).
 *
 * Verified live (September 2026): gpt-image-2.5-flare (default),
 * gpt-image-2.5-sunburst (opt-in). Direct API ids only — never prefix openai/.
 *
 * - Generate: POST /v1/images/generations (JSON) → { data:[{b64_json}], usage }
 *   GPT image models ALWAYS return b64_json (never a URL).
 * - Edit:     POST /v1/images/edits (multipart/form-data) → { data:[{b64_json}], usage }
 *   Up to 16 input images; optional mask (transparent areas = edit region).
 *
 * Image 2.5 supports transparent backgrounds (background=transparent).
 * input_fidelity is not configurable. Sizes: 1024x1024, 1536x1024, 1024x1536,
 * auto, or custom.
 */

import { readFile } from "fs/promises";
import { getOpenAIKey } from "./keys";
import { getMimeType, saveImage } from "../shared";
import type { Provider } from "./keys";
import type { ProviderImageResult } from "./types";

const OPENAI_BASE = "https://api.openai.com/v1";

export const OPENAI_IMAGE_VARIANTS = {
  flare: "gpt-image-2.5-flare",
  sunburst: "gpt-image-2.5-sunburst",
} as const;

const VARIANT_IDS = new Set<string>(Object.values(OPENAI_IMAGE_VARIANTS));
const VARIANT_ALIASES = new Set<string>([...Object.keys(OPENAI_IMAGE_VARIANTS), ...VARIANT_IDS]);
const LEGACY_PROVIDER_ALIASES = new Set(["gemini", "openai", "xai", "grok"]);

/** Strip docs-only gateway prefix so it never reaches the API or env default. */
function stripGateway(id: string): string {
  return id.startsWith("openai/") ? id.slice("openai/".length) : id;
}

export function isOpenAIImageVariant(input?: string): boolean {
  if (!input) return false;
  return VARIANT_ALIASES.has(stripGateway(input.trim()).toLowerCase());
}

/** Resolve flare/sunburst aliases or a direct API id. Never returns `openai/`. */
export function resolveOpenAIImageModel(input?: string): string {
  const raw = stripGateway((input ?? process.env.OPENAI_IMAGE_MODEL ?? OPENAI_IMAGE_VARIANTS.flare).trim());
  const key = raw.toLowerCase();
  if (key === "flare" || key === "sunburst") return OPENAI_IMAGE_VARIANTS[key];
  return raw;
}

export const OPENAI_IMAGE_MODEL = resolveOpenAIImageModel();

export function resolveImageModelFlag(model?: string): {
  provider?: Provider;
  openaiModel?: string;
  deprecatedAlias?: boolean;
} {
  if (!model) return {};
  if (isOpenAIImageVariant(model)) {
    return { provider: "openai", openaiModel: resolveOpenAIImageModel(model) };
  }
  const alias = model.toLowerCase();
  if (LEGACY_PROVIDER_ALIASES.has(alias)) {
    return {
      provider: (alias === "grok" ? "xai" : alias) as Provider,
      deprecatedAlias: true,
    };
  }
  return {};
}

/** Image-output token price ($/1M). Estimate only — see costUsd note. */
const OPENAI_IMAGE_OUTPUT_PER_M = 30;

type Size = "1024x1024" | "1536x1024" | "1024x1536" | "auto" | (string & {});

/** Map gemskills aspect ratios to the nearest supported gpt-image size. */
export function aspectToSize(aspect?: string): Size {
  switch (aspect) {
    case "16:9":
    case "4:3":
      return "1536x1024";
    case "9:16":
    case "3:4":
      return "1024x1536";
    case "1:1":
      return "1024x1024";
    default:
      return "auto";
  }
}

async function parseOrThrow(res: Response, where: string): Promise<any> {
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: { message: text } };
  }
  if (!res.ok || json?.error) {
    const e = json?.error;
    const msg = e?.message || json?.message || `HTTP ${res.status}`;
    const code = e?.code ? ` [${e.code}]` : "";
    throw new Error(`OpenAI ${where}: ${msg}${code}`);
  }
  return json;
}

function estimateCostUsd(json: any): number | undefined {
  const imgTokens = json?.usage?.output_tokens_details?.image_tokens;
  if (typeof imgTokens !== "number") return undefined;
  return (imgTokens / 1_000_000) * OPENAI_IMAGE_OUTPUT_PER_M;
}

async function saveAll(json: any, outputPath: string | undefined, format: string): Promise<string[]> {
  const data: Array<{ b64_json?: string }> = json.data || [];
  if (!data.length) throw new Error("OpenAI returned no images");
  const mime = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
  const paths: string[] = [];
  for (let i = 0; i < data.length; i++) {
    if (!data[i].b64_json) throw new Error("OpenAI image item missing b64_json");
    const out =
      data.length > 1 && outputPath ? outputPath.replace(/(\.[^.]+)$/, `-${i + 1}$1`) : outputPath;
    paths.push(await saveImage(data[i].b64_json!, mime, out, "openai"));
  }
  return paths;
}

// ── Generate (text-to-image) ───────────────────────────────────────

export async function openaiImage(
  prompt: string,
  options: {
    model?: string;
    n?: number;
    size?: Size;
    aspect?: string;
    quality?: "low" | "medium" | "high" | "auto";
    background?: "opaque" | "auto" | "transparent";
    outputFormat?: "png" | "jpeg" | "webp";
    outputPath?: string;
  } = {}
): Promise<ProviderImageResult> {
  const key = getOpenAIKey();
  const model = resolveOpenAIImageModel(options.model);
  const format = options.outputFormat || "png";
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: options.n ?? 1,
    size: options.size || aspectToSize(options.aspect),
    quality: options.quality || "auto",
    output_format: format,
  };
  if (options.background) body.background = options.background;

  console.error(`Generating image with ${model} (OpenAI)...`);
  const start = Date.now();
  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await parseOrThrow(res, "images/generations");
  const paths = await saveAll(json, options.outputPath, format);
  console.error(`Generated in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  return { paths, provider: "openai", model, costUsd: estimateCostUsd(json) };
}

// ── Edit (inpainting / multi-image compose) ────────────────────────

export async function openaiEdit(
  prompt: string,
  options: {
    images: string[]; // one or more source image paths (up to 16)
    mask?: string; // optional PNG mask path
    model?: string;
    size?: Size;
    aspect?: string;
    quality?: "low" | "medium" | "high" | "auto";
    background?: "opaque" | "auto" | "transparent";
    outputFormat?: "png" | "jpeg" | "webp";
    outputPath?: string;
  }
): Promise<ProviderImageResult> {
  const key = getOpenAIKey();
  const model = resolveOpenAIImageModel(options.model);
  const format = options.outputFormat || "png";

  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", options.size || aspectToSize(options.aspect));
  form.set("quality", options.quality || "auto");
  form.set("output_format", format);
  for (const p of options.images) {
    const buf = await readFile(p);
    form.append("image[]", new Blob([buf], { type: getMimeType(p) }), p.split("/").pop());
  }
  if (options.mask) {
    const m = await readFile(options.mask);
    form.set("mask", new Blob([m], { type: "image/png" }), "mask.png");
  }
  if (options.background) form.set("background", options.background);

  console.error(`Editing image with ${model} (OpenAI)...`);
  const start = Date.now();
  const res = await fetch(`${OPENAI_BASE}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` }, // let fetch set multipart boundary
    body: form,
  });
  const json = await parseOrThrow(res, "images/edits");
  const paths = await saveAll(json, options.outputPath, format);
  console.error(`Edited in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  return { paths, provider: "openai", model, costUsd: estimateCostUsd(json) };
}

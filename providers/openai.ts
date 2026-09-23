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
 * input_fidelity is rejected by Image 2.5 (invalid_input_fidelity_model), so it is never sent.
 *
 * Size rules (docs + live probes, 2026-09-23): "auto", or WIDTHxHEIGHT with both edges
 * divisible by 16, aspect between 1:3 and 3:1, max edge 3840, total pixels 655,360..8,294,400.
 * Quality: low | medium | high | xhigh | max | auto (xhigh and max are new in 2.5).
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

export type OpenAIQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";
export const OPENAI_QUALITIES: readonly OpenAIQuality[] = ["low", "medium", "high", "xhigh", "max", "auto"];

/** Parse --quality for openai. Missing → "auto"; anything else outside the enum throws. */
export function parseOpenAIQuality(value?: string): OpenAIQuality {
  if (value === undefined) return "auto";
  if ((OPENAI_QUALITIES as readonly string[]).includes(value)) return value as OpenAIQuality;
  throw new Error(`Invalid --quality "${value}". Valid: ${OPENAI_QUALITIES.join(", ")}.`);
}

const SIZE_MULTIPLE = 16;
const MAX_EDGE = 3840;
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;
const MAX_RATIO = 3;

/** Pixel budget per --size tier. 4K is the documented maximum (3840x2160). */
const TIER_PIXELS = { "1K": 1024 * 1024, "2K": 2560 * 1440, "4K": MAX_PIXELS } as const;
export type OpenAISizeTier = keyof typeof TIER_PIXELS;

/** Throw with the violated rule if WxH is not accepted by Image 2.5. */
export function checkOpenAISize(width: number, height: number): void {
  const label = `${width}x${height}`;
  if (width % SIZE_MULTIPLE || height % SIZE_MULTIPLE) {
    throw new Error(`Invalid size ${label}: both edges must be divisible by ${SIZE_MULTIPLE}.`);
  }
  if (Math.max(width, height) > MAX_EDGE) {
    throw new Error(`Invalid size ${label}: max edge is ${MAX_EDGE}.`);
  }
  if (Math.max(width, height) / Math.min(width, height) > MAX_RATIO) {
    throw new Error(`Invalid size ${label}: aspect must be between 1:${MAX_RATIO} and ${MAX_RATIO}:1.`);
  }
  const pixels = width * height;
  if (pixels < MIN_PIXELS || pixels > MAX_PIXELS) {
    throw new Error(`Invalid size ${label}: total pixels must be ${MIN_PIXELS}..${MAX_PIXELS} (got ${pixels}).`);
  }
}

function parseAspect(aspect: string): number {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect);
  if (!m) throw new Error(`Invalid --aspect "${aspect}". Use W:H, for example 3:1.`);
  const ratio = Number(m[1]) / Number(m[2]);
  if (ratio > MAX_RATIO || ratio < 1 / MAX_RATIO) {
    throw new Error(`Invalid --aspect "${aspect}": openai accepts 1:${MAX_RATIO} to ${MAX_RATIO}:1.`);
  }
  return ratio;
}

const floorTo = (n: number) => Math.floor(n / SIZE_MULTIPLE) * SIZE_MULTIPLE;

/**
 * Resolve --size / --aspect into the API size string.
 * --size WxH is sent as given (and cannot be combined with --aspect).
 * --size 1K|2K|4K sets the pixel budget; --aspect sets the shape (default 1:1).
 * Neither flag → "auto".
 */
export function resolveOpenAISize(size?: string, aspect?: string): string {
  if (size && /^\d+x\d+$/.test(size)) {
    if (aspect) throw new Error("Use --size WxH or --aspect, not both.");
    const [w, h] = size.split("x").map(Number);
    checkOpenAISize(w, h);
    return size;
  }
  if (size && !(size in TIER_PIXELS)) {
    throw new Error(`Invalid --size "${size}". Use 1K, 2K, 4K, or WxH (for example 3840x1280).`);
  }
  if (!size && !aspect) return "auto";
  const pixels = TIER_PIXELS[(size ?? "1K") as OpenAISizeTier];
  const ratio = aspect ? parseAspect(aspect) : 1;
  // Round the short edge first, then derive the long edge, so rounding never widens the ratio.
  const longOverShort = Math.max(ratio, 1 / ratio);
  let short = floorTo(Math.sqrt(pixels / longOverShort));
  let long = floorTo(short * longOverShort);
  if (long > MAX_EDGE) {
    short = floorTo(MAX_EDGE / longOverShort);
    long = floorTo(short * longOverShort);
  }
  const [width, height] = ratio >= 1 ? [long, short] : [short, long];
  checkOpenAISize(width, height);
  return `${width}x${height}`;
}

/** USD per 1M tokens, from https://platform.openai.com/docs/pricing (checked 2026-09-23). */
const IMAGE_2_5_PRICE = { textInput: 5, imageInput: 8, imageOutput: 30 };
const PRICES_PER_M: Record<string, typeof IMAGE_2_5_PRICE> = {
  "gpt-image-2.5-flare": IMAGE_2_5_PRICE,
  "gpt-image-2.5-flare-2026-09-08": IMAGE_2_5_PRICE,
  "gpt-image-2.5-sunburst": IMAGE_2_5_PRICE,
  "gpt-image-2.5-sunburst-2026-09-08": IMAGE_2_5_PRICE,
};

type Size = "auto" | (string & {});

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

/** Cost from the response usage. undefined when the model has no entry in PRICES_PER_M. */
function estimateCostUsd(model: string, json: any): number | undefined {
  const price = PRICES_PER_M[model];
  if (!price) return undefined;
  const u = json?.usage;
  if (!u) throw new Error("OpenAI response has no usage block");
  const textIn = u.input_tokens_details?.text_tokens ?? 0;
  const imageIn = u.input_tokens_details?.image_tokens ?? 0;
  const imageOut = u.output_tokens_details?.image_tokens ?? 0;
  return (textIn * price.textInput + imageIn * price.imageInput + imageOut * price.imageOutput) / 1_000_000;
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
    quality?: OpenAIQuality;
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
    size: options.size ?? "auto",
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
  return { paths, provider: "openai", model, costUsd: estimateCostUsd(model, json) };
}

// ── Edit (inpainting / multi-image compose) ────────────────────────

export async function openaiEdit(
  prompt: string,
  options: {
    images: string[]; // one or more source image paths (up to 16)
    mask?: string; // optional PNG mask path
    model?: string;
    size?: Size;
    quality?: OpenAIQuality;
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
  form.set("size", options.size ?? "auto");
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
  return { paths, provider: "openai", model, costUsd: estimateCostUsd(model, json) };
}

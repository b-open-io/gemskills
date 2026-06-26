/**
 * xAI (Grok Imagine) provider — direct api.x.ai integration.
 *
 * Verified live (June 2026):
 * - Image:  POST /v1/images/generations  (synchronous)
 *           → { data: [{ url, mime_type }], usage: { cost_in_usd_ticks } }
 *           models: grok-imagine-image, grok-imagine-image-quality
 * - Video:  POST /v1/videos/generations  → { request_id }
 *           poll GET /v1/videos/{id}      → { status, progress, video:{url,duration}, usage }
 *           grok-imagine-video      (v1)  : text-to-video (and i2v)
 *           grok-imagine-video-1.5        : image-to-video ONLY (t2v rejected)
 * - Cost:   usd = usage.cost_in_usd_ticks / 1e10
 * - Output: temporary URLs (imgen.x.ai / vidgen.x.ai) — download immediately.
 * - Rate limit at low tiers is ~1 req/sec → we serialize + retry on
 *   resource-exhausted.
 */

import { readFile } from "fs/promises";
import { writeFile } from "fs/promises";
import { getXaiKey } from "./keys";
import { getMimeType, saveImage } from "../shared";
import type { ProviderImageResult, ProviderVideoResult } from "./types";
import { xaiTicksToUsd } from "./types";

const XAI_BASE = "https://api.x.ai"; // paths below include the /v1 prefix

export const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality";
export const XAI_VIDEO_T2V_MODEL = process.env.XAI_VIDEO_T2V_MODEL || "grok-imagine-video";
export const XAI_VIDEO_I2V_MODEL = process.env.XAI_VIDEO_I2V_MODEL || "grok-imagine-video-1.5";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST/GET against api.x.ai with bearer auth + rate-limit retry. */
async function xaiFetch(
  path: string,
  init: RequestInit & { method: "GET" | "POST" },
  retries = 6
): Promise<any> {
  const key = getXaiKey();
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${XAI_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: text };
    }
    // Error shapes vary: { code, error:"str" } (video) or { error:{message,code} }.
    const errObj = json?.error;
    const code = json?.code || (errObj && typeof errObj === "object" ? errObj.code : undefined);
    const message = typeof errObj === "string" ? errObj : errObj?.message || json?.message;
    // xAI rate limit: code === "resource-exhausted"
    if (code === "resource-exhausted" && attempt < retries) {
      const backoff = 1100 * (attempt + 1);
      console.error(`  xAI rate limited; retrying in ${backoff}ms...`);
      await sleep(backoff);
      attempt++;
      continue;
    }
    if (!res.ok || errObj) {
      throw new Error(`xAI ${path}: ${message || `HTTP ${res.status}`}`);
    }
    return json;
  }
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Image (text-to-image, synchronous) ─────────────────────────────

export async function xaiImage(
  prompt: string,
  options: {
    model?: string;
    n?: number;
    aspectRatio?: string;
    resolution?: string;
    outputPath?: string;
  } = {}
): Promise<ProviderImageResult> {
  const model = options.model || XAI_IMAGE_MODEL;
  const body: Record<string, unknown> = { model, prompt, n: options.n ?? 1 };
  if (options.aspectRatio) body.aspect_ratio = options.aspectRatio;
  if (options.resolution) body.resolution = options.resolution;

  console.error(`Generating image with ${model} (xAI)...`);
  const start = Date.now();
  const json = await xaiFetch("/v1/images/generations", { method: "POST", body: JSON.stringify(body) });

  const data: Array<{ url?: string; b64_json?: string; mime_type?: string }> = json.data || [];
  if (!data.length) throw new Error("xAI returned no images");

  const paths: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const mime = item.mime_type || "image/jpeg";
    let b64: string;
    if (item.b64_json) {
      b64 = item.b64_json;
    } else if (item.url) {
      b64 = (await downloadToBuffer(item.url)).toString("base64");
    } else {
      throw new Error("xAI image item had neither url nor b64_json");
    }
    const out =
      data.length > 1 && options.outputPath
        ? options.outputPath.replace(/(\.[^.]+)$/, `-${i + 1}$1`)
        : options.outputPath;
    paths.push(await saveImage(b64, mime, out, "xai"));
  }

  console.error(`Generated in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  return { paths, provider: "xai", model, costUsd: xaiTicksToUsd(json?.usage?.cost_in_usd_ticks) };
}

// ── Video (submit + poll) ──────────────────────────────────────────

/** Turn a local path OR a hosted http(s) URL into an xAI image-input object. */
async function toImageInput(pathOrUrl: string): Promise<{ url: string }> {
  if (/^https?:\/\//i.test(pathOrUrl)) return { url: pathOrUrl };
  const buf = await readFile(pathOrUrl);
  const mime = getMimeType(pathOrUrl);
  return { url: `data:${mime};base64,${buf.toString("base64")}` };
}

async function pollVideo(requestId: string): Promise<any> {
  const start = Date.now();
  const timeoutMs = 10 * 60 * 1000;
  while (Date.now() - start < timeoutMs) {
    const p = await xaiFetch(`/v1/videos/${requestId}`, { method: "GET" });
    const status = p?.status;
    if (status === "done" || status === "completed" || status === "succeeded") return p;
    if (status === "failed" || status === "expired") {
      throw new Error(`xAI video ${status}: ${JSON.stringify(p)}`);
    }
    process.stderr.write(".");
    await sleep(5000);
  }
  throw new Error("xAI video timed out after 10 minutes");
}

export interface XaiVideoOptions {
  /** Local path or http(s) URL of a start frame → image-to-video (uses 1.5). */
  image?: string;
  model?: string; // override the auto-selected model
  duration?: number; // seconds
  aspectRatio?: string; // t2v only
  resolution?: string; // 480p | 720p | 1080p (1080p = i2v only)
  outputPath: string;
}

export async function xaiVideo(prompt: string, options: XaiVideoOptions): Promise<ProviderVideoResult> {
  const isI2V = !!options.image;
  // grok-imagine-video-1.5 is image-to-video only; v1 handles text-to-video.
  const model = options.model || (isI2V ? XAI_VIDEO_I2V_MODEL : XAI_VIDEO_T2V_MODEL);

  const body: Record<string, unknown> = { model, prompt };
  if (options.duration) body.duration = options.duration;
  if (options.resolution) body.resolution = options.resolution;
  if (isI2V) {
    body.image = await toImageInput(options.image!);
  } else if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }

  console.error(`Generating ${isI2V ? "image-to-video" : "text-to-video"} with ${model} (xAI)...`);
  const start = Date.now();

  const sub = await xaiFetch("/v1/videos/generations", { method: "POST", body: JSON.stringify(body) });
  const requestId = sub?.request_id || sub?.id;
  if (!requestId) throw new Error(`xAI did not return a request_id: ${JSON.stringify(sub)}`);

  const result = await pollVideo(requestId);
  const url = result?.video?.url || result?.url || result?.data?.[0]?.url;
  if (!url) throw new Error(`xAI video had no URL: ${JSON.stringify(result)}`);

  const buf = await downloadToBuffer(url);
  await writeFile(options.outputPath, buf);

  console.error(`\nGenerated in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  return {
    path: options.outputPath,
    provider: "xai",
    model,
    durationSeconds: result?.video?.duration,
    costUsd: xaiTicksToUsd(result?.usage?.cost_in_usd_ticks),
  };
}

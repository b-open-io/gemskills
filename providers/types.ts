/**
 * Cross-provider types, the capability matrix, and auto-pick rankings.
 *
 * The capability matrix is the single source of truth for "can provider X do
 * what this request needs?" The resolver (config.ts) uses it to filter
 * providers during capability-aware auto-pick, so we never route a request to
 * a provider that can't honor it (e.g. transparent background → not gpt-image-2).
 */

import type { Provider } from "./keys";

export type Task = "image" | "video" | "edit";

/**
 * Discrete capabilities a single request may require. The skill derives the
 * required set from the user's flags (e.g. --transparent → "transparent").
 */
export type Capability =
  | "transparent" // transparent / alpha background
  | "negative" // a dedicated negative-prompt parameter
  | "styleTile" // accepts a style reference tile image (the gemskills style system)
  | "multiRef" // multiple reference images in one request
  | "mask" // masked inpainting (edit)
  | "t2v" // text-to-video (prompt only, no start frame)
  | "i2v"; // image-to-video (requires a start frame)

/**
 * What each provider supports, per task. Verified against live APIs June 2026.
 *
 * Notes:
 * - openai image = gpt-image-2: NO transparent background, NO negative param,
 *   no style-tile concept. Edits support up to 16 images + mask.
 * - xai image = grok-imagine-image: basic text-to-image only.
 * - xai video: grok-imagine-video (v1) does t2v; grok-imagine-video-1.5 is
 *   image-to-video ONLY. We expose both modes via the provider (t2v one-shot
 *   on v1, or auto-frame → i2v on 1.5).
 * - gemini: the full-featured default (styles, multi-ref, transparency, Veo).
 */
export const CAPABILITIES: Record<Task, Record<Provider, Capability[]>> = {
  image: {
    // multiRef = image-to-image / reference images. Gemini does this on the
    // generations path; OpenAI does it via the EDIT endpoint (the generate-image
    // skill routes openai img2img through openaiEdit). xAI image is text-only.
    // styleTile/transparent/negative remain Gemini-only.
    gemini: ["transparent", "negative", "styleTile", "multiRef"],
    openai: ["multiRef"],
    xai: [],
  },
  edit: {
    gemini: ["transparent", "negative", "styleTile", "multiRef", "mask"],
    openai: ["multiRef", "mask"],
    xai: [],
  },
  video: {
    gemini: ["t2v", "i2v"],
    openai: [],
    xai: ["t2v", "i2v"],
  },
};

/**
 * Auto-pick preference order per task (best first). Only consulted when the
 * user has expressed no explicit/config preference. Filtered by key presence
 * and required capabilities before selection.
 */
export const RANKINGS: Record<Task, Provider[]> = {
  image: ["openai", "gemini", "xai"],
  // Edit defaults to Gemini (conversational edits, transparency, styles). OpenAI
  // gpt-image-2 is excellent at masked inpainting — choose it with --provider openai.
  edit: ["gemini", "openai"],
  video: ["xai", "gemini"],
};

/** Providers that can even attempt a given task at all. */
export const TASK_PROVIDERS: Record<Task, Provider[]> = {
  image: ["gemini", "openai", "xai"],
  edit: ["gemini", "openai"],
  video: ["gemini", "xai"],
};

export function supports(task: Task, provider: Provider, caps: Capability[]): boolean {
  const have = new Set(CAPABILITIES[task][provider] ?? []);
  return caps.every((c) => have.has(c));
}

// ── Result shapes ──────────────────────────────────────────────────

export interface ProviderImageResult {
  /** Saved file path(s). */
  paths: string[];
  provider: Provider;
  model: string;
  /** USD cost when the provider reports it (xAI cost ticks / 1e10; OpenAI from usage). */
  costUsd?: number;
}

export interface ProviderVideoResult {
  path: string;
  provider: Provider;
  model: string;
  durationSeconds?: number;
  costUsd?: number;
}

/** xAI reports cost in "usd ticks"; 1 USD = 1e10 ticks (verified live). */
export const XAI_USD_TICKS = 1e10;
export function xaiTicksToUsd(ticks?: number): number | undefined {
  return typeof ticks === "number" ? ticks / XAI_USD_TICKS : undefined;
}

/**
 * Per-provider API key resolution.
 *
 * RULES (per repo policy):
 * - One canonical env var per provider. No fallback to alternate names,
 *   no hard-coded keys, no trimming. If the canonical var is missing, fail loud.
 * - `getX()` exits the process with a helpful message (use in scripts that
 *   require the provider).
 * - `hasX()` is non-throwing presence detection (use in the resolver / setup
 *   to decide which providers are available without aborting).
 */

export type Provider = "gemini" | "openai" | "xai";

interface KeySpec {
  /** Canonical environment variable — the ONLY name we read. */
  env: string;
  /** Where to get a key, shown on failure. */
  url: string;
  label: string;
}

export const KEY_SPECS: Record<Provider, KeySpec> = {
  gemini: { env: "GEMINI_API_KEY", url: "https://aistudio.google.com/apikey", label: "Gemini" },
  openai: { env: "OPENAI_API_KEY", url: "https://platform.openai.com/api-keys", label: "OpenAI" },
  xai: { env: "XAI_API_KEY", url: "https://console.x.ai", label: "xAI" },
};

/** Non-throwing: is the canonical key present (non-empty) for this provider? */
export function hasKey(provider: Provider): boolean {
  const spec = KEY_SPECS[provider];
  const v = process.env[spec.env];
  return typeof v === "string" && v.length > 0;
}

/** Throwing: return the key or exit(1) with guidance. No fallbacks. */
export function requireKey(provider: Provider): string {
  const spec = KEY_SPECS[provider];
  const v = process.env[spec.env];
  if (!v) {
    console.error(`Error: ${spec.env} environment variable is not set.`);
    console.error(`\n${spec.label} provider requires ${spec.env}.`);
    console.error(`Get a key: ${spec.url}`);
    console.error(`Then run /gemskills:setup or export ${spec.env}=...`);
    process.exit(1);
  }
  return v;
}

export const getOpenAIKey = () => requireKey("openai");
export const getXaiKey = () => requireKey("xai");
export const getGeminiKey = () => requireKey("gemini");

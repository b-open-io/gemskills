/**
 * Shared utilities for all gemskills scripts.
 *
 * Consolidates duplicated helpers: API key validation, image loading,
 * image saving, MIME type detection, CLI arg parsing, and style types.
 */

import { readFile, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import type { Image } from "@google/genai";

// ── Types ──────────────────────────────────────────────────────────

export interface Style {
  id: string;
  shortName: string;
  name: string;
  category: string;
  promptHints: string;
  tilePrompt: string;
}

export interface StylesRegistry {
  version: string;
  categories: Record<string, string>;
  styles: Style[];
}

export interface ParsedArgs {
  /** Positional arguments (non-flag values) */
  positional: string[];
  /** Flag values keyed by flag name (without --) */
  flags: Record<string, string>;
  /** Boolean flags (--flag with no value) */
  booleans: Set<string>;
  /** Collected multi-value flags (e.g. multiple --input) */
  multi: Record<string, string[]>;
}

// ── API Key ────────────────────────────────────────────────────────

export function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    console.error("\nGet an API key from: https://aistudio.google.com/apikey");
    process.exit(1);
  }
  return apiKey;
}

export function getReplicateApiKey(): string {
  const apiKey = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
  if (!apiKey) {
    console.error("Error: REPLICATE_API_TOKEN (or REPLICATE_API_KEY) environment variable is not set.");
    console.error("\nGet an API token from: https://replicate.com/account/api-tokens");
    process.exit(1);
  }
  return apiKey;
}

export function getQuiverApiKey(): string {
  const apiKey = process.env.QUIVERAI_API_KEY || process.env.QUIVER_API_KEY;
  if (!apiKey) {
    console.error("Error: QUIVERAI_API_KEY (or QUIVER_API_KEY) environment variable is not set.");
    console.error("\nGet an API key from: https://quiver.ai");
    process.exit(1);
  }
  return apiKey;
}

// ── MIME Types ──────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
};

export function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop() || "";
  return MIME_TYPES[ext] || "image/png";
}

// ── Image Loading ──────────────────────────────────────────────────

/**
 * Load an image file as a Gemini API Image object.
 * Returns null if file doesn't exist (with warning).
 */
export async function loadImage(filePath: string): Promise<Image | null> {
  if (!existsSync(filePath)) {
    console.error(`Warning: Image not found: ${filePath}`);
    return null;
  }
  const buffer = await readFile(filePath);
  return {
    imageBytes: buffer.toString("base64"),
    mimeType: getMimeType(filePath),
  };
}

/**
 * Load an image file, throwing if not found.
 * Use when the image is required (e.g. edit source).
 */
export async function loadImageRequired(filePath: string): Promise<Image> {
  const img = await loadImage(filePath);
  if (!img) {
    console.error(`Error: Required image not found: ${filePath}`);
    process.exit(1);
  }
  return img;
}

// ── Image Saving ───────────────────────────────────────────────────

/**
 * Generate a timestamp-based filename for auto-naming outputs.
 */
export function generateTimestampFilename(descriptor?: string, ext = "png"): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const suffix = descriptor
    ? `-${descriptor.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`
    : "";
  return `${timestamp}${suffix}.${ext}`;
}

/**
 * Save base64 image data to a file. Handles PNG conversion via sips on macOS
 * when output path expects .png but source is not PNG.
 *
 * IMPORTANT: Only outputs the file path. Does NOT read the file back.
 * This saves context window tokens — instruct the user to visually inspect.
 */
export async function saveImage(
  data: string,
  mimeType: string,
  outputPath?: string,
  descriptor?: string
): Promise<string> {
  const path = outputPath || generateTimestampFilename(descriptor);
  const buffer = Buffer.from(data, "base64");

  const wantsPng = path.toLowerCase().endsWith(".png");
  const isPng = mimeType === "image/png";

  if (wantsPng && !isPng) {
    const tempPath = path.replace(/\.png$/i, ".tmp.jpg");
    await writeFile(tempPath, buffer);
    const result = spawnSync("sips", ["-s", "format", "png", tempPath, "--out", path], {
      stdio: "pipe",
    });
    await unlink(tempPath).catch(() => {});
    if (result.status !== 0) {
      console.error("Warning: PNG conversion failed, saving as-is");
      await writeFile(path, buffer);
    }
  } else {
    await writeFile(path, buffer);
  }

  return path;
}

// ── CLI Arg Parsing ────────────────────────────────────────────────

/**
 * Parse CLI arguments into structured form.
 *
 * Supports:
 * - `--flag value` pairs
 * - `--boolean` flags (no value)
 * - Multiple values for same flag via `multiKeys` (e.g. --input a --input b)
 * - Positional arguments
 *
 * @param argv - process.argv.slice(2) or equivalent
 * @param multiKeys - flag names that accept multiple values (default: ["input"])
 */
export function parseArgs(
  argv: string[] = process.argv.slice(2),
  multiKeys: string[] = ["input"]
): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const booleans = new Set<string>();
  const multi: Record<string, string[]> = {};

  for (const key of multiKeys) {
    multi[key] = [];
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        if (multiKeys.includes(key)) {
          multi[key].push(nextArg);
        } else {
          flags[key] = nextArg;
        }
        i++;
      } else {
        booleans.add(key);
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags, booleans, multi };
}

// ── Format Helpers ─────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

#!/usr/bin/env bun
/**
 * Build an HTML presenter from a deck directory.
 *
 * Reads slides/, DECK-INDEX.md, DECK-PLAN.md, THEME.md, ANNOTATIONS.md
 * and an optional PRESENTER-CONFIG.json, then token-replaces the
 * presenter.html template to produce a self-contained presentation file.
 *
 * Usage:
 *   bun run scripts/build_presenter.ts --dir <deck-dir> [options]
 *
 * Options:
 *   --dir <path>          Deck directory (required, contains slides/ and DECK-INDEX.md)
 *   --output <path>       Output path (default: <dir>/presenter.html)
 *   --background <url>    Global background media (video/image URL or filename)
 *   --video <url>         Deprecated alias for --background
 *   --video-type <type>   mp4 | hls (default: auto-detect from extension)
 *   --transition <ms>     Transition duration (default: 500)
 *   --auto-advance <sec>  Auto-advance seconds (default: 0 = disabled)
 *   --accent <hex>        Accent color (auto-detect from THEME.md Primary)
 *   --bg <hex>            Background color (auto-detect from THEME.md Background)
 *   --title <string>      Deck title (auto-detect from DECK-INDEX.md)
 *   --open                Open in browser after build
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
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
const { parseArgs } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared");
import {
  parseDeckIndex,
  parseDeckPlan,
  parseTheme,
  parseAnnotations,
  parseAnnotationsFile,
} from "./parsers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(__dirname, "../assets/presenter.html");

interface SlideEntry {
  index: number;
  file: string;
  title: string;
  type: string;
  backgroundMode: "transparent" | "opaque";
  renderMode: "image" | "html";
  headline?: string;
  content?: string;
  keyMessage?: string;
  videoUrl?: string;
  videoType?: string;
  htmlContent?: string;
}

interface PresenterConfig {
  slides?: Record<string, { videoUrl?: string; videoType?: string }>;
  overlay?: number;
  transition?: number;
}

function detectBackgroundKind(value?: string): "none" | "video" | "image" {
  const raw = (value || "").trim().toLowerCase();
  if (!raw || raw === "none") return "none";
  if (raw.startsWith("/slides/") || raw.startsWith("slides/")) return "image";
  if (raw.startsWith("/videos/") || raw.startsWith("videos/")) return "video";
  if (/\.(png|jpe?g|webp|gif|avif)([?#].*)?$/.test(raw)) return "image";
  if (/\.(mp4|m3u8|webm|mov|m4v)([?#].*)?$/.test(raw)) return "video";
  if (raw.includes(".m3u8")) return "video";
  return "none";
}

function normalizeBackgroundUrl(
  value: string | undefined,
  kind: "video" | "image",
): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || /^\/\//.test(raw) || raw.startsWith("/")) {
    return raw;
  }
  if (kind === "image") {
    if (raw.startsWith("slides/")) return `/${raw}`;
    return `/slides/${raw}`;
  }
  if (raw.startsWith("videos/")) return `/${raw}`;
  return `/videos/${raw}`;
}

function inferModeFromHex(hex: string): "light" | "dark" | undefined {
  const match = hex.trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return undefined;
  const raw = match[1];
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance >= 140 ? "light" : "dark";
}

function discoverSlides(slidesDir: string): SlideEntry[] {
  if (!existsSync(slidesDir)) return [];

  const files = readdirSync(slidesDir)
    .filter((f) => /\.(png|jpg|jpeg|webp|html)$/i.test(f))
    .sort();

  return files.map((f, i) => {
    const stem = f.replace(/\.\w+$/, "");
    const parts = stem.replace(/^\d+-/, "").split("-");
    const title = parts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
    const isHtml = /\.html$/i.test(f);

    return {
      index: i + 1,
      file: `slides/${f}`,
      title,
      type: i === 0 ? "Title" : "Content",
      backgroundMode: "opaque",
      renderMode: isHtml ? "html" : "image",
    };
  });
}

const { flags, booleans } = parseArgs(undefined, []);

const deckDir = flags.dir;
if (!deckDir) {
  console.error("Error: --dir <deck-directory> is required");
  console.error("\nUsage: bun run scripts/build_presenter.ts --dir <path> [options]");
  console.error("\nOptions:");
  console.error("  --dir <path>          Deck directory (required)");
  console.error("  --output <path>       Output path (default: <dir>/presenter.html)");
  console.error("  --background <url>    Global background media URL/filename");
  console.error("  --video <url>         Deprecated alias for --background");
  console.error("  --video-type <type>   mp4 | hls (default: auto-detect)");
  console.error("  --transition <ms>     Transition duration (default: 500)");
  console.error("  --auto-advance <sec>  Auto-advance seconds (default: 0)");
  console.error("  --accent <hex>        Accent color (auto from THEME.md)");
  console.error("  --bg <hex>            Background color (auto from THEME.md)");
  console.error("  --title <string>      Deck title (auto from DECK-INDEX.md)");
  console.error("  --open                Open in browser after build");
  process.exit(1);
}

const resolvedDir = resolve(deckDir);
if (!existsSync(resolvedDir)) {
  console.error(`Error: Directory not found: ${resolvedDir}`);
  process.exit(1);
}

if (!existsSync(TEMPLATE_PATH)) {
  console.error(`Error: Template not found: ${TEMPLATE_PATH}`);
  process.exit(1);
}

const template = await readFile(TEMPLATE_PATH, "utf-8");
const indexPath = resolve(resolvedDir, "DECK-INDEX.md");
let deckTitle = flags.title || "Presentation";
let slides: SlideEntry[] = [];

if (existsSync(indexPath)) {
  const indexContent = await readFile(indexPath, "utf-8");
  const parsed = parseDeckIndex(indexContent);
  if (!flags.title && parsed.title) deckTitle = parsed.title;
  slides = parsed.slides.map((s) => ({
    index: s.index,
    file: `slides/${s.filename}`,
    title: s.title,
    type: s.type,
    backgroundMode: s.backgroundMode || "opaque",
    renderMode: s.renderMode || "image",
  }));
}

if (slides.length === 0) {
  const slidesDir = resolve(resolvedDir, "slides");
  const pagesDir = resolve(resolvedDir, "pages");

  if (existsSync(slidesDir)) {
    slides = discoverSlides(slidesDir);
  } else if (existsSync(pagesDir)) {
    slides = discoverSlides(pagesDir).map((s) => ({
      ...s,
      file: s.file.replace("slides/", "pages/"),
    }));
  }
}

if (slides.length === 0) {
  console.error("Error: No slides found in slides/ or pages/ directory");
  process.exit(1);
}

const planPath = resolve(resolvedDir, "DECK-PLAN.md");
if (existsSync(planPath)) {
  const planContent = await readFile(planPath, "utf-8");
  const plan = parseDeckPlan(planContent);

  for (const slide of slides) {
    const planSlide = plan.slides.find((p) => p.slideNum === slide.index);
    if (!planSlide) continue;
    if (planSlide.renderMode) slide.renderMode = planSlide.renderMode;
    slide.backgroundMode = planSlide.backgroundMode || slide.backgroundMode || "opaque";
    slide.headline = planSlide.headline || slide.title;
    slide.content = planSlide.content || "";
  }

  if (!flags.title && plan.title) deckTitle = plan.title;
  if (plan.keyMessage) {
    for (const slide of slides) {
      if ((slide.type === "Title" || slide.type === "Closing") && !slide.content) {
        slide.keyMessage = plan.keyMessage;
      }
    }
  }
}

const themePath = resolve(resolvedDir, "THEME.md");
let themeColors = {
  bg: "#0a0e1a",
  accent: "#00d4aa",
  aspectRatio: "16:9",
  backgroundMedia: undefined as string | undefined,
  themeVars: {} as Record<string, string>,
};

if (existsSync(themePath)) {
  const themeContent = await readFile(themePath, "utf-8");
  const parsed = parseTheme(themeContent);
  const bgFromTheme = parsed.bgColor || "#0a0e1a";
  const modeFromTheme = parsed.slideThemeMode;
  const bgMode = inferModeFromHex(bgFromTheme);
  const modeDefaultBg = modeFromTheme === "light" ? "#ffffff" : "#0a0e1a";
  const resolvedBg =
    modeFromTheme && bgMode && modeFromTheme !== bgMode
      ? modeDefaultBg
      : bgFromTheme;

  themeColors = {
    bg: resolvedBg,
    accent: parsed.accentColor || "#00d4aa",
    aspectRatio: parsed.aspectRatio || "16:9",
    backgroundMedia: parsed.backgroundMedia || parsed.videoBackground,
    themeVars: parsed.themeConfig || {},
  };
}

const accentColor = flags.accent || themeColors.accent;
const bgColor = flags.bg || themeColors.bg;

if (!flags.background && flags.video) {
  flags.background = flags.video;
}
if (
  !flags.background &&
  themeColors.backgroundMedia &&
  themeColors.backgroundMedia !== "none"
) {
  flags.background = themeColors.backgroundMedia;
}

const transitionMs = parseInt(flags.transition || "500", 10);
const autoAdvance = parseInt(flags["auto-advance"] || "0", 10);

const configPath = resolve(resolvedDir, "PRESENTER-CONFIG.json");
let presenterConfig: PresenterConfig = {};
if (existsSync(configPath)) {
  const configContent = await readFile(configPath, "utf-8");
  presenterConfig = JSON.parse(configContent);
}

if (presenterConfig.slides) {
  for (const slide of slides) {
    const filename = basename(slide.file);
    const cfg = presenterConfig.slides[filename];
    if (!cfg?.videoUrl) continue;
    slide.videoUrl = normalizeBackgroundUrl(cfg.videoUrl, "video");
    slide.videoType = cfg.videoType;
  }
}

// Read VARIANTS.json to pick up animated backdrop videos (set via "Animate" button).
// The active variant's backdropVideo overrides the per-slide videoUrl when not
// already set from PRESENTER-CONFIG.json.
const variantsPath = resolve(resolvedDir, "VARIANTS.json");
if (existsSync(variantsPath)) {
  const variantsContent = await readFile(variantsPath, "utf-8");
  const variantsFile = JSON.parse(variantsContent) as {
    variants?: Record<string, {
      variants?: Array<{ backdropVideo?: string }>;
      activeVariant?: number;
    }>;
  };
  const variantsMap = variantsFile.variants || {};
  for (const slide of slides) {
    if (slide.videoUrl) continue; // PRESENTER-CONFIG.json takes precedence
    const entry = variantsMap[String(slide.index)];
    if (!entry?.variants?.length) continue;
    const activeIdx = Math.min(entry.activeVariant ?? 0, entry.variants.length - 1);
    const backdropVideo = entry.variants[activeIdx]?.backdropVideo;
    if (backdropVideo) {
      slide.videoUrl = normalizeBackgroundUrl(backdropVideo, "video");
      slide.videoType = "mp4";
    }
  }
}

const annotationsJsonPath = resolve(resolvedDir, "ANNOTATIONS.json");
const annotationsMdPath = resolve(resolvedDir, "ANNOTATIONS.md");
let annotations: Record<number, string> = {};
if (existsSync(annotationsJsonPath)) {
  const content = await readFile(annotationsJsonPath, "utf-8");
  annotations = parseAnnotationsFile(content).notes;
} else if (existsSync(annotationsMdPath)) {
  const annotationsContent = await readFile(annotationsMdPath, "utf-8");
  annotations = parseAnnotations(annotationsContent);
}

for (const slide of slides) {
  if (slide.renderMode !== "html") continue;
  const htmlPath = resolve(resolvedDir, slide.file);
  if (existsSync(htmlPath)) {
    let htmlContent = await readFile(htmlPath, "utf-8");
    // Strip static /slides/ backdrop URLs when the slide has an animated
    // backdrop video so the video shows through in the presenter.
    if (slide.videoUrl) {
      htmlContent = htmlContent.replace(
        /url\(['"]?\/slides\/[^'")\s]+['"]?\)/gi,
        "none",
      );
    }
    slide.htmlContent = htmlContent;
  }
}

const globalBackground = (flags.background || "").trim();
const globalBackgroundKind = detectBackgroundKind(globalBackground);
const globalVideoUrl =
  globalBackgroundKind === "video"
    ? normalizeBackgroundUrl(globalBackground, "video")
    : "";
const globalImageUrl =
  globalBackgroundKind === "image"
    ? normalizeBackgroundUrl(globalBackground, "image")
    : "";

const videoType =
  flags["video-type"] || (globalVideoUrl.includes(".m3u8") ? "hls" : "mp4");
const overlayOpacity = presenterConfig.overlay ?? 0.3;

const slidesJson = JSON.stringify(slides);
const annotationsJson = JSON.stringify(annotations);
const configJson = JSON.stringify({
  title: deckTitle,
  slideCount: slides.length,
  accentColor,
  backgroundColor: bgColor,
  aspectRatio: themeColors.aspectRatio,
  themeVars: themeColors.themeVars,
  transitionDuration: transitionMs,
  globalVideoUrl: globalVideoUrl || null,
  globalImageUrl: globalImageUrl || null,
  videoType,
  overlayOpacity,
  autoAdvance,
});

let html = template;
html = html.replace("__DECK_TITLE__", deckTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
html = html.replace("__ACCENT_COLOR__", accentColor);
html = html.replace("__BG_COLOR__", bgColor);
html = html.replace("__TRANSITION_MS__", String(transitionMs));
html = html.replace("[/* __SLIDES_DATA__ */]", slidesJson);
html = html.replace("{/* __PRESENTER_CONFIG__ */}", configJson);
html = html.replace("{/* __ANNOTATIONS__ */}", annotationsJson);

const outputPath = resolve(flags.output || resolve(resolvedDir, "presenter.html"));
await writeFile(outputPath, html, "utf-8");

const sizeKB = (Buffer.byteLength(html, "utf-8") / 1024).toFixed(1);
console.log(`Presenter built: ${outputPath} (${sizeKB}KB, ${slides.length} slides)`);

if (booleans.has("open")) {
  spawnSync("open", [outputPath], { stdio: "inherit" });
}

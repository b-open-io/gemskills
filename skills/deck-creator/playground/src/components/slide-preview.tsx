"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchSlideHtml,
  generateHtmlSlide,
  generateImageSlide,
} from "@/lib/api";
import {
  getBackgroundMediaKind,
  resolveBackgroundMediaSrc,
} from "@/lib/background-media";
import {
  buildSlidePrompt,
  getGenerationAnnotationsForSlide,
} from "@/lib/hooks";
import { getAspectCanvasSize, toCssAspectRatio } from "@/lib/aspect-ratio";
import { cn } from "@/lib/utils";
import type { DeckAction, DeckState } from "@/lib/types";

interface SlidePreviewProps {
  state: DeckState;
  dispatch: React.Dispatch<DeckAction>;
  className?: string;
}

/** Extract content and styles from generated slide HTML.
 *  Returns null if the HTML is truncated or broken. */
function parseSlideHtml(
  html: string,
): { bodyHtml: string; styles: string } | null {
  // Reject truncated HTML — unclosed style tags mean broken output
  if (/<style[\s>]/i.test(html) && !/<\/style>/i.test(html)) {
    return null;
  }
  // Reject dangling tags / truncated SVG blocks
  const trimmed = html.trim();
  if (!trimmed.endsWith(">") || /<[^>]*$/.test(trimmed)) {
    return null;
  }
  if (/<svg[\s>]/i.test(trimmed) && !/<\/svg>/i.test(trimmed)) {
    return null;
  }

  // Extract all complete <style> tag contents
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const styleParts: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = styleRegex.exec(html)) !== null) {
    styleParts.push(match[1]);
  }

  // Get the content — either from <body> or by stripping document wrappers
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const rawBody = bodyMatch
    ? bodyMatch[1]
    : html
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<\/?html[^>]*>/gi, "")
        .replace(/<head>[\s\S]*?<\/head>/gi, "")
        .replace(/<\/?head[^>]*>/gi, "")
        .replace(/<\/?body[^>]*>/gi, "")
        .replace(/<meta[^>]*\/?>/gi, "")
        .replace(/<title>[\s\S]*?<\/title>/gi, "");

  // Strip style tags from body content
  const bodyHtml = rawBody
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .trim();

  // If there's no actual content, this is a broken generation
  if (!bodyHtml) return null;

  return { bodyHtml, styles: styleParts.join("\n") };
}

function extractCssImports(css: string): {
  imports: string[];
  withoutImports: string;
} {
  const imports: string[] = [];
  const withoutImports = css.replace(
    /@import\s+(?:url\([^)]*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*;/gi,
    (block) => {
      imports.push(block.trim());
      return "";
    },
  );
  return { imports, withoutImports };
}

function hasBalancedBraces(css: string): boolean {
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function resolveVariantTheme(
  _variantMode: "light" | "dark" | undefined,
  state: { themeModes: DeckState["themeModes"]; slideThemeMode: DeckState["slideThemeMode"] },
): Record<string, string> {
  // Always use the current global slideThemeMode for rendering so that
  // toggling light/dark mode applies immediately to the preview.
  // The variant's recorded themeMode is kept as metadata only.
  return state.themeModes[state.slideThemeMode];
}

/** Scope CSS selectors under a container class to prevent style leakage.
 *  Rewrites viewport units (vw/vh) to container query units (cqw/cqh)
 *  so they reference the slide container instead of the browser viewport.
 *
 *  Properly handles @keyframes (no scoping inside), @font-face, and @media. */
function scopeStyles(css: string, scopeClass: string): string {
  // Rewrite viewport units to container query units
  let processed = css
    .replace(/(\d+(?:\.\d+)?)vw/g, "$1cqw")
    .replace(/(\d+(?:\.\d+)?)vh/g, "$1cqh");

  // Remove comments before selector scoping so comment boundaries do not
  // become part of selector tokens and break the resulting CSS.
  processed = processed.replace(/\/\*[\s\S]*?\*\//g, "");

  // Extract @keyframes blocks first — they must NOT be scoped
  const keyframeBlocks: string[] = [];
  processed = processed.replace(
    /@(-webkit-)?keyframes\s+[\w-]+\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,
    (block) => {
      keyframeBlocks.push(block);
      return `/*__KF_${keyframeBlocks.length - 1}__*/`;
    },
  );

  // Extract @font-face blocks — global by nature, pass through
  const fontFaceBlocks: string[] = [];
  processed = processed.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
    fontFaceBlocks.push(block);
    return `/*__FF_${fontFaceBlocks.length - 1}__*/`;
  });

  // Scope remaining selectors
  processed = processed.replace(/([^{}]+)\{/g, (full, selector: string) => {
    const trimmed = selector.trim();

    // Don't scope @-rules (media queries, etc.)
    if (trimmed.startsWith("@")) return full;

    // Don't scope placeholder comments
    if (trimmed.startsWith("/*__")) return full;

    const result = selector
      .split(",")
      .map((s: string) => {
        const t = s.trim();
        if (!t) return s;
        // Replace :root / html / body with scope class
        if (t === ":root" || t === "html" || t === "body") {
          return s.replace(/(:root|html|body)/, `.${scopeClass}`);
        }
        if (/^(html|body)\s/.test(t)) {
          return s.replace(/^(\s*)(html|body)/, `$1.${scopeClass}`);
        }
        // Universal selector
        if (t === "*") {
          return s.replace("*", `.${scopeClass} *`);
        }
        // Prefix other selectors
        const ws = s.match(/^\s*/)?.[0] || "";
        return `${ws}.${scopeClass} ${t}`;
      })
      .join(",");
    return `${result}{`;
  });

  // Restore @keyframes blocks (unscoped)
  for (let i = 0; i < keyframeBlocks.length; i++) {
    processed = processed.replace(`/*__KF_${i}__*/`, keyframeBlocks[i]);
  }

  // Restore @font-face blocks
  for (let i = 0; i < fontFaceBlocks.length; i++) {
    processed = processed.replace(`/*__FF_${i}__*/`, fontFaceBlocks[i]);
  }

  return processed;
}

export function SlidePreview({
  state,
  dispatch,
  className,
}: SlidePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  const slide = state.slides[state.currentSlide];
  const activeVariant = slide?.variants?.[slide.activeVariant];
  const previewThemeConfig = useMemo(
    () => resolveVariantTheme(activeVariant?.themeMode, state),
    [activeVariant?.themeMode, state.themeModes, state.slideThemeMode],
  );
  const isHtml = slide?.renderMode === "html";
  const isDone = slide?.status === "done";
  const backgroundMedia = slide?.backgroundMediaUrl || state.videoUrl;
  const mediaKind = getBackgroundMediaKind(backgroundMedia || undefined);
  const mediaSrc = resolveBackgroundMediaSrc(backgroundMedia || undefined);
  const isTransparentHtml = isHtml && slide?.backgroundMode === "transparent";
  // Per-slide backdrop video (from Animate) only applies in opaque mode.
  // In transparent mode the global background media shows through instead.
  const slideBackdropVideo = !isTransparentHtml
    ? (activeVariant?.backdropVideo || slide?.backdropVideo)
    : undefined;
  const hasSlideVideo = !!slideBackdropVideo;
  const hasVideo = hasSlideVideo || (isTransparentHtml && mediaKind === "video");
  const hasImageBackdrop = !hasSlideVideo && isTransparentHtml && mediaKind === "image";
  const canvasSize = useMemo(
    () => getAspectCanvasSize(state.aspectRatio),
    [state.aspectRatio],
  );

  const isGenerating = slide?.status === "generating";
  const showImage = !isHtml && isDone;
  const showHtml = isHtml && isDone && !!slide?.htmlContent;
  const showPlaceholder =
    !isGenerating && (!isDone || (isHtml && isDone && !slide?.htmlContent));
  const showError = !!slide && slide.status === "error" && !isGenerating;

  const handleRetry = useCallback(async () => {
    if (!slide) return;
    dispatch({ type: "SET_GENERATING", generating: true });
    dispatch({
      type: "SET_SLIDE_STATUS",
      index: state.currentSlide,
      status: "generating",
    });
    dispatch({
      type: "SET_STATUS",
      text: `Retrying slide ${slide.index}...`,
    });

    try {
      if (slide.renderMode === "html") {
        const openAnns = getGenerationAnnotationsForSlide(slide, state);
        const nextMediaKind = getBackgroundMediaKind(
          state.videoUrl || undefined,
        );
        const data = await generateHtmlSlide({
          slideIndex: slide.index,
          aspectRatio: state.aspectRatio,
          headline: slide.headline,
          content: slide.content,
          type: slide.type,
          visualConcept: slide.visualConcept,
          backgroundMode: slide.backgroundMode,
          styleId: state.styleId || undefined,
          styleRecipeId: state.styleRecipeId ?? null,
          styleRecipes: state.styleRecipes,
          stylePrompt: state.stylePrompt || undefined,
          deckTitle: state.title,
          audience: state.audience,
          filename: slide.filename,
          annotations: openAnns.length > 0 ? openAnns : undefined,
          hasVideoBackground: nextMediaKind === "video",
          videoUrl: state.videoUrl || undefined,
          backgroundMediaType: nextMediaKind,
          backgroundMediaUrl:
            nextMediaKind === "image"
              ? resolveBackgroundMediaSrc(state.videoUrl || undefined)
              : undefined,
          fontFamily: state.fontFamily || undefined,
          themeConfig: state.themeConfig,
        });

        if (data.ok) {
          dispatch({
            type: "SET_SLIDE_STATUS",
            index: state.currentSlide,
            status: "done",
            recordVariant: true,
            htmlContent: data.html,
            filename: data.filename,
          });
          dispatch({ type: "SET_STATUS", text: "Ready" });
          toast.success(`Slide ${slide.index} generated`);
          return;
        }
        const msg = data.error || "Unknown error";
        dispatch({
          type: "SET_SLIDE_STATUS",
          index: state.currentSlide,
          status: "error",
          error: msg,
          rawOutput: data.rawOutput,
        });
        dispatch({
          type: "SET_STATUS",
          text: `Generation failed: ${msg}`,
        });
        toast.error(`Generation failed: ${msg}`);
        return;
      }

      const prompt = buildSlidePrompt(slide, state);
      const data = await generateImageSlide({
        slideIndex: slide.index,
        aspectRatio: state.aspectRatio,
        prompt,
        styleId: state.styleId || undefined,
        styleRecipeId: state.styleRecipeId ?? null,
        styleRecipes: state.styleRecipes,
        stylePrompt: state.stylePrompt || undefined,
        filename: slide.filename,
      });
      if (data.ok) {
        dispatch({
          type: "SET_SLIDE_STATUS",
          index: state.currentSlide,
          status: "done",
          recordVariant: true,
          filename: data.filename,
        });
        dispatch({ type: "SET_STATUS", text: "Ready" });
        toast.success(`Slide ${slide.index} generated`);
        return;
      }
      const msg = data.error || "Unknown error";
      dispatch({
        type: "SET_SLIDE_STATUS",
        index: state.currentSlide,
        status: "error",
        error: msg,
        rawOutput: data.rawOutput,
      });
      dispatch({
        type: "SET_STATUS",
        text: `Generation failed: ${msg}`,
      });
      toast.error(`Generation failed: ${msg}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "SET_SLIDE_STATUS",
        index: state.currentSlide,
        status: "error",
        error: msg,
      });
      dispatch({
        type: "SET_STATUS",
        text: `Generation failed: ${msg}`,
      });
      toast.error(`Generation failed: ${msg}`);
    } finally {
      dispatch({ type: "SET_GENERATING", generating: false });
    }
  }, [dispatch, slide, state]);

  const handleCopyRaw = useCallback(async () => {
    if (!slide) return;
    const value = slide.lastRawOutput?.trim() || slide.lastError?.trim();
    if (!value) {
      toast.error("No raw output available to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied raw output");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Copy failed: ${msg}`);
    }
  }, [slide]);

  const scalePreview = useCallback(() => {
    const container = containerRef.current;
    const slideEl = slideRef.current;
    if (!container || !slideEl) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / canvasSize.width, ch / canvasSize.height);
    const renderedW = canvasSize.width * scale;
    const renderedH = canvasSize.height * scale;
    const offsetX = (cw - renderedW) / 2;
    const offsetY = (ch - renderedH) / 2;
    slideEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }, [canvasSize.height, canvasSize.width]);

  // Re-scale whenever the visible slide changes or the container resizes.
  const scaleKey = `${state.currentSlide}-${showHtml}`;
  useEffect(() => {
    if (!showHtml) return;
    scalePreview();
    const observer = new ResizeObserver(scalePreview);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [showHtml, scaleKey, scalePreview]);

  useEffect(() => {
    if (!slide || !isHtml || !isDone || slide.htmlContent) return;
    if (!slide.filename.endsWith(".html")) return;
    fetchSlideHtml(`${slide.filename}?v=${Date.now()}`).then((html) => {
      if (html) {
        dispatch({
          type: "SET_SLIDE_STATUS",
          index: state.currentSlide,
          status: "done",
          htmlContent: html,
        });
      }
    });
  }, [slide, isHtml, isDone, state.currentSlide, dispatch]);

  // Build CSS custom properties from themeConfig for nested theme context.
  // This is the same pattern shadcn/ui uses for nested .dark/.light sections —
  // the slide container gets its own set of CSS custom properties, completely
  // independent of the app's theme.
  const themeVars = useMemo(() => {
    const tc = previewThemeConfig;
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(tc)) {
      if (value) vars[`--${key}`] = value;
    }
    return vars;
  }, [previewThemeConfig]);

  // Parse HTML and scope styles for inline rendering
  const scopeClass = "slide-scope";
  const rendered = useMemo(() => {
    if (!showHtml || !slide?.htmlContent) return null;
    const parsed = parseSlideHtml(slide.htmlContent);
    if (!parsed) return null; // Broken/truncated HTML — show placeholder instead
    const { bodyHtml, styles } = parsed;
    const { imports: importLines, withoutImports } = extractCssImports(styles);

    // When the slide has an animated backdrop video, strip static /slides/ image
    // references from both CSS and body HTML so the injected video layer shows
    // through. Generated slides bake the static backdrop into CSS background-image
    // and/or inline styles — stripping both surfaces makes the video visible.
    const strippedCss = hasSlideVideo
      ? withoutImports.replace(/url\(['"]?\/slides\/[^'")\s]+['"]?\)/gi, "none")
      : withoutImports;
    const strippedBodyHtml = hasSlideVideo
      ? bodyHtml.replace(/url\(['"]?\/slides\/[^'")\s]+['"]?\)/gi, "none")
      : bodyHtml;

    const scopedWithoutImports = scopeStyles(strippedCss, scopeClass);
    if (
      scopedWithoutImports.trim() &&
      !hasBalancedBraces(scopedWithoutImports)
    ) {
      return null;
    }

    // Minimal reset — the nested theme context (CSS custom properties on the
    // container) handles color/font isolation. We only need to reset inherited
    // layout properties that would leak from the app's Tailwind base styles.
    const themeIsolation = `.${scopeClass} {
  display: block;
  width: 100%;
  height: 100%;
  position: relative;
  margin: 0;
  padding: 0;
  line-height: normal;
  letter-spacing: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}
.${scopeClass} *, .${scopeClass} *::before, .${scopeClass} *::after {
  box-sizing: border-box;
}`;

    // Build video background layer if needed
    let mediaLayer = "";
    if (hasSlideVideo) {
      // Per-slide backdrop video (from Animate)
      const slideLoop = slide?.backdropVideoLoop !== false;
      mediaLayer = `<div style="position:absolute;inset:0;z-index:0;overflow:hidden"><video autoplay${slideLoop ? " loop" : ""} muted playsinline style="width:100%;height:100%;object-fit:cover" src="/videos/${slideBackdropVideo}"></video></div>`;
    } else if (hasVideo) {
      const canvasLoop = state.videoLoop;
      mediaLayer = `<div style="position:absolute;inset:0;z-index:0;overflow:hidden"><video autoplay${canvasLoop ? " loop" : ""} muted playsinline style="width:100%;height:100%;object-fit:cover" src="${mediaSrc}"></video><div style="position:absolute;inset:0;background:rgba(0,0,0,0.4)"></div></div>`;
    } else if (hasImageBackdrop) {
      mediaLayer = `<div style="position:absolute;inset:0;z-index:0;overflow:hidden;background-image:url('${mediaSrc.replace(/'/g, "%27")}');background-size:cover;background-position:center;background-repeat:no-repeat"></div>`;
    }

    return {
      html: mediaLayer + strippedBodyHtml,
      css:
        (importLines.length > 0 ? `${importLines.join("\n")}\n` : "") +
        themeIsolation +
        "\n" +
        scopedWithoutImports,
    };
  }, [
    showHtml,
    slide?.htmlContent,
    hasSlideVideo,
    slideBackdropVideo,
    slide?.backdropVideoLoop,
    hasVideo,
    state.videoLoop,
    hasImageBackdrop,
    mediaSrc,
    scopeClass,
  ]);
  const showRenderError = showHtml && !rendered && !isGenerating;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-lg border bg-black",
        className,
      )}
      style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
    >
      {/* Placeholder */}
      {showPlaceholder && (
        <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
          <div className="mb-2 text-2xl opacity-30">{state.aspectRatio}</div>
          <div>
            {isHtml
              ? "Generate HTML slide to preview"
              : "Configure deck and generate slides"}
          </div>
        </div>
      )}

      {/* Image preview */}
      {showImage && slide && (
        <img
          src={`/slides/${slide.filename}?v=${Date.now()}`}
          alt="Slide preview"
          className="h-full w-full object-contain"
        />
      )}

      {/* HTML slide rendered as scoped div — annotations can detect elements directly */}
      {showHtml && rendered && (
        <>
          <style dangerouslySetInnerHTML={{ __html: rendered.css }} />
          {/* Nested theme context: CSS custom properties from the deck's
					    themeConfig are set here, creating an isolated theme scope.
					    The generated slide CSS uses var(--background), var(--primary), etc.
					    which resolve to the deck's theme — not the app's theme. */}
          <div
            ref={slideRef}
            className="absolute left-0 top-0 origin-top-left overflow-hidden"
            style={{
              ...themeVars,
              width: canvasSize.width,
              height: canvasSize.height,
              background: previewThemeConfig.background || "#000",
              color: previewThemeConfig.foreground || "#e2e8f0",
              containerType: "size",
            }}
          >
            <div
              className={`${scopeClass} h-full w-full`}
              style={{ position: "relative" }}
              dangerouslySetInnerHTML={{
                __html: rendered.html,
              }}
            />
          </div>
        </>
      )}

      {/* Generating spinner */}
      {isGenerating && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
          <Spinner className="size-8 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            Generating slide...
          </p>
        </div>
      )}

      {/* Error overlay with retry/debug actions */}
      {showError && slide && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 p-4 text-center">
          <p className="text-sm font-semibold text-destructive">
            Generation failed
          </p>
          <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
            {slide.lastError || "Unknown error"}
          </p>
          {slide.lastRawOutput && (
            <pre className="mt-3 max-h-40 w-full max-w-2xl overflow-auto rounded-md border border-border bg-black/70 p-2 text-left text-[10px] text-muted-foreground">
              {slide.lastRawOutput}
            </pre>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={handleRetry}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={handleCopyRaw}>
              Copy Raw Output
            </Button>
          </div>
        </div>
      )}

      {/* Render error overlay for invalid/truncated HTML payloads */}
      {showRenderError && slide && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 p-4 text-center">
          <p className="text-sm font-semibold text-destructive">
            Slide render failed
          </p>
          <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
            Generated HTML payload was invalid or truncated. Retry generation.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={handleRetry}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={handleCopyRaw}>
              Copy Raw Output
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

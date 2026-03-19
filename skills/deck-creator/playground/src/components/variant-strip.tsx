"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { DeckState, DeckAction, ThemeConfig } from "@/lib/types";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Add01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { toCssAspectRatio, getAspectCanvasSize } from "@/lib/aspect-ratio";
import { deriveDisplayVariants } from "@/lib/variant-display";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Strip script tags from HTML to prevent sandbox console errors in thumbnails. */
function stripScripts(html: string): string {
  return html.replace(/<script[\s>][\s\S]*?<\/script>/gi, "");
}

/** Inject active theme CSS variables into HTML for thumbnail rendering. */
function injectThemeContext(html: string, themeConfig: ThemeConfig): string {
  const cleaned = stripScripts(html);
  const vars = Object.entries(themeConfig)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([key, value]) => `--${key}:${value};`)
    .join("");
  const fallbackBg = themeConfig.background || "#000";
  const fallbackFg = themeConfig.foreground || "#e2e8f0";
  const themeStyle = `<style>:root{${vars}}html,body{background:var(--background,${fallbackBg})!important;color:var(--foreground,${fallbackFg})!important}</style>`;
  if (cleaned.includes("<head>")) {
    return cleaned.replace("<head>", `<head>${themeStyle}`);
  }
  return themeStyle + cleaned;
}

function resolveVariantTheme(
  _variantMode: "light" | "dark" | undefined,
  state: { themeModes: DeckState["themeModes"]; slideThemeMode: DeckState["slideThemeMode"] },
): ThemeConfig {
  // Always use the current global slideThemeMode for rendering so that
  // toggling light/dark mode applies immediately to variant thumbnails.
  // The variant's recorded themeMode is kept as metadata only.
  return state.themeModes[state.slideThemeMode];
}

/** Renders an HTML variant in an iframe at full slide resolution, scaled to fit. */
function VariantIframeThumbnail({
  aspectRatio,
  thumbHtml,
  variant,
  bgColor,
}: {
  aspectRatio: string;
  thumbHtml: string | undefined;
  variant: { filename?: string; createdAt: number };
  bgColor: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const canvas = getAspectCanvasSize(aspectRatio);

  const measureRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setScale(rect.width / canvas.width);
    },
    [canvas.width],
  );

  const iframeSrc = thumbHtml
    ? undefined
    : variant.filename
      ? `/slides/${variant.filename}?v=${variant.createdAt}`
      : undefined;

  return (
    <div
      ref={measureRef}
      className="relative h-full w-full overflow-hidden"
      style={{ background: bgColor }}
    >
      {(thumbHtml || iframeSrc) && scale > 0 && (
        <iframe
          srcDoc={thumbHtml}
          src={thumbHtml ? undefined : iframeSrc}
          className="absolute left-0 top-0 pointer-events-none border-0"
          style={{
            width: canvas.width,
            height: canvas.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          sandbox="allow-same-origin"
          tabIndex={-1}
        />
      )}
    </div>
  );
}

interface VariantStripProps {
  state: DeckState;
  dispatch: React.Dispatch<DeckAction>;
}

export function VariantStrip({ state, dispatch }: VariantStripProps) {
  const slide = state.slides[state.currentSlide];
  const [pendingDelete, setPendingDelete] = useState<{
    payloadKey: string;
    label: string;
  } | null>(null);

  function handleAddBlank() {
    if (!slide) return;
    const variant = {
      id: `v-${Date.now()}`,
      htmlContent: "",
      themeMode: state.slideThemeMode,
      createdAt: Date.now(),
    };
    dispatch({ type: "ADD_VARIANT", slideIndex: state.currentSlide, variant });
    dispatch({
      type: "SELECT_VARIANT",
      slideIndex: state.currentSlide,
      variantIndex: 0,
    });
    dispatch({
      type: "SET_SLIDE_STATUS",
      index: state.currentSlide,
      status: "pending",
    });
  }

  const addButton = (
    <button
      type="button"
      onClick={handleAddBlank}
      className="flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/25 text-muted-foreground/40 hover:border-muted-foreground/50 hover:text-muted-foreground/70 transition-colors"
      style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
      title="Add blank variant"
    >
      <HugeiconsIcon icon={Add01Icon} className="size-4" />
    </button>
  );

  const visibleVariants = useMemo(
    () => (slide ? deriveDisplayVariants(slide) : []),
    [slide],
  );

  if (!slide || visibleVariants.length === 0) {
    return (
      <div className="flex h-full min-h-0 w-32 lg:w-44 shrink-0 flex-col overflow-hidden border-l bg-background">
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b">
          <span className="text-[0.65rem] font-medium text-muted-foreground">
            Variants
          </span>
        </div>
        <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-auto p-2">
          {addButton}
          <p className="text-[0.6rem] text-muted-foreground/50 text-center">
            Add or generate variants
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-32 lg:w-44 shrink-0 flex-col overflow-hidden border-l bg-background">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b">
        <span className="text-[0.65rem] font-medium text-muted-foreground">
          Variants
        </span>
        <Badge variant="secondary" className="text-[0.55rem] h-3.5 px-1">
          {visibleVariants.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-2 p-2">
          {/* Add blank variant */}
          {addButton}

          {visibleVariants.map((entry, displayIndex) => {
            const { variant } = entry;
            const isActive = entry.isActive;
            const hasHtml = entry.renderMode === "html";
            const hasImage = entry.renderMode === "image";
            const label =
              variant.label || `v${visibleVariants.length - displayIndex}`;
            const thumbThemeConfig = resolveVariantTheme(
              variant.themeMode,
              state,
            );
            const thumbHtml =
              hasHtml && variant.htmlContent
                ? injectThemeContext(variant.htmlContent, thumbThemeConfig)
                : undefined;

            return (
              <div key={variant.id} className="flex flex-col gap-1">
                <div
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "group relative rounded-md border overflow-hidden transition-all w-full cursor-pointer",
                    isActive
                      ? "border-primary ring-1 ring-primary/50"
                      : "border-muted opacity-60 hover:opacity-100 hover:border-foreground/30",
                  )}
                  style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
                  onClick={() =>
                    dispatch({
                      type: "SELECT_VARIANT",
                      slideIndex: state.currentSlide,
                      variantIndex: entry.originalIndex,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      dispatch({
                        type: "SELECT_VARIANT",
                        slideIndex: state.currentSlide,
                        variantIndex: entry.originalIndex,
                      });
                    }
                  }}
                  title={
                    variant.label || `Variant ${visibleVariants.length - displayIndex}`
                  }
                >
                  {entry.isBlank ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/20 text-muted-foreground">
                      <span className="text-[0.55rem] uppercase tracking-wide opacity-60">
                        Pending
                      </span>
                    </div>
                  ) : hasImage && variant.filename ? (
                    <img
                      src={`/slides/${variant.filename}?v=${variant.createdAt}`}
                      alt={`Variant ${visibleVariants.length - displayIndex}`}
                      className="h-full w-full object-cover"
                    />
                  ) : hasHtml ? (
                    <VariantIframeThumbnail
                      aspectRatio={state.aspectRatio}
                      thumbHtml={thumbHtml}
                      variant={variant}
                      bgColor={thumbThemeConfig.background || "#000"}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                      v{visibleVariants.length - displayIndex}
                    </div>
                  )}

                  <button
                    type="button"
                    className="absolute right-0.5 top-0.5 hidden size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete({
                        payloadKey: entry.payloadKey,
                        label,
                      });
                    }}
                    aria-label={`Delete ${label}`}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-2.5" />
                  </button>
                </div>

                <span className="text-[0.65rem] text-muted-foreground truncate px-0.5">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete variant?</DialogTitle>
            <DialogDescription>
              This removes {pendingDelete?.label || "this variant"} from the
              slide. The change is persisted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                dispatch({
                  type: "DELETE_VARIANT_GROUP",
                  slideIndex: state.currentSlide,
                  payloadKey: pendingDelete.payloadKey,
                });
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

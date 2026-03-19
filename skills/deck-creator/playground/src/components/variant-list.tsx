"use client";

import { useMemo } from "react";
import type { DeckState, DeckAction } from "@/lib/types";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { toCssAspectRatio } from "@/lib/aspect-ratio";
import { deriveDisplayVariants } from "@/lib/variant-display";
import { Badge } from "@/components/ui/badge";

/** Strip script tags from HTML to prevent sandbox console errors in thumbnails. */
function stripScripts(html: string): string {
  return html.replace(/<script[\s>][\s\S]*?<\/script>/gi, "");
}

interface VariantListProps {
  state: DeckState;
  dispatch: React.Dispatch<DeckAction>;
}

export function VariantList({ state, dispatch }: VariantListProps) {
  const slide = state.slides[state.currentSlide];
  if (!slide) return null;

  const visibleVariants = useMemo(() => deriveDisplayVariants(slide), [slide]);

  if (!visibleVariants.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-xs text-muted-foreground mb-2">No variants yet</p>
        <p className="text-[0.6rem] text-muted-foreground/60">
          Generate a slide to create variants
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-0.5">
        <Badge variant="secondary" className="text-[0.55rem] h-3.5 px-1">
          {visibleVariants.length} variant
          {visibleVariants.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      {visibleVariants.map((entry, displayIndex) => {
        const { variant } = entry;
        const isActive = entry.isActive;
        const hasImage = entry.renderMode === "image";
        const hasHtml = entry.renderMode === "html";
        const label = variant.label || `v${visibleVariants.length - displayIndex}`;

        return (
          <div key={variant.id} className="flex flex-col gap-1">
            <button
              type="button"
              className={cn(
                "group relative rounded-md border overflow-hidden transition-all w-full",
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
                <div className="h-full w-full overflow-hidden bg-black">
                  {variant.htmlContent ? (
                    <iframe
                      srcDoc={stripScripts(variant.htmlContent)}
                      className="h-full w-full pointer-events-none border-0"
                      sandbox="allow-same-origin"
                      tabIndex={-1}
                    />
                  ) : variant.filename ? (
                    <iframe
                      src={`/slides/${variant.filename}?v=${variant.createdAt}`}
                      className="h-full w-full pointer-events-none border-0"
                      sandbox="allow-same-origin"
                      tabIndex={-1}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                  v{visibleVariants.length - displayIndex}
                </div>
              )}

              {visibleVariants.length > 1 && (
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 hidden size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({
                      type: "DELETE_VARIANT_GROUP",
                      slideIndex: state.currentSlide,
                      payloadKey: entry.payloadKey,
                    });
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-2.5" />
                </button>
              )}
            </button>
            <span className="text-[0.65rem] text-muted-foreground truncate px-0.5">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import type { DeckState, DeckAction } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAspectCanvasSize } from "@/lib/aspect-ratio";

interface CanvasToolbarProps {
  state: DeckState;
  dispatch: React.Dispatch<DeckAction>;
}

export function CanvasToolbar({ state, dispatch }: CanvasToolbarProps) {
  const slide = state.slides[state.currentSlide];
  if (!slide) return null;
  const canvasSize = getAspectCanvasSize(state.aspectRatio);

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
      <Tabs
        value={slide.renderMode}
        onValueChange={(v) =>
          dispatch({
            type: "SET_RENDER_MODE",
            mode: v as "image" | "html",
          })
        }
      >
        <TabsList className="h-6 p-0.5">
          <TabsTrigger value="image" className="h-5 px-2 text-[0.6rem]">
            Image
          </TabsTrigger>
          <TabsTrigger value="html" className="h-5 px-2 text-[0.6rem]">
            HTML
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="ml-auto text-[0.55rem] text-muted-foreground">
        {state.currentSlide + 1}/{state.slides.length} · {canvasSize.width} ×{" "}
        {canvasSize.height}
      </span>
    </div>
  );
}

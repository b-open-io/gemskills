"use client";

import {
  Film01Icon,
  Image01Icon,
  PlusSignIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchConfig,
  generateVideo,
  getVideoStatus,
  uploadBackground,
} from "@/lib/api";
import { toCssAspectRatio } from "@/lib/aspect-ratio";
import {
  getBackgroundMediaKind,
  resolveBackgroundMediaSrc,
} from "@/lib/background-media";
import type { DeckAction, DeckState } from "@/lib/types";
import { cn } from "@/lib/utils";

interface VideoBackgroundProps {
  state: DeckState;
  dispatch: React.Dispatch<DeckAction>;
}

function isExternalVideoUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^\/\//.test(value);
}

function prettyVideoName(filename: string): string {
  return filename
    .replace(/\.mp4$/i, "")
    .replace(/^\d{8}-\d{6}-/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function prettyImageName(filename: string): string {
  return filename
    .replace(/\.(png|jpg|jpeg|webp)$/i, "")
    .replace(/^bg-/, "")
    .replace(/^\d{8}-\d{6}-/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

export function VideoBackground({ state, dispatch }: VideoBackgroundProps) {
  const [veoPrompt, setVeoPrompt] = useState("");
  const [veoDuration, setVeoDuration] = useState("8");
  const [veoGenerating, setVeoGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [libraryTab, setLibraryTab] = useState<"video" | "image">("video");
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const selectedMedia = state.videoUrl || null;
  const selectedKind = getBackgroundMediaKind(selectedMedia || undefined);
  const selectedIsLibraryVideo = selectedMedia
    ? state.existingVideos.includes(selectedMedia)
    : false;
  const selectedIsLibraryImage = selectedMedia
    ? state.existingBackgroundImages.includes(selectedMedia)
    : false;
  const selectedLabel = selectedMedia
    ? selectedIsLibraryVideo
      ? prettyVideoName(selectedMedia)
      : selectedIsLibraryImage
        ? prettyImageName(selectedMedia)
        : isExternalVideoUrl(selectedMedia)
          ? "External URL"
          : selectedMedia
    : "None selected";
  const selectedMediaSrc = resolveBackgroundMediaSrc(
    selectedMedia || undefined,
  );
  const manualUrlValue =
    selectedMedia && (selectedIsLibraryVideo || selectedIsLibraryImage)
      ? ""
      : state.videoUrl;

  async function handleGenerateVideo() {
    if (!veoPrompt) {
      toast.error("Enter a Veo prompt first");
      return;
    }

    setVeoGenerating(true);
    dispatch({ type: "SET_STATUS", text: "Starting video generation..." });

    try {
      const data = await generateVideo({
        prompt: veoPrompt,
        aspectRatio: state.aspectRatio,
        styleId: state.styleId || undefined,
        styleRecipeId: state.styleRecipeId ?? null,
        styleRecipes: state.styleRecipes,
        stylePrompt: state.stylePrompt || undefined,
        themeConfig: state.themeConfig,
        duration: veoDuration,
      });
      if (data.ok && data.filename) {
        dispatch({
          type: "SET_STATUS",
          text: `Generating ${prettyVideoName(data.filename)}...`,
        });
      }

      if (data.ok && data.jobId) {
        pollRef.current = setInterval(async () => {
          try {
            const statusData = await getVideoStatus(data.jobId!);
            if (statusData.status === "done") {
              clearInterval(pollRef.current);
              const videoFile =
                statusData.filename ||
                statusData.videoPath?.split("/").pop() ||
                "";
              dispatch({
                type: "SET_FIELD",
                field: "videoUrl",
                value: videoFile,
              });
              setVeoGenerating(false);
              setVeoPrompt("");
              dispatch({ type: "SET_STATUS", text: "Ready" });
              toast.success(
                videoFile
                  ? `Added to library: ${prettyVideoName(videoFile)}`
                  : "Video generated!",
              );

              try {
                const config = await fetchConfig();
                if (config.deckState?.existingVideos) {
                  dispatch({
                    type: "SET_VIDEOS",
                    videos: config.deckState.existingVideos as string[],
                  });
                }
                if (config.deckState?.existingBackgroundImages) {
                  dispatch({
                    type: "SET_FIELD",
                    field: "existingBackgroundImages",
                    value: config.deckState
                      .existingBackgroundImages as string[],
                  });
                }
              } catch (error: unknown) {
                const msg =
                  error instanceof Error ? error.message : String(error);
                console.error(`Failed to refresh video library: ${msg}`);
              }
            } else if (statusData.status === "error") {
              clearInterval(pollRef.current);
              setVeoGenerating(false);
              dispatch({
                type: "SET_STATUS",
                text: `Video generation failed: ${statusData.error || "Unknown"}`,
              });
              toast.error(`Video failed: ${statusData.error || "Unknown"}`);
            } else {
              dispatch({
                type: "SET_STATUS",
                text: "Generating video... (this may take 1-6 minutes)",
              });
            }
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            clearInterval(pollRef.current);
            setVeoGenerating(false);
            dispatch({
              type: "SET_STATUS",
              text: `Video status polling failed: ${msg}`,
            });
            console.error(`Video status polling failed: ${msg}`);
            toast.error(`Video status polling failed: ${msg}`);
          }
        }, 5000);
      } else {
        toast.error("Failed to start video generation");
        setVeoGenerating(false);
        dispatch({
          type: "SET_STATUS",
          text: "Video generation failed to start",
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Video generation request failed: ${msg}`);
      toast.error(`Video generation failed: ${msg}`);
      setVeoGenerating(false);
      dispatch({
        type: "SET_STATUS",
        text: `Video generation failed: ${msg}`,
      });
    }
  }

  async function handleUploadFile(file: File) {
    setUploading(true);
    dispatch({ type: "SET_STATUS", text: "Uploading background media..." });
    try {
      const data = await uploadBackground(file);
      if (!data.ok || !data.filename || !data.mediaType) {
        throw new Error(data.error || "Upload failed");
      }
      dispatch({
        type: "SET_FIELD",
        field: "videoUrl",
        value: data.filename,
      });
      const config = await fetchConfig();
      if (config.deckState?.existingVideos) {
        dispatch({
          type: "SET_VIDEOS",
          videos: config.deckState.existingVideos as string[],
        });
      }
      if (config.deckState?.existingBackgroundImages) {
        dispatch({
          type: "SET_FIELD",
          field: "existingBackgroundImages",
          value: config.deckState.existingBackgroundImages as string[],
        });
      }
      dispatch({ type: "SET_STATUS", text: "Ready" });
      toast.success(
        data.mediaType === "video"
          ? `Uploaded video: ${prettyVideoName(data.filename)}`
          : `Uploaded image: ${prettyImageName(data.filename)}`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      dispatch({ type: "SET_STATUS", text: `Upload failed: ${msg}` });
      toast.error(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1">
      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
        Background Media
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
          >
            {selectedMedia ? (
              selectedKind === "image" ? (
                <img
                  src={selectedMediaSrc}
                  className="h-6 w-10 rounded-sm object-cover"
                  alt=""
                />
              ) : (
                <video
                  src={selectedMediaSrc}
                  className="h-6 w-10 rounded-sm object-cover"
                  muted
                  preload="metadata"
                />
              )
            ) : (
              <div className="flex h-6 w-10 items-center justify-center rounded-sm bg-muted">
                <HugeiconsIcon
                  icon={Film01Icon}
                  className="size-3 text-muted-foreground"
                />
              </div>
            )}
            <span className="flex-1 truncate">{selectedLabel}</span>
            <span className="text-[0.6rem] text-muted-foreground">
              {state.existingVideos.length +
                state.existingBackgroundImages.length}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-2"
          side="right"
          align="start"
          sideOffset={8}
        >
          {/* Generate new video */}
          <div className="mb-2 space-y-1.5 border-b border-border pb-2">
            <Label className="text-[0.65rem] text-muted-foreground">
              Generate with Veo
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                value={veoPrompt}
                placeholder="Abstract ambient loop..."
                className="h-7 flex-1 text-xs"
                onChange={(e) => setVeoPrompt(e.target.value)}
              />
              <Select value={veoDuration} onValueChange={setVeoDuration}>
                <SelectTrigger className="h-7 w-14 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4s</SelectItem>
                  <SelectItem value="6">6s</SelectItem>
                  <SelectItem value="8">8s</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 w-full text-xs"
              disabled={veoGenerating || !veoPrompt}
              onClick={handleGenerateVideo}
            >
              <HugeiconsIcon icon={PlusSignIcon} className="size-3 mr-1.5" />
              {veoGenerating ? "Generating..." : "Generate Video"}
            </Button>
            {veoGenerating && <Progress className="h-1" />}
          </div>

          {/* Upload */}
          <div className="mb-2 space-y-1.5 border-b border-border pb-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                void handleUploadFile(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-xs"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <HugeiconsIcon icon={Upload01Icon} className="mr-1.5 size-3" />
              {uploading ? "Uploading..." : "Upload Image or Video"}
            </Button>
          </div>

          {/* Media gallery */}
          <div className="mb-2 flex items-center gap-1 rounded-md border border-border p-0.5">
            <button
              type="button"
              className={cn(
                "h-6 flex-1 rounded-sm text-[0.65rem] font-medium",
                libraryTab === "video"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setLibraryTab("video")}
            >
              Videos ({state.existingVideos.length})
            </button>
            <button
              type="button"
              className={cn(
                "h-6 flex-1 rounded-sm text-[0.65rem] font-medium",
                libraryTab === "image"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setLibraryTab("image")}
            >
              Images ({state.existingBackgroundImages.length})
            </button>
          </div>
          <ScrollArea className="h-44">
            {libraryTab === "video" ? (
              state.existingVideos.length === 0 ? (
                <p className="py-4 text-center text-[0.65rem] text-muted-foreground/70">
                  No videos yet
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {state.existingVideos.map((v) => {
                    const isActive = state.videoUrl === v;
                    return (
                      <button
                        type="button"
                        key={v}
                        className={cn(
                          "group relative overflow-hidden rounded-sm border transition-all hover:ring-1 hover:ring-primary/50",
                          isActive ? "ring-2 ring-primary" : "border-border",
                        )}
                        style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
                        title={v}
                        onClick={() => {
                          dispatch({
                            type: "SET_FIELD",
                            field: "videoUrl",
                            value: isActive ? "" : v,
                          });
                          if (!isActive) setOpen(false);
                        }}
                      >
                        <video
                          src={`/videos/${v}`}
                          className="h-full w-full object-cover"
                          muted
                          preload="metadata"
                          onMouseEnter={(e) => {
                            const el = e.currentTarget;
                            el.currentTime = 0;
                            el.play().catch(() => {});
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                          }}
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[0.5rem] text-white/80 truncate opacity-0 transition-opacity group-hover:opacity-100">
                          {prettyVideoName(v)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )
            ) : state.existingBackgroundImages.length === 0 ? (
              <p className="py-4 text-center text-[0.65rem] text-muted-foreground/70">
                No background images yet
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {state.existingBackgroundImages.map((imgName) => {
                  const isActive = state.videoUrl === imgName;
                  return (
                    <button
                      type="button"
                      key={imgName}
                      className={cn(
                        "group relative overflow-hidden rounded-sm border transition-all hover:ring-1 hover:ring-primary/50",
                        isActive ? "ring-2 ring-primary" : "border-border",
                      )}
                      style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
                      title={imgName}
                      onClick={() => {
                        dispatch({
                          type: "SET_FIELD",
                          field: "videoUrl",
                          value: isActive ? "" : imgName,
                        });
                        if (!isActive) setOpen(false);
                      }}
                    >
                      <img
                        src={`/slides/${imgName}`}
                        className="h-full w-full object-cover"
                        alt=""
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[0.5rem] text-white/80 truncate opacity-0 transition-opacity group-hover:opacity-100">
                        {prettyImageName(imgName)}
                      </span>
                      <div className="absolute right-1 top-1 rounded bg-black/50 p-0.5 text-white/70">
                        <HugeiconsIcon
                          icon={Image01Icon}
                          className="size-2.5"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* URL override */}
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            <Label className="text-[0.65rem] text-muted-foreground">
              External URL (optional)
            </Label>
            <Input
              value={manualUrlValue}
              placeholder="https://...mp4, .m3u8, .png, .jpg"
              className="h-7 text-xs"
              onChange={(e) =>
                dispatch({
                  type: "SET_FIELD",
                  field: "videoUrl",
                  value: e.target.value,
                })
              }
            />
            <p className="text-[0.6rem] text-muted-foreground leading-relaxed">
              Library media is preserved and selectable above. Use this only for
              an external image/video URL.
            </p>
          </div>

          {/* Loop toggle */}
          {selectedKind === "video" && (
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <Label className="text-[0.65rem] text-muted-foreground">
                Loop video
              </Label>
              <button
                type="button"
                role="switch"
                aria-checked={state.videoLoop}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                  state.videoLoop ? "bg-primary" : "bg-muted",
                )}
                onClick={() =>
                  dispatch({
                    type: "SET_FIELD",
                    field: "videoLoop",
                    value: !state.videoLoop,
                  })
                }
              >
                <span
                  className={cn(
                    "pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                    state.videoLoop ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

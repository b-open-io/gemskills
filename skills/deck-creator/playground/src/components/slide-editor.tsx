"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
	buildBackdropPrompt,
	generateVideo,
	getVideoStatus,
	regenerateBackdrop,
} from "@/lib/api";
import { toCssAspectRatio } from "@/lib/aspect-ratio";
import type { DeckAction, DeckState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnnotationList } from "./annotation-list";

/** Extract the backdrop image filename from HTML content's background-image CSS. */
function extractBackdropFilename(html: string | undefined): string | null {
	if (!html) return null;
	const match = html.match(/url\(['"]?\/slides\/([^'")\s]+)['"]?\)/);
	return match?.[1] ?? null;
}

interface SlideEditorProps {
	state: DeckState;
	dispatch: React.Dispatch<DeckAction>;
	onGenerate?: () => void;
}

const SLIDE_TYPES = [
	"Title",
	"Problem Statement",
	"Solution",
	"Market Opportunity",
	"How It Works",
	"Benefits",
	"Content",
	"Stats",
	"Quote",
	"Comparison",
	"Timeline",
	"Team",
	"Social Proof",
	"Metrics",
	"Competitive Advantage",
	"Roadmap",
	"Pricing",
	"CTA",
	"Closing",
];

export function SlideEditor({
	state,
	dispatch,
	onGenerate,
}: SlideEditorProps) {
	const slide = state.slides[state.currentSlide];
	if (!slide) return null;

	const activeVariant = slide.variants?.[slide.activeVariant];
	const backdropFilename = extractBackdropFilename(
		activeVariant?.htmlContent || slide.htmlContent,
	);
	const slideBackdropVideo = activeVariant?.backdropVideo || slide.backdropVideo;

	// Animate backdrop → video state
	const [animating, setAnimating] = useState(false);
	const animateJobRef = useRef<string | null>(null);
	const animatePollRef = useRef<ReturnType<typeof setInterval>>(undefined);

	// Clean up polling on unmount
	useEffect(() => {
		return () => {
			if (animatePollRef.current) clearInterval(animatePollRef.current);
		};
	}, []);

	const handleAnimate = useCallback(async () => {
		if (!backdropFilename || animating) return;
		setAnimating(true);
		try {
			const result = await generateVideo({
				prompt: `Animate this presentation slide backdrop into elegant seamless looping motion. Bring the static image to life with subtle parallax, light shifts, particle effects, or gentle ambient animation.`,
				aspectRatio: state.aspectRatio,
				styleId: state.styleId || undefined,
				styleRecipeId: state.styleRecipeId ?? null,
				styleRecipes: state.styleRecipes,
				stylePrompt: state.stylePrompt || undefined,
				themeConfig: state.themeConfig,
				duration: "8",
				inputImagePath: backdropFilename,
			});
			if (!result.ok || !result.jobId) {
				toast.error(`Animate failed: ${result.error || "Unknown error"}`);
				setAnimating(false);
				return;
			}
			animateJobRef.current = result.jobId;
			toast.info("Animating backdrop...");

			// Poll for completion
			animatePollRef.current = setInterval(async () => {
				if (!animateJobRef.current) return;
				try {
					const status = await getVideoStatus(animateJobRef.current);
					if (status.status === "done" && status.filename) {
						clearInterval(animatePollRef.current);
						animatePollRef.current = undefined;
						animateJobRef.current = null;
						setAnimating(false);
						// Set backdrop video on both slide level and active variant
						// so it persists across reloads via VARIANTS.json
						dispatch({
							type: "SET_SLIDE_FIELD",
							index: state.currentSlide,
							field: "backdropVideo",
							value: status.filename,
						});
						dispatch({
							type: "SET_ACTIVE_VARIANT_BACKDROP",
							slideIndex: state.currentSlide,
							backdropVideo: status.filename,
						});
						toast.success("Backdrop animated successfully");
					} else if (status.status === "error") {
						clearInterval(animatePollRef.current);
						animatePollRef.current = undefined;
						animateJobRef.current = null;
						setAnimating(false);
						toast.error(`Animate failed: ${status.error || "Unknown error"}`);
					}
				} catch {
					// transient poll error, keep trying
				}
			}, 3000);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			toast.error(`Animate failed: ${msg}`);
			setAnimating(false);
		}
	}, [backdropFilename, animating, state.aspectRatio, state.styleId, state.styleRecipeId, state.styleRecipes, state.stylePrompt, state.themeConfig, state.currentSlide, dispatch]);

	// Regenerate backdrop only (keep HTML content)
	const [regenning, setRegenning] = useState(false);
	const [regenDialogOpen, setRegenDialogOpen] = useState(false);
	const [regenPrompt, setRegenPrompt] = useState("");
	const [loadingPrompt, setLoadingPrompt] = useState(false);

	const handleOpenRegenDialog = useCallback(async () => {
		setLoadingPrompt(true);
		try {
			const result = await buildBackdropPrompt({
				aspectRatio: state.aspectRatio,
				styleId: state.styleId || undefined,
				styleRecipeId: state.styleRecipeId ?? null,
				styleRecipes: state.styleRecipes,
				stylePrompt: state.stylePrompt || undefined,
				themeConfig: state.themeConfig,
				visualConcept: slide.visualConcept || undefined,
			});
			if (result.ok && result.prompt) {
				setRegenPrompt(result.prompt);
				setRegenDialogOpen(true);
			} else {
				toast.error(`Failed to build prompt: ${result.error || "Unknown error"}`);
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			toast.error(`Failed to build prompt: ${msg}`);
		} finally {
			setLoadingPrompt(false);
		}
	}, [state.aspectRatio, state.styleId, state.styleRecipeId, state.styleRecipes, state.stylePrompt, state.themeConfig, slide]);

	const handleConfirmRegen = useCallback(async () => {
		if (regenning || !regenPrompt.trim()) return;
		setRegenning(true);
		setRegenDialogOpen(false);
		try {
			const result = await regenerateBackdrop({
				prompt: regenPrompt,
				aspectRatio: state.aspectRatio,
				styleId: state.styleId || undefined,
				styleRecipeId: state.styleRecipeId ?? null,
				styleRecipes: state.styleRecipes,
				stylePrompt: state.stylePrompt || undefined,
			});

			if (!result.ok || !result.filename) {
				toast.error(`Regen backdrop failed: ${result.error || "Unknown error"}`);
				setRegenning(false);
				return;
			}

			// Update the active variant's HTML to reference the new backdrop
			const currentHtml = activeVariant?.htmlContent || slide.htmlContent;
			if (currentHtml && backdropFilename) {
				const updatedHtml = currentHtml.replace(
					new RegExp(backdropFilename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
					result.filename,
				);
				dispatch({
					type: "SET_ACTIVE_VARIANT_HTML",
					slideIndex: state.currentSlide,
					html: updatedHtml,
				});
			}
			toast.success("Backdrop regenerated");
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			toast.error(`Regen backdrop failed: ${msg}`);
		} finally {
			setRegenning(false);
		}
	}, [regenning, regenPrompt, state.aspectRatio, state.styleId, state.styleRecipeId, state.styleRecipes, state.stylePrompt, state.currentSlide, slide, activeVariant, backdropFilename, dispatch]);

	return (
		<div className="space-y-3">
			{/* Headline */}
			<div className="space-y-1">
				<Label htmlFor="headline" className="text-xs">
					Headline
				</Label>
				<Input
					id="headline"
					value={slide.headline}
					placeholder="Slide headline..."
					className="h-7 text-xs"
					onChange={(e) =>
						dispatch({
							type: "SET_SLIDE_FIELD",
							index: state.currentSlide,
							field: "headline",
							value: e.target.value,
						})
					}
				/>
			</div>

			{/* Content */}
			<div className="space-y-1">
				<Label htmlFor="content" className="text-xs">
					Content
				</Label>
				<Textarea
					id="content"
					value={slide.content}
					placeholder="Key points, bullet text..."
					className="min-h-14 text-xs"
					onChange={(e) =>
						dispatch({
							type: "SET_SLIDE_FIELD",
							index: state.currentSlide,
							field: "content",
							value: e.target.value,
						})
					}
				/>
			</div>

			{/* Per-slide Direction */}
			<div className="space-y-1">
				<Label htmlFor="visualConcept" className="text-xs">
					Per-Slide Direction
				</Label>
				<Input
					id="visualConcept"
					value={slide.visualConcept}
					placeholder="Describe unique layout/content for this slide..."
					className="h-7 text-xs"
					onChange={(e) =>
						dispatch({
							type: "SET_SLIDE_FIELD",
							index: state.currentSlide,
							field: "visualConcept",
							value: e.target.value,
						})
					}
				/>
				<p className="text-[11px] text-muted-foreground">
					Use this for slide-specific composition/content direction only. Global
					aesthetic rules belong in Style Recipe.
				</p>
			</div>

			{slide.renderMode === "html" && (
				<div className="space-y-1">
					<Label className="text-xs">Background Mode</Label>
					<Select
						value={slide.backgroundMode}
						onValueChange={(value: "transparent" | "opaque" | "solid" | "gradient") =>
							dispatch({
								type: "SET_SLIDE_FIELD",
								index: state.currentSlide,
								field: "backgroundMode",
								value,
							})
						}
					>
						<SelectTrigger className="h-7 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="opaque">Opaque (model draws backdrop)</SelectItem>
							<SelectItem value="transparent">
								Transparent (show global background media)
							</SelectItem>
							<SelectItem value="solid">Solid (theme background color)</SelectItem>
							<SelectItem value="gradient">Gradient (theme palette)</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-[11px] text-muted-foreground">
						Transparent mode keeps the slide surface open so selected image/video
						background shows through. Opaque mode generates a slide-owned
						backdrop.
					</p>
				</div>
			)}

			{/* Backdrop Image/Video Preview */}
			{slide.renderMode === "html" &&
				slide.backgroundMode === "opaque" &&
				(backdropFilename || slideBackdropVideo) && (
					<div className="space-y-1">
						<div className="flex items-center justify-between">
							<Label className="text-xs">Slide Backdrop</Label>
							{backdropFilename && !slideBackdropVideo && (
								<div className="flex gap-1">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-6 px-2 text-[0.65rem]"
										onClick={handleOpenRegenDialog}
										disabled={regenning || loadingPrompt}
									>
										{regenning ? (
											<>
												<Spinner className="mr-1 size-3" />
												Regen...
											</>
										) : (
											"Regen Backdrop"
										)}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-6 px-2 text-[0.65rem]"
										onClick={handleAnimate}
										disabled={animating}
									>
										{animating ? (
											<>
												<Spinner className="mr-1 size-3" />
												Animating...
											</>
										) : (
											"Animate"
										)}
									</Button>
								</div>
							)}
						</div>
						{/* Backdrop variants strip */}
						{(() => {
							const slidePrefix = String(slide.index).padStart(2, "0");
							const bgPattern = new RegExp(`^${slidePrefix}-.*bg.*\\.(png|jpg|jpeg|webp)$`, "i");
							const matchingBackdrops = state.existingBackgroundImages.filter(f => bgPattern.test(f));
							// Also collect backdrop videos from variants
							const variantVideos = (slide.variants || [])
								.map(v => v.backdropVideo)
								.filter((v): v is string => !!v);
							const allBackdrops = [...new Set([...matchingBackdrops, ...variantVideos])];
							if (allBackdrops.length <= 1) return null;
							return (
								<div className="flex gap-1 overflow-x-auto pb-1">
									{allBackdrops.map((name) => {
										const isVideo = /\.mp4$/i.test(name);
										const isActive = isVideo
											? slideBackdropVideo === name
											: backdropFilename === name;
										return (
											<button
												key={name}
												type="button"
												className={cn(
													"relative shrink-0 h-12 rounded border overflow-hidden",
													isActive ? "ring-2 ring-primary border-primary" : "border-border opacity-70 hover:opacity-100",
												)}
												style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
												onClick={() => {
													if (isVideo) {
														dispatch({
															type: "SET_SLIDE_FIELD",
															index: state.currentSlide,
															field: "backdropVideo",
															value: name,
														});
														dispatch({
															type: "SET_ACTIVE_VARIANT_BACKDROP",
															slideIndex: state.currentSlide,
															backdropVideo: name,
														});
													} else {
														// Replace backdrop image reference in HTML
														const currentHtml = activeVariant?.htmlContent || slide.htmlContent;
														if (currentHtml && backdropFilename) {
															const updatedHtml = currentHtml.replace(
																new RegExp(backdropFilename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
																name,
															);
															dispatch({
																type: "SET_ACTIVE_VARIANT_HTML",
																slideIndex: state.currentSlide,
																html: updatedHtml,
															});
														}
														// Clear any backdrop video when switching to static image
														if (slideBackdropVideo) {
															dispatch({
																type: "SET_SLIDE_FIELD",
																index: state.currentSlide,
																field: "backdropVideo",
																value: undefined,
															});
														}
													}
												}}
											>
												{isVideo ? (
													<video
														src={`/videos/${name}`}
														muted
														playsInline
														className="h-full w-full object-cover"
														onMouseEnter={(e) => e.currentTarget.play()}
														onMouseLeave={(e) => {
															e.currentTarget.pause();
															e.currentTarget.currentTime = 0;
														}}
													/>
												) : (
													<img
														src={`/slides/${name}`}
														alt=""
														className="h-full w-full object-cover"
													/>
												)}
											</button>
										);
									})}
								</div>
							);
						})()}
						<div
							className="overflow-hidden rounded-md border border-border max-h-48"
							style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
						>
							{slideBackdropVideo ? (
								<video
									src={`/videos/${slideBackdropVideo}`}
									autoPlay
									loop
									muted
									playsInline
									className="h-full w-full object-cover"
								/>
							) : backdropFilename ? (
								<img
									src={`/slides/${backdropFilename}?v=${activeVariant?.createdAt || Date.now()}`}
									alt="Slide backdrop"
									className="h-full w-full object-cover"
								/>
							) : null}
						</div>
						<p className="text-[11px] text-muted-foreground">
							{slideBackdropVideo
								? "Animated backdrop video. Re-generate the slide to replace."
								: "Re-generate the slide to get a new backdrop."}
						</p>
						{/* Per-slide loop toggle */}
						{slideBackdropVideo && (
							<div className="flex items-center justify-between">
								<Label className="text-[0.65rem] text-muted-foreground">
									Loop video
								</Label>
								<button
									type="button"
									role="switch"
									aria-checked={slide.backdropVideoLoop !== false}
									className={cn(
										"relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
										slide.backdropVideoLoop !== false ? "bg-primary" : "bg-muted",
									)}
									onClick={() =>
										dispatch({
											type: "SET_SLIDE_FIELD",
											index: state.currentSlide,
											field: "backdropVideoLoop",
											value: slide.backdropVideoLoop === false,
										})
									}
								>
									<span
										className={cn(
											"pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
											slide.backdropVideoLoop !== false ? "translate-x-4" : "translate-x-0",
										)}
									/>
								</button>
							</div>
						)}
					</div>
				)}

			{/* Per-slide Background Media Override */}
			{slide.renderMode === "html" && (
				<div className="space-y-1">
					<div className="flex items-center justify-between">
						<Label className="text-xs">Background Media</Label>
						{slide.backgroundMediaUrl && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-6 px-2 text-[0.65rem]"
								onClick={() =>
									dispatch({
										type: "SET_SLIDE_FIELD",
										index: state.currentSlide,
										field: "backgroundMediaUrl",
										value: undefined,
									})
								}
							>
								Reset to deck default
							</Button>
						)}
					</div>
					<p className="text-[11px] text-muted-foreground">
						{slide.backgroundMediaUrl
							? `Slide override: ${slide.backgroundMediaUrl.replace(/^.*[\\/]/, "").replace(/\.(mp4|png|jpg|jpeg|webp)$/i, "").replace(/[-_]+/g, " ")}`
							: `Deck default${state.videoUrl ? `: ${state.videoUrl.replace(/^.*[\\/]/, "").replace(/\.(mp4|png|jpg|jpeg|webp)$/i, "").replace(/[-_]+/g, " ")}` : ": none"}`}
					</p>
					{(state.existingVideos.length > 0 || state.existingBackgroundImages.length > 0) && (
						<div className="flex gap-1 overflow-x-auto pb-1">
							{state.existingVideos.map((v) => (
								<button
									key={v}
									type="button"
									className={cn(
										"relative shrink-0 h-10 rounded border overflow-hidden group",
										slide.backgroundMediaUrl === v ? "ring-2 ring-primary border-primary" : "border-border opacity-70 hover:opacity-100",
									)}
									style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
									onClick={() =>
										dispatch({
											type: "SET_SLIDE_FIELD",
											index: state.currentSlide,
											field: "backgroundMediaUrl",
											value: v,
										})
									}
								>
									<video
										src={`/videos/${v}`}
										muted
										playsInline
										className="h-full w-full object-cover"
										onMouseEnter={(e) => e.currentTarget.play()}
										onMouseLeave={(e) => {
											e.currentTarget.pause();
											e.currentTarget.currentTime = 0;
										}}
									/>
								</button>
							))}
							{state.existingBackgroundImages.map((img) => (
								<button
									key={img}
									type="button"
									className={cn(
										"relative shrink-0 h-10 rounded border overflow-hidden group",
										slide.backgroundMediaUrl === img ? "ring-2 ring-primary border-primary" : "border-border opacity-70 hover:opacity-100",
									)}
									style={{ aspectRatio: toCssAspectRatio(state.aspectRatio) }}
									onClick={() =>
										dispatch({
											type: "SET_SLIDE_FIELD",
											index: state.currentSlide,
											field: "backgroundMediaUrl",
											value: img,
										})
									}
								>
									<img
										src={`/slides/${img}`}
										alt=""
										className="h-full w-full object-cover"
									/>
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{/* Type + Generate */}
			<div className="flex items-end gap-2">
				<div className="flex-1 space-y-1">
					<Label className="text-xs">Type</Label>
					<Select
						value={slide.type}
						onValueChange={(v) =>
							dispatch({
								type: "SET_SLIDE_FIELD",
								index: state.currentSlide,
								field: "type",
								value: v,
							})
						}
					>
						<SelectTrigger className="h-7 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SLIDE_TYPES.map((t) => (
								<SelectItem key={t} value={t}>
									{t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Annotations */}
			{onGenerate && (
				<AnnotationList
					state={state}
					dispatch={dispatch}
					onRegenerate={onGenerate}
				/>
			)}

			{/* Speaker Notes */}
			<div className="space-y-1">
				<Label className="text-xs">Speaker Notes</Label>
				<Textarea
					value={state.annotationsFile.notes[slide.index] || ""}
					placeholder="Notes for this slide..."
					className="min-h-10 text-xs"
					onChange={(e) =>
						dispatch({
							type: "SET_SPEAKER_NOTE",
							slideIndex: slide.index,
							note: e.target.value,
						})
					}
				/>
			</div>
		{/* Regen Backdrop Dialog */}
			{regenDialogOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div className="w-full max-w-xl rounded-lg border border-border bg-card p-4 shadow-xl">
						<h3 className="mb-2 text-sm font-semibold">Regenerate Backdrop</h3>
						<p className="mb-3 text-xs text-muted-foreground">
							Edit the prompt below to steer the backdrop generation. The system prompt includes your theme colors, art style, and composition rules.
						</p>
						<Textarea
							value={regenPrompt}
							onChange={(e) => setRegenPrompt(e.target.value)}
							className="mb-3 min-h-40 text-xs font-mono"
							placeholder="Backdrop generation prompt..."
						/>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setRegenDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								onClick={handleConfirmRegen}
								disabled={regenning || !regenPrompt.trim()}
							>
								{regenning ? (
									<>
										<Spinner className="mr-1 size-3" />
										Generating...
									</>
								) : (
									"Generate Backdrop"
								)}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

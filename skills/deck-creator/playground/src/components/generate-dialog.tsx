"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateHtmlSlide, generateImageSlide } from "@/lib/api";
import {
	getBackgroundMediaKind,
	resolveBackgroundMediaSrc,
} from "@/lib/background-media";
import {
	buildSlidePrompt,
	getGenerationAnnotationsForSlide,
} from "@/lib/hooks";
import type { DeckAction, DeckState } from "@/lib/types";

interface GenerateDialogProps {
	mode: "single" | "all" | null;
	state: DeckState;
	dispatch: React.Dispatch<DeckAction>;
	onClose: () => void;
}

export function GenerateDialog({
	mode,
	state,
	dispatch,
	onClose,
}: GenerateDialogProps) {
	const [direction, setDirection] = useState("");
	const [reviewPass, setReviewPass] = useState(true);
	const [batchActive, setBatchActive] = useState(false);
	const [batchProgress, setBatchProgress] = useState(0);
	const [batchTotal, setBatchTotal] = useState(0);
	const [batchCompleted, setBatchCompleted] = useState(0);
	const [batchStatus, setBatchStatus] = useState("");
	const [slideStatuses, setSlideStatuses] = useState<Map<number, string>>(
		new Map(),
	);
	const [enabledSlides, setEnabledSlides] = useState<Set<number>>(new Set());

	// Reset local state when mode changes — enable all target slides by default.
	// Intentionally only depends on `mode` — state.slides changes from toggles
	// must NOT reset the user's direction/checkbox selections.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only reset on mode change
	useEffect(() => {
		setDirection("");
		setReviewPass(true);
		setBatchActive(false);
		setBatchProgress(0);
		setBatchTotal(0);
		setBatchCompleted(0);
		setBatchStatus("");
		setSlideStatuses(new Map());
		if (mode === "all") {
			const pending = state.slides.filter((s) => s.status !== "done");
			const targets = pending.length > 0 ? pending : state.slides;
			setEnabledSlides(new Set(targets.map((s) => s.index)));
		} else {
			setEnabledSlides(new Set());
		}
	}, [mode]);

	if (!mode) return null;

	const slide = state.slides[state.currentSlide];
	const isSingle = mode === "single";
	const pendingSlides = state.slides.filter((s) => s.status !== "done");
	// When all slides are done, offer to regenerate all of them
	const targetSlides = pendingSlides.length > 0 ? pendingSlides : state.slides;
	const isRegenerate = pendingSlides.length === 0 && state.slides.length > 0;

	const sendStatus = (text: string) => {
		dispatch({ type: "SET_STATUS", text });
		setBatchStatus(text);
	};

	async function handleConfirm() {
		if (!state.title.trim()) {
			toast.error("Set a deck title before generating");
			return;
		}
		if (isSingle) {
			await handleGenerateSingle();
		} else {
			await handleGenerateAll();
		}
	}

	async function handleGenerateSingle() {
		if (!slide) return;
		if (slide.renderMode === "html" && !slide.headline.trim()) {
			toast.error("Add a headline to this slide before generating");
			return;
		}

		// Close dialog, then start generation
		const dir = direction;
		onClose();

		dispatch({ type: "SET_GENERATING", generating: true });
		dispatch({
			type: "SET_SLIDE_STATUS",
			index: state.currentSlide,
			status: "generating",
		});
		dispatch({
			type: "SET_STATUS",
			text: `Generating slide ${slide.index}...`,
		});
		let nextStatusText = "Ready";

		try {
			if (slide.renderMode === "html") {
				const openAnns = getGenerationAnnotationsForSlide(slide, state);
				const mediaKind = getBackgroundMediaKind(state.videoUrl || undefined);

				const data = await generateHtmlSlide(
					{
						slideIndex: slide.index,
						aspectRatio: state.aspectRatio,
						headline: slide.headline,
						content: slide.content,
						type: slide.type,
						visualConcept:
							[slide.visualConcept, dir].filter(Boolean).join("\n") ||
							undefined,
						backgroundMode: slide.backgroundMode,
						styleId: state.styleId || undefined,
						styleRecipeId: state.styleRecipeId ?? null,
						styleRecipes: state.styleRecipes,
						stylePrompt: state.stylePrompt || undefined,
						deckTitle: state.title,
						audience: state.audience,
						filename: slide.filename,
						annotations: openAnns.length > 0 ? openAnns : undefined,
						hasVideoBackground: mediaKind === "video",
						videoUrl: state.videoUrl || undefined,
						backgroundMediaType: mediaKind,
						backgroundMediaUrl:
							mediaKind === "image"
								? resolveBackgroundMediaSrc(state.videoUrl || undefined)
								: undefined,
						fontFamily: state.fontFamily || undefined,
						themeConfig: state.themeConfig,
						skipReview: !reviewPass,
					},
					sendStatus,
				);

				if (data.ok) {
					dispatch({
						type: "SET_SLIDE_STATUS",
						index: state.currentSlide,
						status: "done",
						recordVariant: true,
						htmlContent: data.html,
						filename: data.filename,
					});
					toast.success(`HTML slide ${slide.index} generated`);
				} else {
					const msg = data.error || "Unknown error";
					dispatch({
						type: "SET_SLIDE_STATUS",
						index: state.currentSlide,
						status: "error",
						error: msg,
						rawOutput: data.rawOutput,
					});
					nextStatusText = `Generation failed: ${msg}`;
					toast.error(`Failed: ${msg}`);
				}
			} else {
				const slideWithDirection = dir
					? {
							...slide,
							visualConcept: [slide.visualConcept, dir]
								.filter(Boolean)
								.join("\n"),
						}
					: slide;
				const prompt = buildSlidePrompt(slideWithDirection, state);
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
					toast.success(`Slide ${slide.index} generated`);
				} else {
					const msg = data.error || "Unknown error";
					dispatch({
						type: "SET_SLIDE_STATUS",
						index: state.currentSlide,
						status: "error",
						error: msg,
						rawOutput: data.rawOutput,
					});
					nextStatusText = `Generation failed: ${msg}`;
					toast.error(`Failed: ${msg}`);
				}
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			dispatch({
				type: "SET_SLIDE_STATUS",
				index: state.currentSlide,
				status: "error",
				error: msg,
			});
			nextStatusText = `Generation failed: ${msg}`;
			console.error(`Slide generation failed: ${msg}`);
			toast.error(`Generate failed: ${msg}`);
		}

		dispatch({ type: "SET_GENERATING", generating: false });
		dispatch({ type: "SET_STATUS", text: nextStatusText });
	}

	async function handleGenerateAll() {
		const slidesToGenerate = targetSlides.filter((s) =>
			enabledSlides.has(s.index),
		);
		if (slidesToGenerate.length === 0) {
			toast.info("No slides selected for generation");
			return;
		}

		const dir = direction;
		setBatchActive(true);
		setBatchProgress(0);
		setBatchTotal(slidesToGenerate.length);
		setBatchCompleted(0);
		dispatch({ type: "SET_GENERATING", generating: true });

		let completed = 0;
		let failed = 0;

		for (const batchSlide of slidesToGenerate) {
			dispatch({
				type: "SET_STATUS",
				text: `Generating ${completed + 1}/${slidesToGenerate.length}...`,
			});

			const idx = state.slides.findIndex((s) => s.index === batchSlide.index);
			dispatch({
				type: "SET_SLIDE_STATUS",
				index: idx,
				status: "generating",
			});

			try {
				if (batchSlide.renderMode === "html") {
					const openAnns = getGenerationAnnotationsForSlide(batchSlide, state);
					const mediaKind = getBackgroundMediaKind(state.videoUrl || undefined);

					const updateSlideStatus = (msg: string) => {
						setSlideStatuses((prev) => {
							const next = new Map(prev);
							next.set(batchSlide.index, msg);
							return next;
						});
						sendStatus(`Slide ${batchSlide.index}: ${msg}`);
					};
					updateSlideStatus("Starting...");

					const data = await generateHtmlSlide(
						{
							slideIndex: batchSlide.index,
							aspectRatio: state.aspectRatio,
							headline: batchSlide.headline,
							content: batchSlide.content,
							type: batchSlide.type,
							visualConcept:
								[batchSlide.visualConcept, dir].filter(Boolean).join("\n") ||
								undefined,
							backgroundMode: batchSlide.backgroundMode,
							styleId: state.styleId || undefined,
							styleRecipeId: state.styleRecipeId ?? null,
							styleRecipes: state.styleRecipes,
							stylePrompt: state.stylePrompt || undefined,
							deckTitle: state.title,
							audience: state.audience,
							filename: batchSlide.filename,
							annotations: openAnns.length > 0 ? openAnns : undefined,
							hasVideoBackground: mediaKind === "video",
							videoUrl: state.videoUrl || undefined,
							backgroundMediaType: mediaKind,
							backgroundMediaUrl:
								mediaKind === "image"
									? resolveBackgroundMediaSrc(state.videoUrl || undefined)
									: undefined,
							fontFamily: state.fontFamily || undefined,
							themeConfig: state.themeConfig,
							skipReview: !reviewPass,
						},
						updateSlideStatus,
					);

					if (data.ok) {
						setSlideStatuses((prev) => {
							const next = new Map(prev);
							next.set(batchSlide.index, "Done");
							return next;
						});
						dispatch({
							type: "SET_SLIDE_STATUS",
							index: idx,
							status: "done",
							recordVariant: true,
							htmlContent: data.html,
							filename: data.filename,
						});
					} else {
						failed++;
						setSlideStatuses((prev) => {
							const next = new Map(prev);
							next.set(
								batchSlide.index,
								`Failed: ${data.error || "Unknown error"}`,
							);
							return next;
						});
						dispatch({
							type: "SET_SLIDE_STATUS",
							index: idx,
							status: "error",
							error: data.error || "Unknown error",
							rawOutput: data.rawOutput,
						});
					}
				} else {
					const slideWithDirection = dir
						? {
								...batchSlide,
								visualConcept: [batchSlide.visualConcept, dir]
									.filter(Boolean)
									.join("\n"),
							}
						: batchSlide;
					const prompt = buildSlidePrompt(slideWithDirection, state);
					const data = await generateImageSlide({
						slideIndex: batchSlide.index,
						aspectRatio: state.aspectRatio,
						prompt,
						styleId: state.styleId || undefined,
						styleRecipeId: state.styleRecipeId ?? null,
						styleRecipes: state.styleRecipes,
						stylePrompt: state.stylePrompt || undefined,
						filename: batchSlide.filename,
					});

					if (data.ok) {
						dispatch({
							type: "SET_SLIDE_STATUS",
							index: idx,
							status: "done",
							recordVariant: true,
							filename: data.filename,
						});
					} else {
						failed++;
						dispatch({
							type: "SET_SLIDE_STATUS",
							index: idx,
							status: "error",
							error: data.error || "Unknown error",
							rawOutput: data.rawOutput,
						});
					}
				}
			} catch (error: unknown) {
				const msg = error instanceof Error ? error.message : String(error);
				console.error(
					`Batch generation failed for slide ${batchSlide.index}: ${msg}`,
				);
				failed++;
				dispatch({
					type: "SET_SLIDE_STATUS",
					index: idx,
					status: "error",
					error: msg,
				});
			}

			completed++;
			setBatchCompleted(completed);
			setBatchProgress((completed / slidesToGenerate.length) * 100);
		}

		dispatch({ type: "SET_GENERATING", generating: false });
		setBatchActive(false);
		setBatchProgress(0);

		if (failed > 0) {
			dispatch({
				type: "SET_STATUS",
				text: `Generation completed with ${failed} failure(s)`,
			});
			toast.error(`Generated ${completed} slides with ${failed} failure(s)`);
		} else {
			dispatch({ type: "SET_STATUS", text: "Ready" });
			toast.success(`Generated ${completed} slides`);
		}

		onClose();
	}

	return (
		<Dialog
			open={!!mode}
			onOpenChange={(open) => {
				if (!open && !batchActive) onClose();
			}}
		>
			<DialogContent
				showCloseButton={!batchActive}
				className="sm:max-w-2xl max-h-[85vh] grid-rows-[auto_1fr_auto]"
				onPointerDownOutside={(e) => {
					if (batchActive) e.preventDefault();
				}}
				onEscapeKeyDown={(e) => {
					if (batchActive) e.preventDefault();
				}}
			>
				{isSingle && slide ? (
					<>
						<DialogHeader>
							<DialogTitle>
								Generate Slide {slide.index}: {slide.headline || slide.title}
							</DialogTitle>
							<DialogDescription>
								Review the slide content below. Add any additional direction to
								steer the generation.
							</DialogDescription>
						</DialogHeader>
						<ScrollArea className="min-h-0">
							<ItemGroup>
								<Item variant="muted" size="sm">
									<ItemContent>
										<ItemTitle>{slide.headline || "(no headline)"}</ItemTitle>
										<ItemDescription className="whitespace-pre-wrap">
											{slide.content || "(no content)"}
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<ToggleGroup
											type="single"
											size="sm"
											variant="outline"
											value={slide.renderMode}
											onValueChange={(v) => {
												if (!v) return;
												dispatch({
													type: "SET_SLIDE_FIELD",
													index: state.currentSlide,
													field: "renderMode",
													value: v,
												});
											}}
										>
											<ToggleGroupItem
												value="html"
												className="h-5 px-1.5 text-[0.6rem]"
											>
												HTML
											</ToggleGroupItem>
											<ToggleGroupItem
												value="image"
												className="h-5 px-1.5 text-[0.6rem]"
											>
												Image
											</ToggleGroupItem>
										</ToggleGroup>
									</ItemActions>
								</Item>
							</ItemGroup>
							{slide.visualConcept && (
								<p className="mt-2 text-xs text-muted-foreground italic">
									{slide.visualConcept}
								</p>
							)}
						</ScrollArea>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>
								{isRegenerate ? "Regenerate All Slides" : "Generate All Slides"}
							</DialogTitle>
							<DialogDescription>
								{batchActive
									? `Generating ${batchCompleted} of ${batchTotal} slides...`
									: isRegenerate
										? `All ${state.slides.length} slides have been generated. Select which to regenerate with current settings.`
										: `${pendingSlides.length} slide${pendingSlides.length !== 1 ? "s" : ""} pending. Review the content going into each slide.`}
							</DialogDescription>
						</DialogHeader>
						{batchActive ? (
							<div className="space-y-3 min-h-0 flex flex-col">
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{batchCompleted} of {batchTotal} complete
									</span>
									<span>{Math.round(batchProgress)}%</span>
								</div>
								<Progress value={batchProgress} className="h-2" />
								<ScrollArea className="flex-1 min-h-0">
									<div className="space-y-1 pr-2">
										{targetSlides
											.filter((s) => enabledSlides.has(s.index))
											.map((s) => {
												const status = slideStatuses.get(s.index);
												const isDone = status === "Done";
												const isFailed = status?.startsWith("Failed");
												return (
													<div
														key={s.index}
														className={`flex min-w-0 items-center gap-2 text-xs py-1 px-2 rounded ${
															isDone
																? "text-green-400/80 bg-green-400/5"
																: isFailed
																	? "text-red-400/80 bg-red-400/5"
																	: status
																		? "text-foreground/80 bg-muted/30"
																		: "text-muted-foreground/50"
														}`}
													>
														<span className="font-mono w-5 shrink-0 text-right text-muted-foreground/60">
															{s.index}
														</span>
														<span className="truncate flex-1 font-medium">
															{s.headline || "(untitled)"}
														</span>
														<span className="truncate max-w-[45%] text-right text-[0.65rem]">
															{isDone
																? "Done"
																: isFailed
																	? status
																	: status || "Queued"}
														</span>
													</div>
												);
											})}
									</div>
								</ScrollArea>
							</div>
						) : (
							<ScrollArea className="min-h-0">
								<div className="flex items-center justify-between mb-2 px-1">
									<button
										type="button"
										className="text-[0.65rem] text-muted-foreground hover:text-foreground"
										onClick={() => {
											if (enabledSlides.size === targetSlides.length) {
												setEnabledSlides(new Set());
											} else {
												setEnabledSlides(
													new Set(targetSlides.map((s) => s.index)),
												);
											}
										}}
									>
										{enabledSlides.size === targetSlides.length
											? "Deselect all"
											: "Select all"}
									</button>
									<span className="text-[0.6rem] text-muted-foreground">
										{enabledSlides.size} of {targetSlides.length} selected
									</span>
								</div>
								<ItemGroup>
									{targetSlides.map((s) => {
										const slideIdx = state.slides.findIndex(
											(sl) => sl.index === s.index,
										);
										const enabled = enabledSlides.has(s.index);
										return (
											<Item
												key={s.index}
												variant="muted"
												size="sm"
												className={enabled ? "" : "opacity-40"}
											>
												<Checkbox
													checked={enabled}
													onCheckedChange={(checked) => {
														setEnabledSlides((prev) => {
															const next = new Set(prev);
															if (checked) {
																next.add(s.index);
															} else {
																next.delete(s.index);
															}
															return next;
														});
													}}
													className="shrink-0"
												/>
												<ItemContent>
													<ItemTitle>
														<span className="font-mono text-muted-foreground/60 mr-1.5">
															{s.index}
														</span>
														{s.headline || s.title || "(no headline)"}
													</ItemTitle>
													<ItemDescription className="line-clamp-2">
														{s.content || "(no content)"}
													</ItemDescription>
													{s.visualConcept && (
														<p className="text-[0.6rem] text-muted-foreground/70 italic mt-0.5">
															{s.visualConcept}
														</p>
													)}
												</ItemContent>
												<ItemActions>
													<ToggleGroup
														type="single"
														size="sm"
														variant="outline"
														value={s.renderMode}
														onValueChange={(v) => {
															if (!v) return;
															dispatch({
																type: "SET_SLIDE_FIELD",
																index: slideIdx,
																field: "renderMode",
																value: v,
															});
														}}
													>
														<ToggleGroupItem
															value="html"
															className="h-5 px-1.5 text-[0.6rem]"
														>
															HTML
														</ToggleGroupItem>
														<ToggleGroupItem
															value="image"
															className="h-5 px-1.5 text-[0.6rem]"
														>
															Image
														</ToggleGroupItem>
													</ToggleGroup>
												</ItemActions>
											</Item>
										);
									})}
								</ItemGroup>
							</ScrollArea>
						)}
					</>
				)}

				{!batchActive && (
					<div className="space-y-4">
						<div>
							<Label className="text-xs">
								{isSingle
									? "Additional Direction (optional)"
									: "Direction for All Slides (optional)"}
							</Label>
							<Textarea
								value={direction}
								onChange={(e) => setDirection(e.target.value)}
								className="mt-1 min-h-20 text-xs"
								placeholder={
									isSingle
										? "e.g. 'Use a three-column card layout', 'Make the background more abstract'..."
										: "e.g. 'Keep layouts minimal with lots of whitespace', 'Use bold typography'..."
								}
							/>
						</div>
						<DialogFooter className="flex items-center sm:justify-between">
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
											<Checkbox
												checked={reviewPass}
												onCheckedChange={(checked) => setReviewPass(!!checked)}
											/>
											Review pass
										</label>
									</TooltipTrigger>
									<TooltipContent side="top" sideOffset={4}>
										Adds a second AI pass to check layout, typography, and
										content visibility. Takes longer and uses more tokens but
										produces more consistent output.
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							<div className="flex gap-2">
								<Button variant="outline" size="sm" onClick={onClose}>
									Cancel
								</Button>
								<Button
									size="sm"
									onClick={handleConfirm}
									disabled={!isSingle && enabledSlides.size === 0}
								>
									{isSingle
										? "Generate"
										: `${isRegenerate ? "Regenerate" : "Generate"} ${enabledSlides.size} Slide${enabledSlides.size !== 1 ? "s" : ""}`}
								</Button>
							</div>
						</DialogFooter>
					</div>
				)}

				{batchActive && (
					<DialogFooter>
						<p className="text-[0.65rem] text-muted-foreground">
							Do not close this window during generation
						</p>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}

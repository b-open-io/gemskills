"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "@/components/ui/sidebar";
import {
	buildPdf,
	buildPresenter,
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
import type { DeckAction, DeckState } from "@/lib/types";

interface BuildSectionProps {
	state: DeckState;
	dispatch: React.Dispatch<DeckAction>;
}

export function BuildSection({ state, dispatch }: BuildSectionProps) {
	const [batchProgress, setBatchProgress] = useState(0);
	const [batchActive, setBatchActive] = useState(false);
	const [generating, setGenerating] = useState(false);

	async function handleGenerateAll() {
		const pending = state.slides.filter((s) => s.status !== "done");
		if (pending.length === 0) {
			toast.info("All slides already generated");
			return;
		}

		setGenerating(true);
		setBatchActive(true);
		setBatchProgress(0);

		let completed = 0;
		let failed = 0;

		for (const slide of pending) {
			dispatch({
				type: "SET_STATUS",
				text: `Generating ${completed + 1}/${pending.length}...`,
			});

			const idx = state.slides.findIndex((s) => s.index === slide.index);
			dispatch({
				type: "SET_SLIDE_STATUS",
				index: idx,
				status: "generating",
			});

			try {
				if (slide.renderMode === "html") {
					const openAnns = getGenerationAnnotationsForSlide(slide, state);
					const mediaKind = getBackgroundMediaKind(state.videoUrl || undefined);

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
						hasVideoBackground: mediaKind === "video",
						videoUrl: state.videoUrl || undefined,
						backgroundMediaType: mediaKind,
						backgroundMediaUrl:
							mediaKind === "image"
								? resolveBackgroundMediaSrc(state.videoUrl || undefined)
								: undefined,
						fontFamily: state.fontFamily || undefined,
						themeConfig: state.themeConfig,
					});

					if (data.ok) {
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
						dispatch({
							type: "SET_SLIDE_STATUS",
							index: idx,
							status: "error",
							error: data.error || "Unknown error",
							rawOutput: data.rawOutput,
						});
					}
				} else {
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
					`Batch generation failed for slide ${slide.index}: ${msg}`,
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
			setBatchProgress((completed / pending.length) * 100);
		}

		setGenerating(false);
		setBatchActive(false);
		setBatchProgress(0);
		if (failed > 0) {
			dispatch({
				type: "SET_STATUS",
				text: `Generation completed with ${failed} failure(s)`,
			});
			toast.error(`Generated ${completed} slides with ${failed} failure(s)`);
			return;
		}
		dispatch({ type: "SET_STATUS", text: "Ready" });
		toast.success(`Generated ${completed} slides`);
	}

	async function handleBuildPdf() {
		dispatch({ type: "SET_STATUS", text: "Building PDF..." });
		let nextStatusText = "Ready";
		try {
			const data = await buildPdf();
			if (data.ok) {
				toast.success(`PDF built: ${data.path}`);
			} else {
				const msg = data.error || "Unknown";
				nextStatusText = `PDF build failed: ${msg}`;
				toast.error(`PDF failed: ${msg}`);
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Build PDF failed: ${msg}`);
			nextStatusText = `PDF build failed: ${msg}`;
			toast.error(`Build PDF failed: ${msg}`);
		}
		dispatch({ type: "SET_STATUS", text: nextStatusText });
	}

	async function handleBuildPresenter() {
		dispatch({ type: "SET_STATUS", text: "Building presenter..." });
		let nextStatusText = "Ready";
		try {
			const data = await buildPresenter(state.videoUrl || undefined);
			if (data.ok) {
				toast.success("Presenter built!");
				window.open("/presenter", "_blank");
			} else {
				const msg = data.error || "Unknown";
				nextStatusText = `Presenter build failed: ${msg}`;
				toast.error(`Build failed: ${msg}`);
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Build presenter failed: ${msg}`);
			nextStatusText = `Presenter build failed: ${msg}`;
			toast.error(`Build presenter failed: ${msg}`);
		}
		dispatch({ type: "SET_STATUS", text: nextStatusText });
	}

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Build</SidebarGroupLabel>
			<SidebarGroupContent className="space-y-2 px-2">
				<Button
					className="w-full"
					disabled={generating}
					onClick={handleGenerateAll}
				>
					Generate All Slides
				</Button>
				<Button variant="outline" className="w-full" onClick={handleBuildPdf}>
					Build PDF
				</Button>
				<Button
					variant="outline"
					className="w-full"
					onClick={handleBuildPresenter}
				>
					Build Presenter
				</Button>
				{batchActive && <Progress value={batchProgress} className="h-1" />}
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	bootstrapDeck,
	getSiblingDecks,
	pickDeckDirectory,
	saveDeck,
	switchDeck,
} from "@/lib/api";
import { setAutoSaveEnabled } from "@/lib/hooks";
import type { DeckAction, DeckState, SlideState } from "@/lib/types";

interface OnboardingDialogProps {
	open: boolean;
	state: DeckState;
	dispatch: React.Dispatch<DeckAction>;
	onComplete: () => void;
}

export function OnboardingDialog({
	open,
	state,
	dispatch,
	onComplete,
}: OnboardingDialogProps) {
	const [title, setTitle] = useState("");
	const [audience, setAudience] = useState("");
	const [purpose, setPurpose] = useState("Persuade");
	const [slideCount, setSlideCount] = useState("8");
	const [creating, setCreating] = useState(false);
	const [switching, setSwitching] = useState(false);
	const [browsing, setBrowsing] = useState(false);
	const [recentDecks, setRecentDecks] = useState<
		Array<{ name: string; path: string; hasPlan: boolean }>
	>([]);

	useEffect(() => {
		if (!open) return;
		getSiblingDecks()
			.then((data) => setRecentDecks(data.recent || []))
			.catch(() => {
				// ignore: recents are optional for onboarding
			});
	}, [open]);

	async function handleSwitchDeck(path: string) {
		if (!path || switching || creating) return;
		setSwitching(true);
		setAutoSaveEnabled(false);
		try {
			const result = await switchDeck(path);
			if (!result.ok) {
				setAutoSaveEnabled(true);
				toast.error(result.error || "Failed to switch deck");
				return;
			}
			toast.success(`Opened ${result.path}`);
			onComplete();
			window.location.href = window.location.pathname;
		} catch {
			setAutoSaveEnabled(true);
			toast.error("Network error switching deck");
		} finally {
			setSwitching(false);
		}
	}

	async function handleBrowseAndOpen() {
		if (browsing || switching || creating) return;
		setBrowsing(true);
		try {
			const picked = await pickDeckDirectory();
			if (picked.ok && picked.path) {
				await handleSwitchDeck(picked.path);
			} else if (!picked.cancelled) {
				toast.error(picked.error || "Failed to pick deck directory");
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			toast.error(`Failed to open folder picker: ${msg}`);
		} finally {
			setBrowsing(false);
		}
	}

	async function handleCreate() {
		if (!title.trim() || creating) return;
		const count = Math.max(
			1,
			Math.min(30, Number.parseInt(slideCount, 10) || 8),
		);
		setCreating(true);
		dispatch({
			type: "SET_STATUS",
			text: "Generating deck blueprint...",
		});

		try {
			const result = await bootstrapDeck({
				title: title.trim(),
				audience: audience.trim(),
				purpose,
				context: state.context,
				keyMessage: state.keyMessage,
				tone: state.tone,
				slideCount: count,
			});
			if (
				!result.ok ||
				!Array.isArray(result.slides) ||
				result.slides.length === 0
			) {
				throw new Error(result.error || "Bootstrap returned no slides");
			}

			const generatedSlides: SlideState[] = result.slides.map((slide) => ({
				index: slide.index,
				title: slide.title,
				headline: slide.headline,
				content: slide.content,
				visualConcept: slide.visualConcept,
				backgroundMode: slide.backgroundMode || "opaque",
				type: slide.type,
				status: "pending",
				filename: slide.filename,
				renderMode: slide.renderMode,
				variants: [],
				activeVariant: 0,
			}));

			dispatch({ type: "SET_FIELD", field: "title", value: title.trim() });
			dispatch({
				type: "SET_FIELD",
				field: "audience",
				value: audience.trim(),
			});
			dispatch({ type: "SET_FIELD", field: "purpose", value: purpose });
			dispatch({ type: "SET_FIELD", field: "slideCount", value: count });
			dispatch({ type: "SET_SLIDES", slides: generatedSlides });
			dispatch({ type: "SET_CURRENT_SLIDE", index: 0 });

			dispatch({ type: "SET_STATUS", text: "Scaffolding deck files..." });
			await saveDeck({
				deckDir: state.deckDir,
				aspectRatio: state.aspectRatio,
				title: title.trim(),
				audience: audience.trim(),
				purpose,
				context: state.context,
				keyMessage: state.keyMessage,
				brandNotes: state.brandNotes,
				tone: state.tone,
				fontFamily: state.fontFamily,
				themeConfig: state.themeConfig,
				slideCount: count,
				styleId: state.styleId,
				styleRecipeId: state.styleRecipeId,
				styleRecipes: state.styleRecipes,
				stylePrompt: state.stylePrompt,
				backgroundMedia: state.videoUrl,
				slides: generatedSlides.map((slide) => ({
					index: slide.index,
					title: slide.title,
					headline: slide.headline,
					content: slide.content,
					visualConcept: slide.visualConcept,
					backgroundMode: slide.backgroundMode,
					type: slide.type,
					filename: slide.filename,
					renderMode: slide.renderMode,
				})),
				annotations: state.annotations,
			});

			dispatch({ type: "SET_STATUS", text: "Ready" });
			toast.success("Deck blueprint created");
			onComplete();
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			dispatch({ type: "SET_STATUS", text: `Bootstrap failed: ${msg}` });
			toast.error(`Failed to initialize deck: ${msg}`);
		} finally {
			setCreating(false);
		}
	}

	return (
		<Dialog open={open}>
			<DialogContent
				className="sm:max-w-md"
				onInteractOutside={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>New Deck</DialogTitle>
					<DialogDescription>
						Set up your presentation. We will generate a full slide blueprint
						(headlines, content, and per-slide direction) that you can refine
						before rendering visuals.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="onb-title">Title</Label>
						<Input
							id="onb-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Q4 Product Strategy"
							disabled={creating}
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreate();
							}}
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="onb-audience">Audience</Label>
						<Input
							id="onb-audience"
							value={audience}
							onChange={(e) => setAudience(e.target.value)}
							placeholder="Investors, leadership team..."
							disabled={creating}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label>Purpose</Label>
							<Select
								value={purpose}
								onValueChange={setPurpose}
								disabled={creating}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Persuade">Persuade</SelectItem>
									<SelectItem value="Inform">Inform</SelectItem>
									<SelectItem value="Propose">Propose</SelectItem>
									<SelectItem value="Sell">Sell</SelectItem>
									<SelectItem value="Educate">Educate</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="onb-slides">Slides</Label>
							<Input
								id="onb-slides"
								type="number"
								value={slideCount}
								min={1}
								max={30}
								disabled={creating}
								onChange={(e) => setSlideCount(e.target.value)}
							/>
						</div>
					</div>

					{recentDecks.length > 0 && (
						<div className="space-y-1.5 border-t pt-3">
							<Label>Recent Decks</Label>
							<div className="max-h-28 space-y-1 overflow-y-auto pr-1">
								{recentDecks.slice(0, 6).map((deck) => (
									<button
										key={deck.path}
										type="button"
										onClick={() => handleSwitchDeck(deck.path)}
										disabled={creating || switching || browsing}
										className="w-full rounded border border-border/60 px-2 py-1.5 text-left text-xs hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
										title={deck.path}
									>
										<div className="truncate font-medium">{deck.name}</div>
										<div className="truncate text-[10px] text-muted-foreground">
											{deck.path}
										</div>
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleBrowseAndOpen}
						disabled={creating || switching || browsing}
					>
						{browsing || switching ? "Opening..." : "Open Existing Deck"}
					</Button>
					<Button
						onClick={handleCreate}
						disabled={!title.trim() || creating || switching || browsing}
					>
						{creating ? "Creating..." : "Create Deck"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

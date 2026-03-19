"use client";

import { MagicWand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { StyleRecipeInfo } from "@/lib/style-recipes";
import type { DeckAction, DeckState } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StyleRecipePickerProps {
	state: DeckState;
	dispatch: React.Dispatch<DeckAction>;
}

function slugifyRecipeId(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function buildUniqueRecipeId(
	name: string,
	existingRecipes: StyleRecipeInfo[],
): string {
	const base = slugifyRecipeId(name) || "custom-style-recipe";
	const existingIds = new Set(existingRecipes.map((recipe) => recipe.id));
	if (!existingIds.has(base)) return base;
	let n = 2;
	while (existingIds.has(`${base}-${n}`)) n += 1;
	return `${base}-${n}`;
}

export function StyleRecipePicker({ state, dispatch }: StyleRecipePickerProps) {
	const [open, setOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [recipeName, setRecipeName] = useState("");
	const [recipePrompt, setRecipePrompt] = useState("");

	const selectedRecipe =
		state.styleRecipes.find((r) => r.id === state.styleRecipeId) || null;

	const trimmedName = recipeName.trim();
	const trimmedPrompt = recipePrompt.trim();
	const canCreate = trimmedName.length > 0 || trimmedPrompt.length > 0;
	const projectedId = useMemo(
		() =>
			canCreate
				? buildUniqueRecipeId(
						trimmedName ||
							trimmedPrompt.split("\n").find((line) => line.trim()) ||
							"custom-style-recipe",
						state.styleRecipes,
					)
				: "",
		[canCreate, state.styleRecipes, trimmedName, trimmedPrompt],
	);

	function handleCreateRecipe() {
		if (!canCreate) return;
		const firstPromptLine =
			trimmedPrompt
				.split("\n")
				.find((line) => line.trim())
				?.trim() || "";
		const resolvedName =
			trimmedName || firstPromptLine || "Custom Style Recipe";
		const instructions = trimmedPrompt || resolvedName;
		const nextRecipe: StyleRecipeInfo = {
			id: projectedId,
			name: resolvedName,
			description: `Custom recipe: ${instructions.slice(0, 140)}`,
			instructions,
		};
		dispatch({
			type: "SET_FIELD",
			field: "styleRecipes",
			value: [...state.styleRecipes, nextRecipe],
		});
		dispatch({
			type: "SET_FIELD",
			field: "styleRecipeId",
			value: nextRecipe.id,
		});
		setRecipeName("");
		setRecipePrompt("");
		setCreateOpen(false);
		setOpen(false);
	}

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
					Style Recipe
				</span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-6 px-2 text-[0.65rem] uppercase tracking-wide"
					onClick={() => setCreateOpen(true)}
					title="Add style recipe"
				>
					Add
				</Button>
			</div>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
					>
						<div className="flex h-6 w-6 items-center justify-center rounded-sm bg-muted">
							<HugeiconsIcon
								icon={MagicWand01Icon}
								className="size-3 text-muted-foreground"
							/>
						</div>
						<span className="flex-1 truncate">
							{selectedRecipe?.name || "None"}
						</span>
						<span className="text-[0.6rem] text-muted-foreground">
							{state.styleRecipes.length}
						</span>
					</button>
				</PopoverTrigger>
				<PopoverContent
					className="w-72 p-2"
					side="right"
					align="start"
					sideOffset={8}
				>
					<ScrollArea className="max-h-64">
						<div className="space-y-1">
							<button
								type="button"
								className="flex w-full items-center justify-center rounded-md border border-dashed border-border px-2.5 py-2 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/50"
								onClick={() => {
									setOpen(false);
									setCreateOpen(true);
								}}
							>
								Add Style Recipe
							</button>
							<button
								type="button"
								className={cn(
									"flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-all hover:bg-muted/50",
									!state.styleRecipeId
										? "border-primary ring-1 ring-primary"
										: "border-transparent",
								)}
								onClick={() => {
									dispatch({
										type: "SET_FIELD",
										field: "styleRecipeId",
										value: null,
									});
									setOpen(false);
								}}
							>
								<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
									<span className="text-[0.6rem]">--</span>
								</div>
								<div className="min-w-0">
									<p className="text-xs font-medium truncate">None</p>
									<p className="text-[0.6rem] text-muted-foreground leading-snug">
										Use art style only
									</p>
								</div>
							</button>

							{state.styleRecipes.map((recipe) => {
								const isActive = state.styleRecipeId === recipe.id;
								return (
									<button
										type="button"
										key={recipe.id}
										className={cn(
											"flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-all hover:bg-muted/50",
											isActive
												? "border-primary ring-1 ring-primary"
												: "border-transparent",
										)}
										onClick={() => {
											dispatch({
												type: "SET_FIELD",
												field: "styleRecipeId",
												value: isActive ? null : recipe.id,
											});
											if (!isActive) setOpen(false);
										}}
									>
										<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/10">
											<HugeiconsIcon
												icon={MagicWand01Icon}
												className="size-3.5 text-primary"
											/>
										</div>
										<div className="min-w-0">
											<p className="text-xs font-medium truncate">
												{recipe.name}
											</p>
											<p className="text-[0.6rem] text-muted-foreground leading-snug line-clamp-2">
												{recipe.description}
											</p>
										</div>
									</button>
								);
							})}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Add Style Recipe</DialogTitle>
						<DialogDescription>
							Create a persistent recipe by naming the style and pasting the
							full prompt/instructions.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3">
						<div className="space-y-1.5">
							<Label htmlFor="style-recipe-name">Style Name</Label>
							<Input
								id="style-recipe-name"
								value={recipeName}
								onChange={(e) => setRecipeName(e.target.value)}
								placeholder="Animated CRT glitch typography"
								autoFocus
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="style-recipe-intent">Prompt / Instructions</Label>
							<Textarea
								id="style-recipe-intent"
								value={recipePrompt}
								onChange={(e) => setRecipePrompt(e.target.value)}
								placeholder="Paste a full style recipe prompt here"
								className="min-h-32"
							/>
						</div>
						{projectedId ? (
							<p className="text-[0.65rem] text-muted-foreground">
								Saved id: <code>{projectedId}</code>
							</p>
						) : null}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setCreateOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleCreateRecipe}
							disabled={!canCreate}
						>
							Add Recipe
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

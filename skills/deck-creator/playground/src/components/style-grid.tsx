"use client"

import { useState, useMemo, useCallback } from "react"
import type { DeckState, DeckAction } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card"

interface StyleGridProps {
	state: DeckState
	dispatch: React.Dispatch<DeckAction>
}

export function StyleGrid({ state, dispatch }: StyleGridProps) {
	const [search, setSearch] = useState("")
	const [open, setOpen] = useState(false)

	const filteredStyles = useMemo(() => {
		if (!search) return state.styles
		const q = search.toLowerCase()
		return state.styles.filter(
			(s) =>
				s.name.toLowerCase().includes(q) ||
				(s.shortName || "").toLowerCase().includes(q) ||
				s.id.includes(q),
		)
	}, [state.styles, search])

	const selectedStyle = state.styles.find((s) => s.id === state.styleId)

	const persistStyle = useCallback((newStyleId: string | null) => {
		fetch("/api/deck", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				deckDir: state.deckDir,
				styleId: newStyleId || "none",
				styleRecipeId: state.styleRecipeId,
				styleRecipes: state.styleRecipes,
				stylePrompt: state.stylePrompt,
				slideThemeMode: state.slideThemeMode,
				themeConfig: state.themeConfig,
				themeModes: state.themeModes,
				aspectRatio: state.aspectRatio,
				fontFamily: state.fontFamily,
				backgroundMedia: state.videoUrl,
			}),
		}).catch((error: unknown) => {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`Failed to persist style: ${msg}`);
		});
	}, [state.deckDir, state.styleRecipeId, state.styleRecipes, state.stylePrompt, state.slideThemeMode, state.themeConfig, state.themeModes, state.aspectRatio, state.fontFamily, state.videoUrl])

	return (
		<div className="space-y-1">
			<span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
				Art Style
			</span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
					>
						{selectedStyle?.hasTile ? (
							<img
								src={`/tile/${selectedStyle.id}`}
								alt={selectedStyle.name}
								className="h-6 w-6 rounded-sm object-cover"
							/>
						) : (
							<div className="flex h-6 w-6 items-center justify-center rounded-sm bg-muted text-[0.5rem] text-muted-foreground">
								--
							</div>
						)}
						<span className="flex-1 truncate">
							{selectedStyle?.name || "None selected"}
						</span>
						<span className="text-[0.6rem] text-muted-foreground">
							{state.styles.length}
						</span>
					</button>
				</PopoverTrigger>
				<PopoverContent
					className="w-72 p-2"
					side="right"
					align="start"
					sideOffset={8}
				>
					<Input
						placeholder={`Search ${state.styles.length} styles...`}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="mb-2 h-7 text-xs"
						autoFocus
					/>
					<ScrollArea className="h-64">
						<div className="grid grid-cols-5 gap-1">
							{filteredStyles.map((s) => (
								<HoverCard key={s.id} openDelay={200} closeDelay={0}>
									<HoverCardTrigger asChild>
										<button
											type="button"
											className={`aspect-square overflow-hidden rounded-sm border transition-all hover:ring-1 hover:ring-primary/50 ${
												s.id === state.styleId
													? "ring-2 ring-primary"
													: "border-border"
											}`}
											onClick={() => {
												const newId = s.id === state.styleId ? null : s.id;
												dispatch({ type: "SET_STYLE", id: newId })
												persistStyle(newId)
												if (s.id !== state.styleId) setOpen(false)
											}}
										>
											{s.hasTile ? (
												<img
													loading="lazy"
													alt={s.name}
													src={`/tile/${s.id}`}
													className="h-full w-full object-cover"
												/>
											) : (
												<span className="flex h-full items-center justify-center text-[0.45rem] text-muted-foreground">
													{s.shortName || s.id}
												</span>
											)}
										</button>
									</HoverCardTrigger>
									{s.hasTile && (
										<HoverCardContent
											side="right"
											sideOffset={12}
											className="w-64 p-1.5"
										>
											<img
												src={`/tile/${s.id}`}
												alt={s.name}
												className="w-full rounded-sm"
											/>
											<p className="mt-1.5 text-center text-xs font-medium">
												{s.name}
											</p>
											<p className="text-center text-[0.6rem] text-muted-foreground">
												{s.category}
											</p>
										</HoverCardContent>
									)}
								</HoverCard>
							))}
						</div>
					</ScrollArea>
				</PopoverContent>
			</Popover>
		</div>
	)
}

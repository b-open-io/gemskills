"use client"

import type { DeckState, DeckAction } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

interface SlideNavProps {
	state: DeckState
	dispatch: React.Dispatch<DeckAction>
	overlay?: boolean
}

function dotColor(status: string, isActive: boolean) {
	switch (status) {
		case "error":
			return "bg-destructive hover:bg-destructive/80"
		case "generating":
			return "bg-primary animate-pulse"
		case "done":
			return isActive
				? "bg-primary"
				: "bg-primary/50 hover:bg-primary/80"
		default:
			return "bg-muted-foreground/20 hover:bg-muted-foreground/40"
	}
}

export function SlideNav({ state, dispatch, overlay = false }: SlideNavProps) {
	const hasPrev = state.currentSlide > 0
	const hasNext = state.currentSlide < state.slides.length - 1

	return (
		<div
			className={cn(
				"flex w-full flex-col items-center justify-center gap-3 py-6",
				overlay &&
					"w-auto gap-2 rounded-xl border border-border/40 bg-background/60 px-3 py-2 backdrop-blur-sm supports-[backdrop-filter]:bg-background/45",
			)}
		>
			{/* Counter */}
			<div
				className={cn(
					"text-xs font-medium tracking-widest text-muted-foreground/80 tabular-nums",
					overlay && "text-[10px]",
				)}
			>
				{String(state.currentSlide + 1).padStart(2, "0")}{" "}
				<span className="text-muted-foreground/50">/</span>{" "}
				{String(state.slides.length).padStart(2, "0")}
			</div>

			{/* Arrows + Dots */}
			<div className={cn("flex items-center gap-5", overlay && "gap-3")}>
				<Button
					variant="ghost"
					size="icon"
					disabled={!hasPrev}
					onClick={() => {
						if (hasPrev) dispatch({ type: "SET_CURRENT_SLIDE", index: state.currentSlide - 1 })
					}}
					className={cn(
						"group size-8 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30",
						overlay && "size-7",
					)}
					aria-label="Previous slide"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} className="size-4 transition-transform group-hover:-translate-x-0.5" />
				</Button>

				<div className={cn("flex h-4 items-center gap-2", overlay && "gap-1.5")}>
					{state.slides.map((slide, index) => {
						const isActive = index === state.currentSlide
						return (
							<Button
								key={slide.index}
								variant="ghost"
								size="icon"
								onClick={() => dispatch({ type: "SET_CURRENT_SLIDE", index })}
								className={cn(
									"h-2 min-w-0 rounded-full p-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]",
									overlay && "h-1.5",
									isActive ? "w-8" : "w-2",
									dotColor(slide.status, isActive),
									"hover:bg-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
								)}
								aria-label={`Go to slide ${index + 1}`}
								title={`Slide ${index + 1}: ${slide.status}`}
							/>
						)
					})}
				</div>

				<Button
					variant="ghost"
					size="icon"
					disabled={!hasNext}
					onClick={() => {
						if (hasNext) dispatch({ type: "SET_CURRENT_SLIDE", index: state.currentSlide + 1 })
					}}
					className={cn(
						"group size-8 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30",
						overlay && "size-7",
					)}
					aria-label="Next slide"
				>
					<HugeiconsIcon icon={ArrowRight01Icon} className="size-4 transition-transform group-hover:translate-x-0.5" />
				</Button>
			</div>
		</div>
	)
}

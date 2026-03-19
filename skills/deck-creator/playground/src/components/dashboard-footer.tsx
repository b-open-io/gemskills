"use client";

import {
	ArrowDown01Icon,
	SlidersHorizontalIcon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { DeckState } from "@/lib/types";

const MODEL_LABELS: Record<string, string> = {
	"gemini-3.1-pro-preview": "Gemini 3.1 Pro",
	"gemini-3-pro-preview": "Gemini 3 Pro",
	"gemini-3-flash-preview": "Gemini 3 Flash",
	"gemini-3.1-flash-preview": "Gemini 3.1 Flash",
	"gemini-3.1-flash-image-preview": "Nano Banana 2",
	"gemini-3-pro-image-preview": "Nano Banana Pro",
	"veo-3.1-generate-preview": "Veo 3.1",
};

function modelLabel(id: string): string {
	return MODEL_LABELS[id] ?? id.replace(/-preview$/, "").replace(/^gemini-/, "Gemini ");
}

interface DashboardFooterProps {
	state: DeckState;
	onEditSlide: () => void;
	onGenerate: () => void;
	onGenerateAll: () => void;
}

export function DashboardFooter({
	state,
	onEditSlide,
	onGenerate,
	onGenerateAll,
}: DashboardFooterProps) {
	const busy = state.generating;
	const { models } = state;

	return (
		<footer className="flex h-10 shrink-0 items-center border-t px-3 select-none">
			{/* Left: status or model pills */}
			{busy && state.statusText && state.statusText !== "Ready" ? (
				<span className="text-[10px] text-muted-foreground animate-pulse truncate max-w-64">
					{state.statusText}
				</span>
			) : models ? (
				<div className="flex items-center gap-2.5 text-[10px] text-muted-foreground/60 font-mono">
					<span title={models.text}>T · {modelLabel(models.text)}</span>
					<span className="text-muted-foreground/30">·</span>
					<span title={models.image}>I · {modelLabel(models.image)}</span>
					<span className="text-muted-foreground/30">·</span>
					<span title={models.video}>V · {modelLabel(models.video)}</span>
				</div>
			) : null}

			{/* RIGHT: Edit + Generate */}
			<div className="ml-auto flex items-center gap-2">
				{/* Edit Slide */}
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2.5 text-xs text-muted-foreground"
					onClick={onEditSlide}
				>
					<HugeiconsIcon
						icon={SlidersHorizontalIcon}
						className="size-3.5 mr-1.5"
					/>
					Edit
				</Button>

				{/* Split Generate button */}
				<div className="flex items-center">
					<Button
						size="sm"
						className="h-7 rounded-r-none px-3 text-xs font-medium"
						disabled={busy}
						onClick={onGenerate}
					>
						{state.generating ? (
							<Spinner className="size-3 mr-1.5" />
						) : (
							<HugeiconsIcon icon={SparklesIcon} className="size-3 mr-1.5" />
						)}
						Generate
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								size="sm"
								className="h-7 w-6 rounded-l-none px-0 border-l border-primary-foreground/20"
								disabled={busy}
							>
								<HugeiconsIcon icon={ArrowDown01Icon} className="size-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem onClick={onGenerate} disabled={busy}>
								<HugeiconsIcon icon={SparklesIcon} className="size-3.5 mr-2" />
								Generate This Slide
							</DropdownMenuItem>
							<DropdownMenuItem onClick={onGenerateAll} disabled={busy}>
								<HugeiconsIcon icon={SparklesIcon} className="size-3.5 mr-2" />
								{state.slides.length > 0 && state.slides.every((s) => s.status === "done" || (s.variants && s.variants.length > 0))
									? "Regenerate All"
									: "Generate All"}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</footer>
	);
}

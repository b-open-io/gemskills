"use client"

import type { DeckState, DeckAction } from "@/lib/types"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarGroupContent,
} from "@/components/ui/sidebar"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { StyleGrid } from "./style-grid"
import { StyleRecipePicker } from "./style-recipe-picker"
import { VideoBackground } from "./video-background"

interface ArtStyleProps {
	state: DeckState
	dispatch: React.Dispatch<DeckAction>
}

export function ArtStyle({ state, dispatch }: ArtStyleProps) {
	return (
		<Collapsible defaultOpen className="group/collapsible">
			<SidebarGroup>
				<CollapsibleTrigger asChild>
					<SidebarGroupLabel className="cursor-pointer">
						Art Style
						<HugeiconsIcon
							icon={ArrowDown01Icon}
							className="ml-auto size-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90"
						/>
					</SidebarGroupLabel>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarGroupContent className="space-y-3 px-2">
						<StyleGrid state={state} dispatch={dispatch} />
						<StyleRecipePicker state={state} dispatch={dispatch} />
						<VideoBackground state={state} dispatch={dispatch} />
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	)
}

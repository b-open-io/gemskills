"use client"

import * as React from "react"
import type { DeckState, DeckAction } from "@/lib/types"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"
import { DeckConfig } from "./deck-config"
import { LookAndFeel } from "./look-and-feel"
import { ArtStyle } from "./art-style"
import { HugeiconsIcon } from "@hugeicons/react"
import { PresentationBarChart01Icon } from "@hugeicons/core-free-icons"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	state: DeckState
	dispatch: React.Dispatch<DeckAction>
}

export function AppSidebar({ state, dispatch, ...props }: AppSidebarProps) {
	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							className="data-[slot=sidebar-menu-button]:p-1.5!"
						>
							<a href="#">
								<HugeiconsIcon icon={PresentationBarChart01Icon} strokeWidth={2} className="size-5!" />
								<span
									className="text-[0.9rem] font-semibold tracking-wide"
									style={{ fontFamily: "var(--font-geist-pixel), monospace" }}
								>
									GemSkills: Deck
								</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<DeckConfig state={state} dispatch={dispatch} />
				<ArtStyle state={state} dispatch={dispatch} />
				<LookAndFeel state={state} dispatch={dispatch} />
			</SidebarContent>
			<SidebarFooter>
				<p className="px-2 text-[0.6rem] text-muted-foreground truncate">
					{[state.audience, state.purpose].filter(Boolean).join(" \u00b7 ") || "Configure your deck above"}
				</p>
			</SidebarFooter>
		</Sidebar>
	)
}

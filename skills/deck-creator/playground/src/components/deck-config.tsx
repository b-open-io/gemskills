"use client"

import type { DeckState, DeckAction } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
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
import {
	NoteIcon,
	ArrowDown01Icon,
} from "@hugeicons/core-free-icons"

interface DeckConfigProps {
	state: DeckState
	dispatch: React.Dispatch<DeckAction>
}

export function DeckConfig({ state, dispatch }: DeckConfigProps) {
	return (
		<Collapsible defaultOpen className="group/collapsible">
			<SidebarGroup>
				<CollapsibleTrigger asChild>
					<SidebarGroupLabel className="cursor-pointer">
						Deck Config
						<HugeiconsIcon
							icon={ArrowDown01Icon}
							className="ml-auto size-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90"
						/>
					</SidebarGroupLabel>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<SidebarGroupContent className="space-y-3 px-2">
						{/* Title */}
						<div className="space-y-1">
							<Label htmlFor="title" className="text-[0.65rem]">Title</Label>
							<Input
								id="title"
								value={state.title}
								placeholder="My Presentation"
								className="h-7 text-xs"
								onChange={(e) =>
									dispatch({
										type: "SET_FIELD",
										field: "title",
										value: e.target.value,
									})
								}
							/>
						</div>

						{/* Audience */}
						<div className="space-y-1">
							<Label htmlFor="audience" className="text-[0.65rem]">Audience</Label>
							<Input
								id="audience"
								value={state.audience}
								placeholder="Investors, enterprise clients..."
								className="h-7 text-xs"
								onChange={(e) =>
									dispatch({
										type: "SET_FIELD",
										field: "audience",
										value: e.target.value,
									})
								}
							/>
						</div>

						{/* Purpose + Context */}
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1">
								<Label className="text-[0.65rem]">Purpose</Label>
								<Select
									value={state.purpose || undefined}
									onValueChange={(v) =>
										dispatch({
											type: "SET_FIELD",
											field: "purpose",
											value: v,
										})
									}
								>
									<SelectTrigger className="h-7 text-xs">
										<SelectValue placeholder="Select..." />
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
							<div className="space-y-1">
								<Label className="text-[0.65rem]">Context</Label>
								<Select
									value={state.context || undefined}
									onValueChange={(v) =>
										dispatch({
											type: "SET_FIELD",
											field: "context",
											value: v,
										})
									}
								>
									<SelectTrigger className="h-7 text-xs">
										<SelectValue placeholder="Select..." />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="Boardroom">Boardroom</SelectItem>
										<SelectItem value="Conference">Conference</SelectItem>
										<SelectItem value="Email Attachment">Email</SelectItem>
										<SelectItem value="Webinar">Webinar</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* Key Message */}
						<div className="space-y-1">
							<Label htmlFor="keyMessage" className="text-[0.65rem]">Key Message</Label>
							<Input
								id="keyMessage"
								value={state.keyMessage}
								placeholder="One sentence takeaway..."
								className="h-7 text-xs"
								onChange={(e) =>
									dispatch({
										type: "SET_FIELD",
										field: "keyMessage",
										value: e.target.value,
									})
								}
							/>
						</div>

						{/* Tone + Slides */}
						<div className="grid grid-cols-[1fr_4rem] gap-2">
							<div className="space-y-1">
								<Label htmlFor="tone" className="text-[0.65rem]">Tone</Label>
								<Input
									id="tone"
									value={state.tone}
									placeholder="Confident, technical..."
									className="h-7 text-xs"
									onChange={(e) =>
										dispatch({
											type: "SET_FIELD",
											field: "tone",
											value: e.target.value,
										})
									}
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="slideCount" className="text-[0.65rem]">Slides</Label>
								<Input
									id="slideCount"
									type="number"
									value={state.slideCount}
									min={1}
									max={30}
									className="h-7 text-xs"
									onChange={(e) =>
										dispatch({
											type: "SET_SLIDE_COUNT",
											count: Number.parseInt(e.target.value) || 10,
										})
									}
								/>
							</div>
						</div>

						{/* Brand Notes */}
						<Collapsible>
							<CollapsibleTrigger className="flex items-center gap-1 text-[0.65rem] text-muted-foreground hover:text-foreground">
								<HugeiconsIcon icon={NoteIcon} className="h-3 w-3" />
								Brand Notes
							</CollapsibleTrigger>
							<CollapsibleContent className="mt-1">
								<Textarea
									value={state.brandNotes}
									placeholder="Brand guidelines, voice notes..."
									className="min-h-10 text-xs"
									onChange={(e) =>
										dispatch({
											type: "SET_FIELD",
											field: "brandNotes",
											value: e.target.value,
										})
									}
								/>
							</CollapsibleContent>
						</Collapsible>
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	)
}

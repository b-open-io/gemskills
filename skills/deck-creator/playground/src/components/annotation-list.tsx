"use client"

import { annotationKey } from "@/lib/types"
import type { DeckState, DeckAction, SlideAnnotation } from "@/lib/types"
import { saveAnnotations, applyAnnotationEdit, applyHtmlAnnotationEdit } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

interface AnnotationListProps {
	state: DeckState
	dispatch: React.Dispatch<DeckAction>
	onRegenerate: () => void
}

export function AnnotationList({
	state,
	dispatch,
	onRegenerate,
}: AnnotationListProps) {
	const slide = state.slides[state.currentSlide]
	if (!slide) return null

	const variantId = slide.variants?.[slide.activeVariant]?.id
	const key = annotationKey(slide, variantId)
	const anns = (state.annotationsFile.annotations[key] ||
		[]) as SlideAnnotation[]

	function updateAnnotation(
		annId: string,
		updates: Partial<SlideAnnotation>,
	) {
		const updatedAnns = anns.map((a) =>
			a.id === annId ? { ...a, ...updates } : a,
		)
		const updatedFile = {
			...state.annotationsFile,
			annotations: {
				...state.annotationsFile.annotations,
				[key]: updatedAnns,
			},
		}
		dispatch({ type: "SET_ANNOTATIONS_FILE", file: updatedFile })
		saveAnnotations(updatedFile).catch((error: unknown) => {
			const msg = error instanceof Error ? error.message : String(error)
			console.error(`Failed to save annotation update: ${msg}`)
			toast.error(`Failed to save annotation update: ${msg}`)
		})
	}

	function deleteAnnotation(annId: string) {
		const updatedAnns = anns.filter((a) => a.id !== annId)
		const updatedFile = {
			...state.annotationsFile,
			annotations: {
				...state.annotationsFile.annotations,
				[key]: updatedAnns,
			},
		}
		dispatch({ type: "SET_ANNOTATIONS_FILE", file: updatedFile })
		saveAnnotations(updatedFile).catch((error: unknown) => {
			const msg = error instanceof Error ? error.message : String(error)
			console.error(`Failed to save annotation delete: ${msg}`)
			toast.error(`Failed to save annotation delete: ${msg}`)
		})
		toast.info("Annotation deleted")
	}

	async function handleApply(ann: SlideAnnotation) {
		if (slide.renderMode === "html") {
			const currentHtml = slide.variants?.[slide.activeVariant]?.htmlContent || slide.htmlContent
			if (!currentHtml?.trim()) {
				// No HTML to edit — fall back to full regen
				updateAnnotation(ann.id, { status: "applied" })
				onRegenerate()
				return
			}

			dispatch({ type: "SET_GENERATING", generating: true })
			dispatch({ type: "SET_STATUS", text: "Applying annotation edit..." })

			try {
				const data = await applyHtmlAnnotationEdit({
					html: currentHtml,
					annotations: [{
						note: ann.note,
						x: ann.x,
						y: ann.y,
						element: ann.element,
						intent: ann.intent,
						severity: ann.severity,
					}],
					themeConfig: state.themeConfig,
					slideIndex: slide.index,
				})

				if (data.ok && data.html) {
					dispatch({
						type: "SET_ACTIVE_VARIANT_HTML",
						slideIndex: state.currentSlide,
						html: data.html,
					})
					updateAnnotation(ann.id, { status: "applied" })
					toast.success(`Edit applied to slide ${slide.index}`)
				} else {
					toast.error(`Edit failed: ${data.error || "Unknown error"}`)
				}
			} catch (error: unknown) {
				const msg = error instanceof Error ? error.message : String(error)
				toast.error(`Apply failed: ${msg}`)
			}

			dispatch({ type: "SET_GENERATING", generating: false })
			dispatch({ type: "SET_STATUS", text: "Ready" })
			return
		}

		if (slide.status !== "done") {
			toast.error("Generate the slide image first")
			return
		}

		dispatch({ type: "SET_GENERATING", generating: true })
		dispatch({
			type: "SET_STATUS",
			text: "Applying annotation edit...",
		})

		try {
			const maskBase64 = generateMask(ann.x, ann.y)
			const data = await applyAnnotationEdit({
				slideIndex: slide.index,
				annotationId: ann.id,
				maskBase64,
				prompt: ann.note,
				renderMode: slide.renderMode,
			})

			if (data.ok) {
				updateAnnotation(ann.id, { status: "applied" })
				toast.success(
					`Edit applied to slide ${slide.index}`,
				)
				dispatch({
					type: "SET_SLIDE_STATUS",
					index: state.currentSlide,
					status: "done",
				})
			} else {
				toast.error(
					`Edit failed: ${data.error || "Unknown error"}`,
				)
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error)
			console.error(`Annotation apply failed: ${msg}`)
			toast.error(`Apply failed: ${msg}`)
		}

		dispatch({ type: "SET_GENERATING", generating: false })
		dispatch({ type: "SET_STATUS", text: "Ready" })
	}

	return (
		<Collapsible defaultOpen>
			<CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
				<HugeiconsIcon icon={ArrowDown01Icon} className="h-3 w-3" />
				Annotations
				{anns.length > 0 && (
					<Badge variant="secondary" className="ml-1 h-4 text-[0.6rem]">
						{anns.length}
					</Badge>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-2 space-y-1">
				{anns.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No annotations. Toggle Annotate and click the
						slide preview.
					</p>
				) : (
					anns.map((ann) => (
						<div
							key={ann.id}
							className="flex items-start gap-2 rounded-sm bg-muted/50 p-2"
						>
							<div
								className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
									ann.status === "applied"
										? "bg-green-500"
										: ann.status === "dismissed"
											? "bg-muted-foreground"
											: "bg-primary"
								}`}
							/>
							<div className="min-w-0 flex-1">
								<div className="text-[0.6rem] text-muted-foreground">
									{ann.element &&
									ann.element.type !== "background"
										? `${ann.element.type === "content-point" ? `Bullet ${(ann.element.pointIndex || 0) + 1}` : ann.element.type.charAt(0).toUpperCase() + ann.element.type.slice(1)} @ ${Math.round(ann.x)},${Math.round(ann.y)}%`
										: `${Math.round(ann.x)}%, ${Math.round(ann.y)}%`}
								</div>
								<div className="text-xs">
									{ann.note}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								{ann.status === "open" && (
									<>
										<Button
											size="sm"
											className="h-5 px-2 text-[0.6rem]"
											onClick={(e) => {
												e.stopPropagation()
												handleApply(ann)
											}}
										>
											Apply
										</Button>
										<Button
											variant="outline"
											size="sm"
											className="h-5 px-2 text-[0.6rem]"
											onClick={(e) => {
												e.stopPropagation()
												updateAnnotation(
													ann.id,
													{
														status: "dismissed",
													},
												)
											}}
										>
											Dismiss
										</Button>
									</>
								)}
								<Button
									variant="outline"
									size="sm"
									className="h-5 px-2 text-[0.6rem] text-destructive"
									onClick={(e) => {
										e.stopPropagation()
										deleteAnnotation(ann.id)
									}}
								>
									Del
								</Button>
								<Badge
									variant={
										ann.status === "open"
											? "default"
											: "secondary"
									}
									className="text-[0.5rem]"
								>
									{ann.status}
								</Badge>
							</div>
						</div>
					))
				)}
			</CollapsibleContent>
		</Collapsible>
	)
}

function generateMask(x: number, y: number): string {
	const canvas = document.createElement("canvas")
	canvas.width = 1376
	canvas.height = 768
	const ctx = canvas.getContext("2d")!
	ctx.fillStyle = "#000"
	ctx.fillRect(0, 0, 1376, 768)
	ctx.fillStyle = "#fff"
	ctx.beginPath()
	ctx.arc((x / 100) * 1376, (y / 100) * 768, 115, 0, Math.PI * 2)
	ctx.fill()
	return canvas.toDataURL("image/png").split(",")[1]
}

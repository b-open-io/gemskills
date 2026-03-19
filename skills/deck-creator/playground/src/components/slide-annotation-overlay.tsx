"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { SlideAnnotation } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface SlideAnnotationOverlayProps {
	annotations: SlideAnnotation[]
	onAdd: (annotation: Omit<SlideAnnotation, "id" | "created">) => void
	onDelete: (id: string) => void
	iframeRef: React.RefObject<HTMLIFrameElement | null>
	active: boolean
}

interface PendingClick {
	x: number
	y: number
	px: number
	py: number
	elementInfo?: {
		tagName: string
		textContent: string
		className: string
	}
}

export function SlideAnnotationOverlay({
	annotations,
	onAdd,
	onDelete,
	iframeRef,
	active,
}: SlideAnnotationOverlayProps) {
	const overlayRef = useRef<HTMLDivElement>(null)
	const [pendingClick, setPendingClick] = useState<PendingClick | null>(null)
	const [noteText, setNoteText] = useState("")
	const [selectedAnn, setSelectedAnn] = useState<string | null>(null)

	// Listen for postMessage responses from the iframe
	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			if (event.data?.type === "elementInfo" && pendingClick) {
				setPendingClick((prev) =>
					prev ? { ...prev, elementInfo: event.data } : null,
				)
			}
		}
		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [pendingClick])

	const handleOverlayClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!active || !overlayRef.current) return

			const rect = overlayRef.current.getBoundingClientRect()
			const x = ((e.clientX - rect.left) / rect.width) * 100
			const y = ((e.clientY - rect.top) / rect.height) * 100

			// Ask iframe for element info at this point
			if (iframeRef.current?.contentWindow) {
				const iframeX = (x / 100) * 1920
				const iframeY = (y / 100) * 1080
				iframeRef.current.contentWindow.postMessage(
					{ type: "getElementAt", x: iframeX, y: iframeY },
					"*",
				)
			}

			setPendingClick({
				x,
				y,
				px: e.clientX - rect.left,
				py: e.clientY - rect.top,
			})
			setNoteText("")
			setSelectedAnn(null)
		},
		[active, iframeRef],
	)

	function handleSubmit() {
		if (!pendingClick || !noteText.trim()) return

		const elementType =
			pendingClick.elementInfo?.tagName?.toLowerCase() || "unknown"
		const textSnippet =
			pendingClick.elementInfo?.textContent?.slice(0, 50) || ""

		onAdd({
			x: pendingClick.x,
			y: pendingClick.y,
			note: noteText.trim(),
			status: "open",
			element: {
				type: elementType,
				currentText: textSnippet,
			},
		})
		setPendingClick(null)
		setNoteText("")
	}

	if (!active && annotations.length === 0) return null

	return (
		<div
			ref={overlayRef}
			className={cn(
				"absolute inset-0 z-10",
				active ? "cursor-crosshair" : "pointer-events-none",
			)}
			onClick={handleOverlayClick}
		>
			{/* Existing annotation pins */}
			{annotations.map((ann) => (
				<div
					key={ann.id}
					className="pointer-events-auto absolute"
					style={{
						left: `${ann.x}%`,
						top: `${ann.y}%`,
						transform: "translate(-50%, -50%)",
					}}
				>
					<button
						type="button"
						className={cn(
							"h-4 w-4 rounded-full border-2 border-white shadow-md transition-transform hover:scale-125",
							ann.status === "open"
								? "bg-primary"
								: ann.status === "applied"
									? "bg-green-500"
									: "bg-muted-foreground",
						)}
						onClick={(e) => {
							e.stopPropagation()
							setSelectedAnn(
								selectedAnn === ann.id ? null : ann.id,
							)
						}}
						title={ann.note}
					/>
					{/* Annotation detail popover */}
					{selectedAnn === ann.id && (
						<div
							className="pointer-events-auto absolute left-full top-0 z-20 ml-2 w-48 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
							onClick={(e) => e.stopPropagation()}
						>
							<p className="text-xs">{ann.note}</p>
							{ann.element?.currentText && (
								<p className="mt-1 truncate text-[0.6rem] text-muted-foreground">
									{ann.element.type}:{" "}
									{ann.element.currentText}
								</p>
							)}
							<div className="mt-1.5 flex gap-1">
								<span
									className={cn(
										"text-[0.55rem] font-medium uppercase",
										ann.status === "open"
											? "text-primary"
											: ann.status === "applied"
												? "text-green-500"
												: "text-muted-foreground",
									)}
								>
									{ann.status}
								</span>
								<button
									type="button"
									className="ml-auto text-[0.55rem] text-destructive hover:underline"
									onClick={(e) => {
										e.stopPropagation()
										onDelete(ann.id)
										setSelectedAnn(null)
									}}
								>
									Delete
								</button>
							</div>
						</div>
					)}
				</div>
			))}

			{/* New annotation input popover */}
			{pendingClick && active && (
				<div
					className="pointer-events-auto absolute z-20 w-56"
					style={{
						left: `${pendingClick.x}%`,
						top: `${pendingClick.y}%`,
						transform: "translate(-50%, 8px)",
					}}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="rounded-md border bg-popover p-2 shadow-lg">
						{pendingClick.elementInfo && (
							<p className="mb-1 text-[0.6rem] text-muted-foreground">
								{pendingClick.elementInfo.tagName?.toLowerCase()}
								{pendingClick.elementInfo.textContent
									? `: "${pendingClick.elementInfo.textContent.slice(0, 30)}"`
									: ""}
							</p>
						)}
						<Textarea
							value={noteText}
							onChange={(e) => setNoteText(e.target.value)}
							placeholder="What should change here?"
							className="min-h-14 text-xs"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault()
									handleSubmit()
								}
								if (e.key === "Escape") setPendingClick(null)
							}}
						/>
						<div className="mt-1.5 flex justify-end gap-1">
							<Button
								variant="ghost"
								size="sm"
								className="h-6 text-[0.65rem]"
								onClick={() => setPendingClick(null)}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								className="h-6 text-[0.65rem]"
								onClick={handleSubmit}
								disabled={!noteText.trim()}
							>
								Add
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

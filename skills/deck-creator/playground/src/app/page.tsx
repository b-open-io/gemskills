"use client"

import * as React from "react"
import { useReducer, useState, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import { initialState, deckReducer } from "@/lib/state"
import { useInitialize, useKeyboard, useAutoSave } from "@/lib/hooks"
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SlidePreview } from "@/components/slide-preview"
import { DashboardFooter } from "@/components/dashboard-footer"
import { SlideNav } from "@/components/slide-nav"
import { SlideEditor } from "@/components/slide-editor"
import { VariantStrip } from "@/components/variant-strip"
import { GenerateDialog } from "@/components/generate-dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
	Drawer,
	DrawerClose,
	DrawerHeader,
	DrawerOverlay,
	DrawerPortal,
	DrawerTitle,
} from "@/components/ui/drawer"
import { Drawer as VaulDrawer } from "vaul"
import { OnboardingDialog } from "@/components/onboarding-dialog"
import { Agentation, loadAnnotations as loadLocalAnnotations, saveAnnotations as saveLocalAnnotations } from "agentation"
import type { Annotation } from "agentation"
import {
	saveAnnotations,
	fetchAnnotationSessions,
	saveAnnotationSessions,
	applyHtmlAnnotationEdit,
} from "@/lib/api"
import {
	getBackgroundMediaKind,
	resolveBackgroundMediaSrc,
} from "@/lib/background-media"
import { annotationKey } from "@/lib/types"
import type { SlideAnnotation } from "@/lib/types"

function mapAgentationStatus(
	status: string | undefined,
): SlideAnnotation["status"] | undefined {
	switch ((status || "").toLowerCase()) {
		case "resolved":
			return "applied"
		case "dismissed":
			return "dismissed"
		case "pending":
		case "acknowledged":
			return "open"
		default:
			return undefined
	}
}

function toSlideAnnotation(
	annotation: Annotation,
	existing?: SlideAnnotation,
): SlideAnnotation {
	const annStatus = mapAgentationStatus(
		(annotation as unknown as { status?: string }).status,
	)
	return {
		id: annotation.id,
		x: annotation.x,
		y: annotation.y,
		note: annotation.comment,
		status: annStatus || existing?.status || "open",
		intent: annotation.intent || existing?.intent,
		severity: annotation.severity || existing?.severity,
		created: existing?.created ?? annotation.timestamp,
		element: annotation.element
			? {
					type: annotation.element,
					currentText: annotation.elementPath,
				}
			: existing?.element,
	}
}

export default function DeckPlayground() {
	const [state, dispatch] = useReducer(deckReducer, initialState)
	const [editorOpen, setEditorOpen] = useState(false)
	const [generateMode, setGenerateMode] = useState<"single" | "all" | null>(null)
	const [onboardingDismissed, setOnboardingDismissed] = useState(false)
	const [annotationSessions, setAnnotationSessions] = useState<
		Record<string, string>
	>({})
	const showOnboarding =
		state.initialized &&
		(!state.deckSelected || !state.title) &&
		!onboardingDismissed

	useInitialize(dispatch, state)
	useKeyboard(dispatch, state)
	useAutoSave(state, dispatch)

	// Heartbeat — lets the parent process know the tab is still open
	useEffect(() => {
		const ping = () => fetch("/api/heartbeat", { method: "POST" }).catch(() => {})
		ping()
		const id = setInterval(ping, 10_000)
		return () => clearInterval(id)
	}, [])

	const slide = state.slides[state.currentSlide]
	// Always use the current global slideThemeMode for the stage background
	// so toggling light/dark mode applies immediately.
	const stageThemeConfig =
		state.themeModes[state.slideThemeMode]
	const slideMediaUrl = slide?.backgroundMediaUrl || state.videoUrl;
	const stageMediaKind = getBackgroundMediaKind(slideMediaUrl || undefined)
	const stageMediaSrc = resolveBackgroundMediaSrc(slideMediaUrl || undefined)
	const stageHasVideo = stageMediaKind === "video" && !!stageMediaSrc
	const stageHasImage = stageMediaKind === "image" && !!stageMediaSrc
	const stageBackgroundColor =
		stageThemeConfig.background || "var(--background)"
	const sessionsHashRef = useRef("")
	const drawerContainerRef = useRef<HTMLDivElement>(null)
	const activeVariantId = slide?.variants?.[slide.activeVariant]?.id
	const sessionScopeKey = slide
		? annotationKey(slide, activeVariantId)
		: null
	const agentationEndpoint =
		process.env.NEXT_PUBLIC_AGENTATION_ENDPOINT?.trim() ||
		undefined
	const sessionId =
		agentationEndpoint && sessionScopeKey
			? annotationSessions[sessionScopeKey]
		: undefined

	// Swap Agentation localStorage annotations per slide/variant scope.
	// Agentation stores annotations keyed by window.location.pathname ("/"),
	// so all slides share the same bucket. We virtualize this by saving the
	// outgoing scope's annotations under a scoped key and loading the incoming
	// scope's annotations into the real "/" key before remount.
	const prevScopeRef = useRef<string | null>(null)
	useEffect(() => {
		const pathname = "/"
		if (prevScopeRef.current && prevScopeRef.current !== sessionScopeKey) {
			// Save outgoing scope's annotations
			const outgoing = loadLocalAnnotations(pathname)
			if (outgoing.length > 0) {
				saveLocalAnnotations(`/__scope__/${prevScopeRef.current}`, outgoing)
			}
		}
		if (sessionScopeKey) {
			// Load incoming scope's annotations (or empty)
			const incoming = loadLocalAnnotations(`/__scope__/${sessionScopeKey}`)
			saveLocalAnnotations(pathname, incoming)
		}
		prevScopeRef.current = sessionScopeKey
	}, [sessionScopeKey])

	useEffect(() => {
		if (!agentationEndpoint) return
		if (!state.initialized || !state.deckDir) return
		let cancelled = false
		fetchAnnotationSessions()
			.then((sessions) => {
				if (!cancelled) {
					setAnnotationSessions(sessions)
					sessionsHashRef.current = JSON.stringify(sessions)
				}
			})
			.catch((error: unknown) => {
				const msg =
					error instanceof Error ? error.message : String(error)
				console.error(
					`Failed to load annotation sessions: ${msg}`,
				)
				if (!cancelled) {
					dispatch({
						type: "SET_STATUS",
						text: `Annotation sessions failed: ${msg}`,
					})
				}
			})
		return () => {
			cancelled = true
		}
	}, [agentationEndpoint, state.initialized, state.deckDir, dispatch])

	useEffect(() => {
		if (!agentationEndpoint) return
		if (!state.initialized || !state.deckDir) return
		const hash = JSON.stringify(annotationSessions)
		if (hash === sessionsHashRef.current) return
		sessionsHashRef.current = hash
		const timer = setTimeout(() => {
			saveAnnotationSessions({ sessions: annotationSessions }).catch(
				(error: unknown) => {
					const msg =
						error instanceof Error ? error.message : String(error)
					console.error(
						`Failed to save annotation sessions: ${msg}`,
					)
				},
			)
		}, 400)
		return () => clearTimeout(timer)
	}, [
		agentationEndpoint,
		annotationSessions,
		state.initialized,
		state.deckDir,
	])

	const handleSessionCreated = useCallback(
		(newSessionId: string) => {
			if (!sessionScopeKey) return
			setAnnotationSessions((prev) => {
				if (prev[sessionScopeKey] === newSessionId) return prev
				return { ...prev, [sessionScopeKey]: newSessionId }
			})
		},
		[sessionScopeKey],
	)

	const handleAnnotationAdd = useCallback(
		(annotation: Annotation) => {
			if (!slide) return
			const variantId = slide.variants?.[slide.activeVariant]?.id
			const key = annotationKey(slide, variantId)
			const existing =
				state.annotationsFile.annotations[key] || []
			const existingIdx = existing.findIndex(
				(a) => a.id === annotation.id,
			)
			const newAnn = toSlideAnnotation(
				annotation,
				existingIdx >= 0 ? existing[existingIdx] : undefined,
			)
			const nextAnns =
				existingIdx >= 0
					? existing.map((a, idx) =>
							idx === existingIdx ? { ...a, ...newAnn } : a,
						)
					: [...existing, newAnn]
			const updatedFile = {
				...state.annotationsFile,
				annotations: {
					...state.annotationsFile.annotations,
					[key]: nextAnns,
				},
			}
			dispatch({ type: "SET_ANNOTATIONS_FILE", file: updatedFile })
			saveAnnotations(updatedFile).catch((error: unknown) => {
				const msg =
					error instanceof Error ? error.message : String(error)
				console.error(`Failed to save annotation add: ${msg}`)
			})
		},
		[slide, state.annotationsFile, dispatch],
	)

	const handleAnnotationUpdate = useCallback(
		(annotation: Annotation) => {
			if (!slide) return
			const variantId = slide.variants?.[slide.activeVariant]?.id
			const key = annotationKey(slide, variantId)
			const existing =
				state.annotationsFile.annotations[key] || []
			const idx = existing.findIndex((a) => a.id === annotation.id)
			const updated = toSlideAnnotation(
				annotation,
				idx >= 0 ? existing[idx] : undefined,
			)
			const nextAnns =
				idx >= 0
					? existing.map((a, i) => (i === idx ? updated : a))
					: [...existing, updated]
			const updatedFile = {
				...state.annotationsFile,
				annotations: {
					...state.annotationsFile.annotations,
					[key]: nextAnns,
				},
			}
			dispatch({ type: "SET_ANNOTATIONS_FILE", file: updatedFile })
			saveAnnotations(updatedFile).catch((error: unknown) => {
				const msg =
					error instanceof Error ? error.message : String(error)
				console.error(`Failed to save annotation update: ${msg}`)
			})
		},
		[slide, state.annotationsFile, dispatch],
	)

	const handleAnnotationDelete = useCallback(
		(annotation: Annotation) => {
			if (!slide) return
			const variantId = slide.variants?.[slide.activeVariant]?.id
			const key = annotationKey(slide, variantId)
			const existing =
				state.annotationsFile.annotations[key] || []
			const updatedFile = {
				...state.annotationsFile,
				annotations: {
					...state.annotationsFile.annotations,
					[key]: existing.filter(
						(a) => a.id !== annotation.id,
					),
				},
			}
			dispatch({ type: "SET_ANNOTATIONS_FILE", file: updatedFile })
			saveAnnotations(updatedFile).catch((error: unknown) => {
				const msg =
					error instanceof Error ? error.message : String(error)
				console.error(`Failed to save annotation delete: ${msg}`)
			})
		},
		[slide, state.annotationsFile, dispatch],
	)

	const handleAnnotationsClear = useCallback(() => {
		if (!slide) return
		const variantId = slide.variants?.[slide.activeVariant]?.id
		const key = annotationKey(slide, variantId)
		if (!state.annotationsFile.annotations[key]) return
		const nextAnnotations = {
			...state.annotationsFile.annotations,
		}
		delete nextAnnotations[key]
		const updatedFile = {
			...state.annotationsFile,
			annotations: nextAnnotations,
		}
		dispatch({ type: "SET_ANNOTATIONS_FILE", file: updatedFile })
		saveAnnotations(updatedFile).catch((error: unknown) => {
			const msg = error instanceof Error ? error.message : String(error)
			console.error(`Failed to save annotation clear: ${msg}`)
		})
	}, [slide, state.annotationsFile, dispatch])

	const handleAnnotationSubmit = useCallback(
		async (_output: string, annotations: Annotation[]) => {
			if (!slide) return
			const variantId = slide.variants?.[slide.activeVariant]?.id
			const key = annotationKey(slide, variantId)
			const existing = state.annotationsFile.annotations[key] || []
			const existingById = new Map(existing.map((a) => [a.id, a]))
			const merged = annotations
				.map((ann) => toSlideAnnotation(ann, existingById.get(ann.id)))
				.filter((ann) => ann.status === "open")
			const updatedFile = {
				...state.annotationsFile,
				annotations: {
					...state.annotationsFile.annotations,
					[key]: merged,
				},
			}
			dispatch({ type: "SET_ANNOTATIONS_FILE", file: updatedFile })
			saveAnnotations(updatedFile).catch((error: unknown) => {
				const msg =
					error instanceof Error ? error.message : String(error)
				console.error(`Failed to save annotation submit: ${msg}`)
			})

			// Auto-apply open annotations via targeted HTML edit
			const currentHtml = slide.variants?.[slide.activeVariant]?.htmlContent || slide.htmlContent
			const openAnns = merged.filter(
				(a) => a.status === "open" && a.note?.trim() && a.intent !== "approve",
			)
			if (openAnns.length > 0 && currentHtml?.trim()) {
				dispatch({ type: "SET_GENERATING", generating: true })
				dispatch({ type: "SET_STATUS", text: `Applying ${openAnns.length} edit(s)...` })
				try {
					const data = await applyHtmlAnnotationEdit({
						html: currentHtml,
						annotations: openAnns.map((a) => ({
							note: a.note,
							x: a.x,
							y: a.y,
							element: a.element,
							intent: a.intent,
							severity: a.severity,
						})),
						themeConfig: state.themeConfig,
						slideIndex: slide.index,
					})
					if (data.ok && data.html) {
						dispatch({
							type: "SET_ACTIVE_VARIANT_HTML",
							slideIndex: state.currentSlide,
							html: data.html,
						})
						// Mark all as applied
						const appliedAnns = merged.map((a) =>
							openAnns.some((o) => o.id === a.id)
								? { ...a, status: "applied" as const }
								: a,
						)
						const appliedFile = {
							...state.annotationsFile,
							annotations: {
								...state.annotationsFile.annotations,
								[key]: appliedAnns,
							},
						}
						dispatch({ type: "SET_ANNOTATIONS_FILE", file: appliedFile })
						saveAnnotations(appliedFile).catch((error: unknown) => {
							const msg = error instanceof Error ? error.message : String(error)
							console.error(`Failed to save applied annotations: ${msg}`)
						})
					}
				} catch (error: unknown) {
					const msg = error instanceof Error ? error.message : String(error)
					console.error(`Auto-apply failed: ${msg}`)
				}
				dispatch({ type: "SET_GENERATING", generating: false })
				dispatch({ type: "SET_STATUS", text: "Ready" })
			}
		},
		[slide, state.annotationsFile, state.themeConfig, state.currentSlide, dispatch],
	)

	const handleEditSlide = useCallback(() => setEditorOpen(true), [])
	const handleGenerateSingle = useCallback(() => setGenerateMode("single"), [])
	const handleGenerateAll = useCallback(() => setGenerateMode("all"), [])
	const handleCloseGenerate = useCallback(() => setGenerateMode(null), [])
	const handleOnboardingComplete = useCallback(() => setOnboardingDismissed(true), [])

	return (
		<>
			<SidebarProvider
				className="h-svh overflow-hidden"
				style={
					{
						"--sidebar-width": "calc(var(--spacing) * 72)",
						"--header-height": "calc(var(--spacing) * 12)",
					} as React.CSSProperties
				}
			>
				<AppSidebar variant="inset" state={state} dispatch={dispatch} />
				<SidebarInset className="min-h-0 overflow-hidden">
					<SiteHeader state={state} dispatch={dispatch} />
					<div ref={drawerContainerRef} className="relative flex flex-1 min-h-0 min-w-0 flex-col [transform:translate3d(0,0,0)]">
						<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
							{/* Slide preview + nav */}
							<div className="relative flex min-h-0 min-w-0 flex-1 flex-col p-3">
								<div className="relative flex flex-1 min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg border bg-black">
									<div
										className="absolute inset-0"
										style={{ background: stageBackgroundColor }}
									/>
									{stageHasImage && (
										<Image
											src={stageMediaSrc}
											alt=""
											fill
											aria-hidden
											className="absolute inset-0 object-cover"
											sizes="(max-width: 1024px) 100vw, 70vw"
											unoptimized
										/>
									)}
									{stageHasVideo && (
										<>
											<video
												src={stageMediaSrc}
												autoPlay
												loop={state.videoLoop}
												muted
												playsInline
												className="absolute inset-0 h-full w-full object-cover"
											/>
											<div className="absolute inset-0 bg-black/35" />
										</>
									)}
									<div className="relative z-10 flex h-full w-full min-h-0 min-w-0 items-center justify-center p-2 sm:p-3">
										<SlidePreview
											state={state}
											dispatch={dispatch}
											className="h-full w-auto max-h-full max-w-full border-0 bg-transparent shadow-none"
										/>
									</div>
									<div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
										<div className="pointer-events-auto">
											<SlideNav state={state} dispatch={dispatch} overlay />
										</div>
									</div>
								</div>
							</div>
							{/* Variant strip */}
							<VariantStrip state={state} dispatch={dispatch} />
						</div>
						<DashboardFooter
							state={state}
							onEditSlide={handleEditSlide}
							onGenerate={handleGenerateSingle}
							onGenerateAll={handleGenerateAll}
						/>
						<Drawer open={editorOpen} onOpenChange={setEditorOpen} direction="bottom">
							<DrawerPortal container={drawerContainerRef.current ?? undefined}>
								<DrawerOverlay />
								<VaulDrawer.Content
									data-slot="drawer-content"
									className="before:bg-background before:border-border flex h-auto flex-col bg-transparent p-2 before:absolute before:inset-2 before:-z-10 before:rounded-xl before:border data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] group/drawer-content fixed z-50"
								>
									<div className="bg-muted mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
									<DrawerHeader className="flex items-center justify-between py-2">
										<DrawerTitle>
											Slide {slide ? state.currentSlide + 1 : "—"} of {state.slides.length}
										</DrawerTitle>
										<DrawerClose asChild>
											<Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Close</Button>
										</DrawerClose>
									</DrawerHeader>
									<ScrollArea className="px-4 pb-4">
										<SlideEditor
											state={state}
											dispatch={dispatch}
											onGenerate={handleGenerateSingle}
										/>
									</ScrollArea>
								</VaulDrawer.Content>
							</DrawerPortal>
						</Drawer>
					</div>
				</SidebarInset>
			</SidebarProvider>
			<GenerateDialog
				mode={generateMode}
				state={state}
				dispatch={dispatch}
				onClose={handleCloseGenerate}
			/>
			<OnboardingDialog
				open={showOnboarding}
				state={state}
				dispatch={dispatch}
				onComplete={handleOnboardingComplete}
			/>
			<Agentation
				key={sessionScopeKey || "agentation-no-slide"}
				endpoint={agentationEndpoint}
				sessionId={sessionId}
				onSessionCreated={
					agentationEndpoint
						? handleSessionCreated
						: undefined
				}
				onAnnotationAdd={handleAnnotationAdd}
				onAnnotationUpdate={handleAnnotationUpdate}
					onAnnotationDelete={handleAnnotationDelete}
					onAnnotationsClear={handleAnnotationsClear}
					onSubmit={handleAnnotationSubmit}
				/>
		</>
	)
}

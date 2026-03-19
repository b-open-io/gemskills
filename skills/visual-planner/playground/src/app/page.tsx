"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Editor, TLEditorSnapshot } from "tldraw"
import { Tldraw } from "tldraw"
import "tldraw/tldraw.css"
import { PlanningOverlay } from "@/components/PlanningOverlay"

// The .tldr file format: { store: { ... } } — this is TLStoreSnapshot
// editor.getSnapshot() returns TLEditorSnapshot: { document: TLStoreSnapshot, session: ... }
// We use TLEditorSnapshot as our live state type for the overlay
type LiveSnapshot = TLEditorSnapshot

export default function VisualPlannerPage() {
	// The initial snapshot loaded from the .tldr file — shape: { store: {...} }
	// We cast to unknown then to any to sidestep strict discrimination; tldraw accepts both formats
	const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [loaded, setLoaded] = useState(false)

	// Live snapshot updated on every store change — used for overlay stats and send-to-agent
	const [liveSnapshot, setLiveSnapshot] = useState<LiveSnapshot | null>(null)
	const editorRef = useRef<Editor | null>(null)

	// Heartbeat — lets the parent process know the tab is still open
	useEffect(() => {
		const ping = () => fetch("/api/heartbeat", { method: "POST" }).catch(() => {})
		ping()
		const id = setInterval(ping, 10_000)
		return () => clearInterval(id)
	}, [])

	useEffect(() => {
		fetch("/api/workflow")
			.then((res) => {
				if (!res.ok) {
					return res.json().then((body: { error?: string }) => {
						throw new Error(body.error ?? `HTTP ${res.status}`)
					})
				}
				return res.json() as Promise<Record<string, unknown>>
			})
			.then((data) => {
				setInitialData(data)
				setLoaded(true)
			})
			.catch((err: unknown) => {
				setLoadError(err instanceof Error ? err.message : String(err))
			})
	}, [])

	const handleMount = useCallback((editor: Editor) => {
		editorRef.current = editor

		// Snapshot the initial state for the overlay
		setLiveSnapshot(editor.getSnapshot())

		// Listen for document changes to keep overlay stats fresh
		const unsub = editor.store.listen(
			() => {
				setLiveSnapshot(editor.getSnapshot())
			},
			{ scope: "document" },
		)

		return unsub
	}, [])

	// true when the server was launched with --wait-signal (agent awaiting callback)
	// Check at runtime via API to avoid stale Turbopack cache issues with NEXT_PUBLIC_* vars
	const [isAsync, setIsAsync] = useState(false)
	useEffect(() => {
		fetch("/api/config")
			.then((r) => r.json() as Promise<{ waitSignal: boolean }>)
			.then((c) => setIsAsync(c.waitSignal))
			.catch(() => setIsAsync(false))
	}, [])

	const handleSendToAgent = useCallback(async () => {
		const editor = editorRef.current
		if (!editor) throw new Error("Editor not mounted")

		const snap = editor.getSnapshot()

		const res = await fetch("/api/signal", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(snap.document),
		})

		if (!res.ok) {
			const body = (await res.json()) as { error?: string }
			throw new Error(body.error ?? `Signal failed: HTTP ${res.status}`)
		}
	}, [])

	const handleSave = useCallback(async () => {
		const editor = editorRef.current
		if (!editor) throw new Error("Editor not mounted")

		const snap = editor.getSnapshot()

		const res = await fetch("/api/workflow", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(snap.document),
		})

		if (!res.ok) {
			const body = (await res.json()) as { error?: string }
			throw new Error(body.error ?? `Save failed: HTTP ${res.status}`)
		}
	}, [])

	if (loadError) {
		return (
			<div
				style={{
					height: "100dvh",
					width: "100dvw",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "var(--bg)",
					flexDirection: "column",
					gap: 12,
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-display)",
						fontSize: 18,
						fontWeight: 700,
						color: "var(--danger)",
					}}
				>
					Failed to load diagram
				</span>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: 12,
						color: "var(--fg-muted)",
						maxWidth: 500,
						textAlign: "center",
					}}
				>
					{loadError}
				</span>
			</div>
		)
	}

	if (!loaded) {
		return (
			<div
				style={{
					height: "100dvh",
					width: "100dvw",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "var(--bg)",
					flexDirection: "column",
					gap: 12,
				}}
			>
				<div
					style={{
						width: 32,
						height: 32,
						border: "2px solid var(--border)",
						borderTopColor: "var(--accent)",
						borderRadius: "50%",
						animation: "spin 0.8s linear infinite",
					}}
				/>
				<style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: 12,
						color: "var(--fg-muted)",
					}}
				>
					Loading diagram...
				</span>
			</div>
		)
	}

	return (
		<div style={{ position: "fixed", inset: 0 }}>
			<Tldraw
				// Cast: tldraw accepts TLStoreSnapshot ({ store: {...} }) or TLEditorSnapshot.
				// Our .tldr files are TLStoreSnapshot format. The type union in tldraw allows this.
				// biome-ignore lint/suspicious/noExplicitAny: tldraw snapshot union type requires casting
				snapshot={initialData as any}
				onMount={handleMount}
				persistenceKey={undefined}
			/>
			<PlanningOverlay
				snapshot={liveSnapshot}
				isAsync={isAsync}
				onSendToAgent={handleSendToAgent}
				onSave={handleSave}
			/>
		</div>
	)
}

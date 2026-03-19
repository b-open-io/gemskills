"use client"

import { useState } from "react"
import type { TLEditorSnapshot } from "tldraw"

interface PlanningOverlayProps {
	snapshot: TLEditorSnapshot | null
	/** True when the playground was launched with --wait-signal (agent awaiting callback) */
	isAsync: boolean
	onSendToAgent: () => Promise<void>
	onSave: () => Promise<void>
}

interface ShapeMeta {
	nodeType?: string
	phase?: string
}

function computeStats(snapshot: TLEditorSnapshot | null): {
	name: string
	planned: number
	inProgress: number
	implemented: number
	needsRevision: number
	total: number
} {
	const empty = {
		name: "Untitled",
		planned: 0,
		inProgress: 0,
		implemented: 0,
		needsRevision: 0,
		total: 0,
	}

	if (!snapshot?.document?.store) return empty

	const store = snapshot.document.store as Record<
		string,
		{ typeName: string; type?: string; meta?: ShapeMeta } & { name?: string }
	>
	const doc = store["document:document"]
	const docName = doc?.name ?? "Untitled"

	let planned = 0
	let inProgress = 0
	let implemented = 0
	let needsRevision = 0

	for (const [key, value] of Object.entries(store)) {
		if (!key.startsWith("shape:")) continue
		if (value.typeName !== "shape") continue
		if (value.type === "arrow") continue

		const meta = value.meta
		if (!meta?.nodeType) continue

		const phase = meta.phase
		if (phase === "planned") planned++
		else if (phase === "in_progress") inProgress++
		else if (phase === "implemented") implemented++
		else if (phase === "needs_revision") needsRevision++
	}

	const total = planned + inProgress + implemented + needsRevision

	return { name: docName, planned, inProgress, implemented, needsRevision, total }
}

export function PlanningOverlay({ snapshot, isAsync, onSendToAgent, onSave }: PlanningOverlayProps) {
	const [busy, setBusy] = useState(false)
	const [feedback, setFeedback] = useState<"sent" | "saved" | null>(null)

	const stats = computeStats(snapshot)
	const completePct = stats.total > 0 ? Math.round((stats.implemented / stats.total) * 100) : 0

	async function handleSendToAgent() {
		setBusy(true)
		try {
			await onSendToAgent()
			setFeedback("sent")
			setTimeout(() => setFeedback(null), 3000)
		} finally {
			setBusy(false)
		}
	}

	async function handleSave() {
		setBusy(true)
		try {
			await onSave()
			setFeedback("saved")
			setTimeout(() => setFeedback(null), 3000)
		} finally {
			setBusy(false)
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				pointerEvents: "none",
				zIndex: 300,
			}}
		>
			{/* Top-left: Diagram name */}
			<div
				style={{
					position: "absolute",
					top: 12,
					left: 12,
					pointerEvents: "auto",
					background: "var(--glass-bg)",
					border: "1px solid var(--glass-border)",
					backdropFilter: "blur(var(--glass-blur))",
					borderRadius: "var(--radius-lg)",
					padding: "6px 12px",
					display: "flex",
					alignItems: "center",
					gap: 8,
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-display)",
						fontSize: 13,
						fontWeight: 600,
						color: "var(--fg)",
						letterSpacing: "-0.01em",
					}}
				>
					{stats.name}
				</span>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: 11,
						color: "var(--fg-subtle)",
					}}
				>
					.tldr
				</span>
			</div>

			{/* Top-right: KPI chips */}
			<div
				style={{
					position: "absolute",
					top: 12,
					right: 12,
					pointerEvents: "auto",
					display: "flex",
					alignItems: "center",
					gap: 6,
					background: "var(--glass-bg)",
					border: "1px solid var(--glass-border)",
					backdropFilter: "blur(var(--glass-blur))",
					borderRadius: "var(--radius-lg)",
					padding: "6px 12px",
				}}
			>
				{stats.total === 0 ? (
					<span
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: 11,
							color: "var(--fg-subtle)",
						}}
					>
						No nodes
					</span>
				) : (
					<>
						{stats.planned > 0 && (
							<KpiChip label="Planned" count={stats.planned} color="var(--phase-planned)" />
						)}
						{stats.inProgress > 0 && (
							<KpiChip
								label="In Progress"
								count={stats.inProgress}
								color="var(--phase-in-progress)"
							/>
						)}
						{stats.implemented > 0 && (
							<KpiChip label="Done" count={stats.implemented} color="var(--phase-implemented)" />
						)}
						{stats.needsRevision > 0 && (
							<KpiChip label="Revision" count={stats.needsRevision} color="var(--warn)" />
						)}
						<div
							style={{
								width: 1,
								height: 16,
								background: "var(--border)",
								margin: "0 4px",
							}}
						/>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: 12,
								fontWeight: 600,
								color: completePct === 100 ? "var(--phase-implemented)" : "var(--accent)",
							}}
						>
							{completePct}% complete
						</span>
					</>
				)}
			</div>

			{/* Bottom-right: contextual action button */}
			<div
				style={{
					position: "absolute",
					bottom: 12,
					right: 12,
					pointerEvents: "auto",
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					gap: 6,
				}}
			>
				{/* Save confirmation toast — shown briefly after save in non-async mode */}
				{feedback === "saved" && (
					<div
						style={{
							background: "var(--phase-implemented)",
							color: "var(--fg-inverse)",
							borderRadius: "var(--radius-lg)",
							padding: "5px 12px",
							fontFamily: "var(--font-mono)",
							fontSize: 11,
							fontWeight: 600,
							boxShadow: "var(--shadow-md)",
							animation: "fadeIn 0.15s ease",
						}}
					>
						Saved to file
					</div>
				)}
				<style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

				{isAsync ? (
					// Async mode: agent is waiting for the signal
					<button
						type="button"
						onClick={handleSendToAgent}
						disabled={busy}
						style={{
							background: feedback === "sent" ? "var(--phase-implemented)" : "var(--accent)",
							color: "var(--fg-inverse)",
							border: "none",
							borderRadius: "var(--radius-lg)",
							padding: "8px 16px",
							fontFamily: "var(--font-display)",
							fontSize: 13,
							fontWeight: 600,
							cursor: busy ? "wait" : "pointer",
							opacity: busy ? 0.7 : 1,
							transition: "opacity 0.15s, background 0.2s",
							boxShadow: "var(--shadow-md)",
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						{feedback === "sent" ? "Sent to Agent" : busy ? "Sending..." : "Send to Agent"}
					</button>
				) : (
					// Normal mode: save changes back to the .tldr file
					<button
						type="button"
						onClick={handleSave}
						disabled={busy}
						style={{
							background: "var(--accent)",
							color: "var(--fg-inverse)",
							border: "none",
							borderRadius: "var(--radius-lg)",
							padding: "8px 16px",
							fontFamily: "var(--font-display)",
							fontSize: 13,
							fontWeight: 600,
							cursor: busy ? "wait" : "pointer",
							opacity: busy ? 0.7 : 1,
							transition: "opacity 0.15s",
							boxShadow: "var(--shadow-md)",
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						{busy ? "Saving..." : "Save"}
					</button>
				)}
			</div>
		</div>
	)
}

function KpiChip({ label, count, color }: { label: string; count: number; color: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
			<span
				style={{
					width: 7,
					height: 7,
					borderRadius: "50%",
					background: color,
					flexShrink: 0,
				}}
			/>
			<span
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: 11,
					color: "var(--fg-muted)",
				}}
			>
				{label}:
			</span>
			<span
				style={{
					fontFamily: "var(--font-mono)",
					fontSize: 11,
					fontWeight: 600,
					color: "var(--fg)",
				}}
			>
				{count}
			</span>
		</div>
	)
}

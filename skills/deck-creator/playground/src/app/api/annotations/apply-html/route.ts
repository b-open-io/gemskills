import { NextResponse } from "next/server"
import { callGemini, getApiKey } from "@/lib/server/gemini"

export async function POST(req: Request) {
	try {
		const body = (await req.json()) as {
			html: string
			annotations: Array<{
				note: string
				x: number
				y: number
				element?: { type: string; currentText?: string }
				intent?: "fix" | "change" | "question" | "approve"
				severity?: "blocking" | "important" | "suggestion"
			}>
			themeConfig?: Record<string, string>
			slideIndex: number
		}

		if (!body.html?.trim()) {
			return NextResponse.json(
				{ ok: false, error: "No HTML content provided" },
				{ status: 400 },
			)
		}

		if (!body.annotations?.length) {
			return NextResponse.json(
				{ ok: false, error: "No annotations provided" },
				{ status: 400 },
			)
		}

		const apiKey = getApiKey()
		const tc = body.themeConfig || {}

		// Build annotation directives
		const directives = body.annotations
			.filter((a) => a.intent !== "approve")
			.map((a) => {
				const xZone = a.x < 33 ? "left" : a.x > 66 ? "right" : "center"
				const yZone = a.y < 33 ? "top" : a.y > 66 ? "bottom" : "middle"
				const region =
					yZone === "middle" && xZone === "center"
						? "center of the slide"
						: `${yZone}-${xZone} area`
				const elementCtx =
					a.element?.type && a.element.type !== "background"
						? ` (targeting: ${a.element.type}${a.element.currentText ? ` "${a.element.currentText}"` : ""})`
						: ""
				const priority =
					a.severity === "blocking"
						? "[BLOCKING] "
						: a.severity === "important"
							? "[IMPORTANT] "
							: ""
				return `- ${priority}${region}${elementCtx}: ${a.note}`
			})

		if (directives.length === 0) {
			return NextResponse.json({ ok: true, html: body.html })
		}

		const systemPrompt = `You are a precise HTML slide editor. You receive the complete HTML of a presentation slide and a list of edit directives. Apply ONLY the requested changes — do not alter anything else.

RULES:
- Output ONLY the modified HTML. No markdown fences, no explanation, no preamble.
- Preserve the exact structure, class names, and layout of the original HTML.
- For color/background changes: ALWAYS use CSS custom properties (var(--background), var(--card), var(--foreground), var(--primary), var(--muted), var(--border), etc.). NEVER hardcode hex/rgb/hsl colors.
- Available theme variables: --background: ${tc.background || "#0a0e1a"}, --foreground: ${tc.foreground || "#e2e8f0"}, --primary: ${tc.primary || "#00d4aa"}, --card: ${tc.card || "#1a1f2e"}, --muted: ${tc.muted || "#1e293b"}, --muted-foreground: ${tc["muted-foreground"] || "#94a3b8"}, --border: ${tc.border || "#1e293b"}, --radius: ${tc.radius || "0.625rem"}.
- If a directive is unclear or conflicts, use your best judgment while preserving the overall design intent.
- Keep all existing @import statements, fonts, and animations intact.
- The output must be valid HTML that can be injected into a slide container.`

		const userPrompt = `Here is the current slide HTML:

${body.html}

Apply these edits:
${directives.join("\n")}`

		console.error(
			`Applying ${directives.length} HTML annotation edit(s) to slide ${body.slideIndex}`,
		)

		const result = await callGemini(apiKey, userPrompt, {
			instructions: systemPrompt,
			temperature: 0.2,
		})

		if (!result.content?.trim()) {
			return NextResponse.json(
				{ ok: false, error: "Gemini returned empty content" },
				{ status: 502 },
			)
		}

		// Strip markdown code fences if the model wraps the output
		let html = result.content.trim()
		if (html.startsWith("```html")) {
			html = html.slice(7)
		} else if (html.startsWith("```")) {
			html = html.slice(3)
		}
		if (html.endsWith("```")) {
			html = html.slice(0, -3)
		}
		html = html.trim()

		console.error(`  HTML edit applied (${html.length} chars)`)
		return NextResponse.json({ ok: true, html })
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error)
		console.error(`  HTML annotation edit failed: ${msg}`)
		return NextResponse.json({ ok: false, error: msg }, { status: 500 })
	}
}

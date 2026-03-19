import { NextResponse } from "next/server"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { getDeckDir } from "@/lib/server/deck"

function summarizeVariantCounts(
	variants: Record<string, unknown>,
): Record<string, number> {
	const out: Record<string, number> = {}
	for (const [slideId, entry] of Object.entries(variants)) {
		const bucket =
			entry && typeof entry === "object" && !Array.isArray(entry)
				? (entry as { variants?: unknown }).variants
				: undefined
		const list = Array.isArray(bucket) ? bucket : []
		out[slideId] = list.length
	}
	return out
}

export async function GET() {
	try {
		const variantsPath = join(getDeckDir(), "VARIANTS.json")
		if (!existsSync(variantsPath)) {
			return NextResponse.json({ variants: {} })
		}
		const content = readFileSync(variantsPath, "utf-8")
		const parsed = JSON.parse(content) as {
			variants?: Record<string, unknown>
		}
		if (
			!parsed ||
			typeof parsed !== "object" ||
			!parsed.variants ||
			typeof parsed.variants !== "object" ||
			Array.isArray(parsed.variants)
		) {
			throw new Error("VARIANTS.json has invalid structure")
		}
		return NextResponse.json(parsed)
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error)
		console.error(`Failed to read VARIANTS.json: ${msg}`)
		return NextResponse.json(
			{ ok: false, error: msg, variants: {} },
			{ status: 500 },
		)
	}
}

export async function PUT(req: Request) {
	try {
		const body = (await req.json()) as {
			deckDir?: string
			variants?: Record<string, unknown>
		}
		if (
			!body ||
			typeof body !== "object" ||
			typeof body.deckDir !== "string" ||
			!body.deckDir.trim() ||
			!body.variants ||
			typeof body.variants !== "object" ||
			Array.isArray(body.variants)
		) {
			return NextResponse.json(
				{ ok: false, error: "deckDir and variants object map are required" },
				{ status: 400 },
			)
		}
		const deckDir = getDeckDir()
		if (body.deckDir !== deckDir) {
			console.error(
				`[variants/save] rejected stale client: payload deckDir=${body.deckDir} server deckDir=${deckDir}`,
			)
			return NextResponse.json(
				{
					ok: false,
					error: "Deck directory mismatch — variants save rejected (stale client)",
				},
				{ status: 409 },
			)
		}
		const variantsPath = join(deckDir, "VARIANTS.json")
		writeFileSync(
			variantsPath,
			JSON.stringify({ variants: body.variants }, null, 2),
		)
		console.error(
			`[variants/save] wrote ${variantsPath} counts=${JSON.stringify(
				summarizeVariantCounts(body.variants),
			)}`,
		)
		return NextResponse.json({ ok: true })
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error)
		return NextResponse.json({ ok: false, error: msg }, { status: 500 })
	}
}

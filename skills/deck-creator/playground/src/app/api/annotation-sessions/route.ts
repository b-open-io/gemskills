import { NextResponse } from "next/server"
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { getDeckDir } from "@/lib/server/deck"

interface AnnotationSessionsFile {
	sessions: Record<string, string>
}

function sessionsFilePath(): string {
	return join(getDeckDir(), "ANNOTATION-SESSIONS.json")
}

export async function GET() {
	try {
		const path = sessionsFilePath()
		if (!existsSync(path)) {
			return NextResponse.json({ sessions: {} })
		}
		const content = readFileSync(path, "utf-8")
		const parsed = JSON.parse(content) as Partial<AnnotationSessionsFile>
		if (
			!parsed ||
			typeof parsed !== "object" ||
			!parsed.sessions ||
			typeof parsed.sessions !== "object" ||
			Array.isArray(parsed.sessions)
		) {
			throw new Error("ANNOTATION-SESSIONS.json has invalid structure")
		}
		return NextResponse.json({ sessions: parsed.sessions })
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error)
		console.error(`Failed to read annotation sessions: ${msg}`)
		return NextResponse.json(
			{ ok: false, error: msg, sessions: {} },
			{ status: 500 },
		)
	}
}

export async function PUT(req: Request) {
	try {
		const body = (await req.json()) as AnnotationSessionsFile
		if (
			!body ||
			typeof body !== "object" ||
			!body.sessions ||
			typeof body.sessions !== "object" ||
			Array.isArray(body.sessions)
		) {
			return NextResponse.json(
				{ ok: false, error: "sessions must be an object map" },
				{ status: 400 },
			)
		}
		const sessions = body.sessions
		const hasAny = Object.keys(sessions).length > 0
		const path = sessionsFilePath()

		if (!hasAny) {
			if (existsSync(path)) unlinkSync(path)
			return NextResponse.json({ ok: true })
		}

		writeFileSync(path, JSON.stringify({ sessions }, null, 2), "utf-8")
		return NextResponse.json({ ok: true })
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error)
		return NextResponse.json({ ok: false, error: msg }, { status: 500 })
	}
}

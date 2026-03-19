import { writeFile } from "node:fs/promises"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
	const file = process.env.TLDR_FILE
	if (!file) {
		return NextResponse.json(
			{ error: "TLDR_FILE environment variable is not set" },
			{ status: 500 },
		)
	}

	const body = await request.json()
	await writeFile(file, JSON.stringify(body, null, 2), "utf-8")

	// Touch signal marker so playground_server.ts knows the user sent
	const signalFile = `${file}.signal`
	await writeFile(signalFile, new Date().toISOString(), "utf-8")

	return NextResponse.json({ ok: true })
}

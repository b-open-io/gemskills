import { readFile, writeFile } from "node:fs/promises"
import { NextResponse } from "next/server"

function getTldrFilePath(): string {
	const file = process.env.TLDR_FILE
	if (!file) {
		throw new Error("TLDR_FILE environment variable is not set")
	}
	return file
}

export async function GET() {
	const path = getTldrFilePath()

	const raw = await readFile(path, "utf-8")
	const json = JSON.parse(raw)
	return NextResponse.json(json)
}

export async function POST(request: Request) {
	const path = getTldrFilePath()

	const body = await request.json()
	await writeFile(path, JSON.stringify(body, null, 2), "utf-8")
	return NextResponse.json({ ok: true })
}

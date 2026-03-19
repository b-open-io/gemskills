import { NextResponse } from "next/server"
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  getDeckDir,
  parseAnnotationsFile,
  serializeAnnotationsFile,
  migrateMarkdownAnnotations,
} from "@/lib/server/deck"
import type { AnnotationsFile } from "@/lib/server/deck"

export async function GET() {
  try {
    const deckDir = getDeckDir()
    const annotationsJsonPath = join(deckDir, "ANNOTATIONS.json")
    const annotationsMdPath = join(deckDir, "ANNOTATIONS.md")

    if (existsSync(annotationsJsonPath)) {
      const content = readFileSync(annotationsJsonPath, "utf-8")
      const parsed = parseAnnotationsFile(content)
      return NextResponse.json(parsed)
    }
    if (existsSync(annotationsMdPath)) {
      const content = readFileSync(annotationsMdPath, "utf-8")
      const af = migrateMarkdownAnnotations(content)
      return NextResponse.json(af)
    }
    return NextResponse.json({ notes: {}, annotations: {} })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`Failed to read annotations: ${msg}`)
    return NextResponse.json(
      { ok: false, error: msg, notes: {}, annotations: {} },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnnotationsFile
    if (
      !body ||
      typeof body !== "object" ||
      !body.notes ||
      typeof body.notes !== "object" ||
      Array.isArray(body.notes) ||
      !body.annotations ||
      typeof body.annotations !== "object" ||
      Array.isArray(body.annotations)
    ) {
      return NextResponse.json(
        { ok: false, error: "notes and annotations must both be object maps" },
        { status: 400 },
      )
    }
    const deckDir = getDeckDir()
    const annotationsJsonPath = join(deckDir, "ANNOTATIONS.json")

    const af: AnnotationsFile = {
      notes: body.notes,
      annotations: body.annotations,
    }

    const hasNotes = Object.keys(af.notes).length > 0
    const hasAnnotations = Object.values(af.annotations).some(
      (arr) => arr.length > 0,
    )

    if (!hasNotes && !hasAnnotations) {
      if (existsSync(annotationsJsonPath)) {
        unlinkSync(annotationsJsonPath)
      }
    } else {
      await writeFile(
        annotationsJsonPath,
        serializeAnnotationsFile(af),
        "utf-8",
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

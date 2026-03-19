import { NextResponse } from "next/server"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { loadDeckState, getSlidesDir } from "@/lib/server/deck"
import type { SlideData } from "@/lib/server/deck"
import { getApiKey, callGeminiEdit } from "@/lib/server/gemini"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      slideIndex: number
      annotationId: string
      maskBase64?: string
      prompt: string
      renderMode?: "image" | "html"
    }

    const deckState = loadDeckState()
    const slides = (deckState.slides || []) as SlideData[]
    const slide = slides.find((s) => s.index === body.slideIndex)
    if (!slide) {
      return NextResponse.json(
        { ok: false, error: "Slide not found" },
        { status: 404 },
      )
    }

    const imagePath = join(getSlidesDir(), slide.filename)
    if (!existsSync(imagePath)) {
      return NextResponse.json(
        { ok: false, error: "Slide image not found on disk" },
        { status: 404 },
      )
    }

    const imageBytes = readFileSync(imagePath).toString("base64")
    const apiKey = getApiKey()

    console.error(
      `Applying annotation edit to slide ${body.slideIndex}: ${body.prompt}`,
    )
    const result = await callGeminiEdit(
      apiKey,
      body.prompt,
      { imageBytes, mimeType: "image/png" },
      body.maskBase64
        ? { imageBytes: body.maskBase64, mimeType: "image/png" }
        : undefined,
    )

    if (result.images.length > 0) {
      const { writeFileSync } = await import("node:fs")
      writeFileSync(imagePath, Buffer.from(result.images[0].data, "base64"))
      console.error(`  Edit applied to: ${slide.filename}`)
      return NextResponse.json({ ok: true, mode: "image" })
    }
    return NextResponse.json(
      { ok: false, error: "No image returned from Gemini" },
      { status: 500 },
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`  Annotation edit failed: ${msg}`)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

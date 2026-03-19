import { NextResponse } from "next/server"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { getDeckDir, BUILD_PRESENTER } from "@/lib/server/deck"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { backgroundMedia?: string }
    const deckDir = getDeckDir()

    const presenterArgs = ["run", BUILD_PRESENTER, "--dir", deckDir]
    if (body.backgroundMedia) {
      presenterArgs.push("--background", body.backgroundMedia)
    }

    const result = spawnSync("bun", presenterArgs, { stdio: "pipe" })
    const stdout = result.stdout?.toString() || ""
    const stderr = result.stderr?.toString() || ""

    if (result.status === 0) {
      const outputPath = join(deckDir, "presenter.html")
      console.error(`Presenter built: ${outputPath}`)
      return NextResponse.json({
        ok: true,
        path: outputPath,
        output: stdout,
      })
    }

    return NextResponse.json(
      { ok: false, error: stderr || "Build failed" },
      { status: 500 },
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

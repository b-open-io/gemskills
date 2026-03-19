import { NextResponse } from "next/server"
import { spawnSync } from "node:child_process"
import { getDeckDir } from "@/lib/server/deck"

export async function GET() {
  try {
    const deckDir = getDeckDir()
    const toplevel = spawnSync(
      "git",
      ["-C", deckDir, "rev-parse", "--show-toplevel"],
      { stdio: "pipe" },
    )
    const repoDir =
      toplevel.status === 0 ? toplevel.stdout.toString().trim() : null
    if (repoDir) {
      const result = spawnSync(
        "git",
        ["-C", repoDir, "remote", "get-url", "origin"],
        { stdio: "pipe" },
      )
      if (result.status === 0) {
        let url = result.stdout.toString().trim()
        const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
        if (sshMatch) {
          url = `https://${sshMatch[1]}/${sshMatch[2]}`
        }
        url = url.replace(/\.git$/, "")
        return NextResponse.json({ url })
      }
    }
    return NextResponse.json({ url: null })
  } catch {
    return NextResponse.json({ url: null })
  }
}

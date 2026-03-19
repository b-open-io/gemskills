import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { TILES_DIR } from "@/lib/server/deck"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ styleId: string }> },
) {
  const { styleId } = await params
  const tilePath = join(TILES_DIR, `${styleId}.png`)

  if (!existsSync(tilePath)) {
    return new Response("Not found", { status: 404 })
  }

  return new Response(readFileSync(tilePath), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000",
    },
  })
}

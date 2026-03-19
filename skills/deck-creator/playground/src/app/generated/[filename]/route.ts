import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getGeneratedDir } from "@/lib/server/deck"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  if (filename.includes("..") || filename.includes("/")) {
    return new Response("Invalid filename", { status: 400 })
  }

  const filePath = join(getGeneratedDir(), filename)
  if (!existsSync(filePath)) {
    return new Response("Not found", { status: 404 })
  }

  const ext = filename.split(".").pop()?.toLowerCase()
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : "application/octet-stream"

  return new Response(readFileSync(filePath), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-cache",
    },
  })
}

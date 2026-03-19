#!/usr/bin/env bun
/**
 * Interactive style browser server
 *
 * Usage:
 *   bun run scripts/preview_server.ts              # Pick mode (default): returns selection JSON to stdout
 *   bun run scripts/preview_server.ts --browse      # Browse mode: long-running server, no selection
 *   bun run scripts/preview_server.ts --port=4200   # Custom port
 *   bun run scripts/preview_server.ts --no-open     # Don't auto-open browser
 */

import { readFileSync, existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
const { resolvePluginRoot } = await import(resolve(import.meta.dir, "../../../resolve-root.ts")).catch(async () => {
  // Fallback: find resolve-root.ts via env var or Claude Code plugin paths
  const _tryPaths = [process.env.GEMSKILLS_ROOT || ""]
  const home = process.env.HOME || process.env.USERPROFILE || ""
  try {
    const d = JSON.parse((await import("fs")).readFileSync(resolve(home, ".claude/plugins/installed_plugins.json"), "utf-8"))
    const ip = d.plugins?.["gemskills@b-open-io"]?.[0]?.installPath
    if (ip) _tryPaths.push(ip)
  } catch {}
  try {
    const cd = resolve(home, ".claude/plugins/cache/b-open-io/gemskills")
    const vs = (await import("fs")).readdirSync(cd).filter((v: string) => /^\d+\./.test(v)).sort()
    for (let i = vs.length - 1; i >= 0; i--) _tryPaths.push(resolve(cd, vs[i]))
  } catch {}
  for (const p of _tryPaths) {
    try { if (p) return await import(resolve(p, "resolve-root.ts")) } catch {}
  }
  throw new Error("Cannot find gemskills. Set GEMSKILLS_ROOT or: claude plugin install gemskills@b-open-io")
})
const PLUGIN_ROOT = resolvePluginRoot(import.meta.dir)
const { callGeminiImage } = await import(resolve(PLUGIN_ROOT, "utils.ts")) as typeof import("../../../utils")
const { getApiKey } = await import(resolve(PLUGIN_ROOT, "shared.ts")) as typeof import("../../../shared")

const __dirname = dirname(fileURLToPath(import.meta.url))
const STYLES_PATH = resolve(__dirname, "../assets/styles.json")
const TILES_DIR = resolve(__dirname, "../assets/tiles")
const HTML_PATH = resolve(__dirname, "../assets/browser.html")

const args = process.argv.slice(2)
const PICK_MODE = !args.includes("--browse")
const NO_OPEN = args.includes("--no-open")
const PORT = Number(args.find((a) => a.startsWith("--port="))?.split("=")[1] || "3456")

interface Style {
  id: string
  shortName: string
  name: string
  category: string
  promptHints: string
  tilePrompt: string
}

interface StylesRegistry {
  version: string
  categories: Record<string, string>
  styles: Style[]
}

const registry: StylesRegistry = JSON.parse(readFileSync(STYLES_PATH, "utf-8"))

// Pre-compute which styles have tiles (include tilePrompt for editing)
const stylesWithTiles = registry.styles.map((s) => ({
  id: s.id,
  shortName: s.shortName,
  name: s.name,
  category: s.category,
  promptHints: s.promptHints,
  tilePrompt: s.tilePrompt,
  hasTile: existsSync(join(TILES_DIR, `${s.id}.png`)),
}))

function getConfigJSON() {
  return JSON.stringify({
    pickMode: PICK_MODE,
    categories: registry.categories,
    styles: stylesWithTiles,
  })
}

let resolveSelection: ((value: unknown) => void) | null = null
const selectionPromise = PICK_MODE
  ? new Promise((resolve) => { resolveSelection = resolve })
  : null

const server = Bun.serve({
  port: PORT,
  idleTimeout: 120, // Gemini API calls can take 30s+
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // API: style config + data
    if (path === "/api/config") {
      return new Response(getConfigJSON(), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // API: receive selection in pick mode
    if (req.method === "POST" && path === "/select" && PICK_MODE) {
      const body = await req.json()
      if (resolveSelection) resolveSelection(body)
      return new Response("ok")
    }

    // API: generate a tile preview (returns base64, does NOT save to disk)
    if (req.method === "POST" && path.startsWith("/regenerate/")) {
      const styleId = path.slice(12)
      const style = registry.styles.find((s) => s.id === styleId)
      if (!style) {
        return new Response(JSON.stringify({ ok: false, error: "Style not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      try {
        const body = await req.json().catch(() => ({})) as { prompt?: string }
        const prompt = body.prompt || style.tilePrompt
        const apiKey = getApiKey()
        console.error(`Generating tile preview for: ${style.name}...`)
        const result = await callGeminiImage(apiKey, prompt, {
          aspectRatio: "1:1",
          imageSize: "512",
        })

        if (result.images.length > 0) {
          console.error(`  Preview ready for ${styleId}`)
          return new Response(JSON.stringify({
            ok: true,
            imageData: result.images[0].data,
            mimeType: result.images[0].mimeType,
          }), {
            headers: { "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ ok: false, error: "No image returned" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`  Failed to generate preview for ${styleId}: ${msg}`)
        return new Response(JSON.stringify({ ok: false, error: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
    }

    // API: save a confirmed tile to disk
    if (req.method === "POST" && path.startsWith("/save-tile/")) {
      const styleId = path.slice(11)
      const style = registry.styles.find((s) => s.id === styleId)
      if (!style) {
        return new Response(JSON.stringify({ ok: false, error: "Style not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      try {
        const body = await req.json() as { imageData: string }
        const imageData = Buffer.from(body.imageData, "base64")
        const outputPath = join(TILES_DIR, `${styleId}.png`)
        await writeFile(outputPath, imageData)

        // Update hasTile in pre-computed list
        const entry = stylesWithTiles.find((s) => s.id === styleId)
        if (entry) entry.hasTile = true

        // Optimize the tile
        const OPTIMIZE_SCRIPT = resolve(PLUGIN_ROOT, "skills/optimize-images/scripts/optimize-images.ts")
        spawnSync("bun", ["run", OPTIMIZE_SCRIPT, `--file=${outputPath}`], {
          stdio: "pipe",
          cwd: resolve(PLUGIN_ROOT, "skills/optimize-images"),
        })

        console.error(`  Saved tile: ${styleId}.png (${(imageData.length / 1024).toFixed(0)}KB)`)
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        })
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`  Failed to save tile ${styleId}: ${msg}`)
        return new Response(JSON.stringify({ ok: false, error: msg }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
    }

    // Serve tile images
    if (path.startsWith("/tile/")) {
      const styleId = path.slice(6)
      const tilePath = join(TILES_DIR, `${styleId}.png`)
      if (existsSync(tilePath)) {
        return new Response(Bun.file(tilePath), {
          headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000" },
        })
      }
      return new Response("Not found", { status: 404 })
    }

    // Serve HTML page
    return new Response(Bun.file(HTML_PATH), {
      headers: { "Content-Type": "text/html" },
    })
  },
})

const browserUrl = `http://localhost:${server.port}`
console.error(`Style Browser running at ${browserUrl}`)
if (PICK_MODE) {
  console.error("Pick mode: click a style to select and return to agent")
} else {
  console.error("Press Ctrl+C to stop")
}

if (!NO_OPEN) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  Bun.spawn([opener, browserUrl])
}

if (PICK_MODE && selectionPromise) {
  const selection = await selectionPromise
  console.log(JSON.stringify(selection, null, 2))
  await new Promise((r) => setTimeout(r, 300))
  server.stop()
  process.exit(0)
}

#!/usr/bin/env bun
/**
 * Deck playground launcher
 *
 * Sets DECK_DIR env var and starts the Next.js dev server.
 * Auto-installs dependencies if missing.
 *
 * Usage:
 *   bun run scripts/playground_server.ts --dir <deck-dir>
 *   bun run scripts/playground_server.ts --dir <deck-dir> --port=3457
 *   bun run scripts/playground_server.ts --dir <deck-dir> --no-open
 */

import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLAYGROUND_DIR = resolve(__dirname, "../playground")

// ── CLI args ────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const NO_OPEN = args.includes("--no-open")
const PORT = args.find((a) => a.startsWith("--port="))?.split("=")[1] || "3457"

let deckDir = ""
const dirIdx = args.indexOf("--dir")
if (dirIdx !== -1 && args[dirIdx + 1]) {
  deckDir = args[dirIdx + 1]
} else {
  const dirArg = args.find((a) => a.startsWith("--dir="))
  if (dirArg) deckDir = dirArg.split("=")[1]
}

if (!deckDir) {
  console.error("Error: --dir <deck-directory> is required")
  console.error(
    "\nUsage: bun run scripts/playground_server.ts --dir <path> [--port=3457] [--no-open]",
  )
  process.exit(1)
}

const resolvedDir = resolve(deckDir)
if (!existsSync(resolvedDir)) mkdirSync(resolvedDir, { recursive: true })

// ── Auto-install dependencies ────────────────────────────────────────

const nodeModulesDir = join(PLAYGROUND_DIR, "node_modules")
const nextBin = join(nodeModulesDir, ".bin", "next")

if (!existsSync(nextBin)) {
  console.error("Installing playground dependencies...")
  const install = spawnSync("bun", ["install"], {
    cwd: PLAYGROUND_DIR,
    stdio: "inherit",
  })
  if (install.status !== 0) {
    console.error("Failed to install dependencies. Run manually: cd " + PLAYGROUND_DIR + " && bun install")
    process.exit(1)
  }
  console.error("Dependencies installed.")
}

// ── Launch Next.js ──────────────────────────────────────────────────

const browserUrl = `http://localhost:${PORT}`
const HEARTBEAT_FILE = join(tmpdir(), `deck-playground-heartbeat-${PORT}.tmp`)
console.error(`Deck Playground starting at ${browserUrl}`)
console.error(`Deck directory: ${resolvedDir}`)

const proc = Bun.spawn(["bun", "run", "next", "dev", "--turbopack", "-p", PORT], {
  cwd: PLAYGROUND_DIR,
  env: {
    ...process.env,
    DECK_DIR: resolvedDir,
    HEARTBEAT_FILE,
  },
  stdio: ["inherit", "inherit", "inherit"],
})

// Wait a moment for the server to start, then open browser
if (!NO_OPEN) {
  setTimeout(() => {
    const opener =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open"
    Bun.spawn([opener, browserUrl])
  }, 3000)
}

// Forward signals to child
function cleanup() {
  proc.kill("SIGINT")
  try { unlinkSync(HEARTBEAT_FILE) } catch {}
  process.exit(0)
}

process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

// ── Idle shutdown (auto-kill when browser tab closes) ───────────────

const IDLE_TIMEOUT_MS = 120_000 // 2 minutes — generous for background tab throttling
const IDLE_CHECK_MS = 15_000

// Don't start checking until the browser has had time to load and send a first heartbeat
const idleWatcherDelay = setTimeout(() => {
  const idleChecker = setInterval(() => {
    try {
      const lastPing = parseInt(readFileSync(HEARTBEAT_FILE, "utf-8"), 10)
      if (Date.now() - lastPing > IDLE_TIMEOUT_MS) {
        console.error("No browser heartbeat for 2 minutes. Shutting down.")
        clearInterval(idleChecker)
        cleanup()
      }
    } catch {
      // Heartbeat file doesn't exist yet — browser hasn't loaded
    }
  }, IDLE_CHECK_MS)

  process.on("exit", () => clearInterval(idleChecker))
}, 30_000) // 30s grace period for initial page load

process.on("exit", () => clearTimeout(idleWatcherDelay))

await proc.exited

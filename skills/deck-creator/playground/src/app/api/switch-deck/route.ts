import { NextResponse } from "next/server"
import { dirname, resolve, basename, isAbsolute } from "node:path"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { switchDeckDir, getDeckDir } from "@/lib/server/deck"

interface DeckEntry {
  name: string
  path: string
  hasPlan: boolean
}

interface RecentDeckEntry {
  path: string
  openedAt: number
}

const MAX_RECENT_DECKS = 20

function getRecentStorePath() {
  const home = process.env.HOME || "/Users"
  return resolve(home, ".gemskills", "deck-creator-recent.json")
}

function isDeckDirectory(deckPath: string): boolean {
  const hasPlan = existsSync(resolve(deckPath, "DECK-PLAN.md"))
  const hasIndex = existsSync(resolve(deckPath, "DECK-INDEX.md"))
  const hasTheme = existsSync(resolve(deckPath, "THEME.md"))
  const hasSlides = existsSync(resolve(deckPath, "slides"))
  const hasPages = existsSync(resolve(deckPath, "pages"))
  return hasPlan || hasIndex || hasTheme || hasSlides || hasPages
}

function readRecentDecks(): RecentDeckEntry[] {
  const storePath = getRecentStorePath()
  if (!existsSync(storePath)) return []
  try {
    const raw = readFileSync(storePath, "utf-8")
    const parsed = JSON.parse(raw) as { recent?: RecentDeckEntry[] }
    if (!parsed?.recent || !Array.isArray(parsed.recent)) return []
    return parsed.recent
      .filter(
        (entry) =>
          entry &&
          typeof entry.path === "string" &&
          typeof entry.openedAt === "number",
      )
      .map((entry) => ({ path: resolve(entry.path), openedAt: entry.openedAt }))
      .filter((entry) => existsSync(entry.path))
      .filter((entry) => isDeckDirectory(entry.path))
  } catch {
    return []
  }
}

function writeRecentDecks(recent: RecentDeckEntry[]) {
  const storePath = getRecentStorePath()
  const dir = dirname(storePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const deduped = new Map<string, RecentDeckEntry>()
  for (const entry of recent) {
    const resolvedPath = resolve(entry.path)
    const existing = deduped.get(resolvedPath)
    if (!existing || entry.openedAt > existing.openedAt) {
      deduped.set(resolvedPath, { path: resolvedPath, openedAt: entry.openedAt })
    }
  }
  const finalRecent = [...deduped.values()]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, MAX_RECENT_DECKS)
  writeFileSync(storePath, JSON.stringify({ recent: finalRecent }, null, 2))
}

function touchRecentDeck(path: string) {
  try {
    const resolvedPath = resolve(path)
    const recent = readRecentDecks()
    recent.push({ path: resolvedPath, openedAt: Date.now() })
    writeRecentDecks(recent)
  } catch {
    // Never fail deck switching/listing because recent-cache persistence failed.
  }
}

function collectSiblingDecks(current: string): DeckEntry[] {
  const parent = resolve(current, "..")
  const siblings: DeckEntry[] = []
  if (!existsSync(parent)) return siblings

  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const deckPath = resolve(parent, entry.name)
    if (!isDeckDirectory(deckPath)) continue
    siblings.push({
      name: entry.name,
      path: deckPath,
      hasPlan: existsSync(resolve(deckPath, "DECK-PLAN.md")),
    })
  }

  siblings.sort((a, b) => a.name.localeCompare(b.name))
  return siblings
}

function recentEntriesForResponse(current: string): DeckEntry[] {
  const recent = readRecentDecks()
    .sort((a, b) => b.openedAt - a.openedAt)
    .map((entry) => ({
      name: basename(entry.path),
      path: entry.path,
      hasPlan: existsSync(resolve(entry.path, "DECK-PLAN.md")),
    }))
  // Always include current at top even if it has never been switched via POST.
  const withCurrentFirst = [
    {
      name: basename(current),
      path: current,
      hasPlan: existsSync(resolve(current, "DECK-PLAN.md")),
    },
    ...recent,
  ]
  const deduped = new Map<string, DeckEntry>()
  for (const entry of withCurrentFirst) {
    if (!deduped.has(entry.path)) deduped.set(entry.path, entry)
  }
  return [...deduped.values()].slice(0, MAX_RECENT_DECKS)
}

/** POST — switch to a different deck directory */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path: string }
    if (!body.path) {
      return NextResponse.json(
        { ok: false, error: "Missing path" },
        { status: 400 },
      )
    }

    if (!isAbsolute(body.path)) {
      return NextResponse.json(
        { ok: false, error: "Deck path must be absolute (relative paths are not allowed)." },
        { status: 400 },
      )
    }

    const resolved = resolve(body.path)

    // Safety: don't allow paths outside home directory
    const home = process.env.HOME || "/Users"
    if (!resolved.startsWith(home)) {
      return NextResponse.json(
        { ok: false, error: "Path must be within home directory" },
        { status: 403 },
      )
    }

    if (!existsSync(resolved)) {
      return NextResponse.json(
        { ok: false, error: `Directory not found: ${resolved}` },
        { status: 404 },
      )
    }

    switchDeckDir(resolved)
    touchRecentDeck(resolved)
    return NextResponse.json({ ok: true, path: resolved })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

/** GET — return current deck directory and list sibling decks for quick switching */
export async function GET() {
  try {
    const current = getDeckDir()
    const parent = resolve(current, "..")
    touchRecentDeck(current)
    const siblings = collectSiblingDecks(current)
    const recent = recentEntriesForResponse(current)
    return NextResponse.json({ current, parent, siblings, recent })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      current: "",
      parent: "",
      siblings: [],
      recent: [],
      error: msg,
    })
  }
}

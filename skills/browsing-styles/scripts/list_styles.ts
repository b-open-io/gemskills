#!/usr/bin/env bun
/**
 * List styles from the registry with optional filtering
 */

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const STYLES_PATH = resolve(__dirname, "../assets/styles.json")

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

function loadStyles(): StylesRegistry {
  const content = readFileSync(STYLES_PATH, "utf-8")
  return JSON.parse(content)
}

function parseArgs(): {
  category?: string
  search?: string
  fields?: string[]
  format: "json" | "table"
} {
  const args = process.argv.slice(2)
  const result: ReturnType<typeof parseArgs> = { format: "json" }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--category" && args[i + 1]) {
      result.category = args[++i]
    } else if (arg === "--search" && args[i + 1]) {
      result.search = args[++i].toLowerCase()
    } else if (arg === "--fields" && args[i + 1]) {
      result.fields = args[++i].split(",")
    } else if (arg === "--table") {
      result.format = "table"
    }
  }

  return result
}

function filterStyles(styles: Style[], opts: ReturnType<typeof parseArgs>): Style[] {
  let filtered = styles

  if (opts.category) {
    filtered = filtered.filter((s) => s.category === opts.category)
  }

  if (opts.search) {
    const search = opts.search
    filtered = filtered.filter(
      (s) =>
        s.id.includes(search) ||
        s.name.toLowerCase().includes(search) ||
        s.shortName.includes(search) ||
        s.promptHints.toLowerCase().includes(search)
    )
  }

  return filtered
}

function projectFields(styles: Style[], fields?: string[]): Partial<Style>[] {
  if (!fields) return styles
  return styles.map((s) => {
    const projected: Record<string, unknown> = {}
    for (const field of fields) {
      if (field in s) {
        projected[field] = s[field as keyof Style]
      }
    }
    return projected as Partial<Style>
  })
}

function printTable(styles: Partial<Style>[]): void {
  if (styles.length === 0) {
    console.log("No styles found")
    return
  }

  const keys = Object.keys(styles[0])
  const widths: Record<string, number> = {}

  for (const key of keys) {
    widths[key] = Math.max(
      key.length,
      ...styles.map((s) => String(s[key as keyof typeof s] ?? "").slice(0, 40).length)
    )
  }

  // Header
  const header = keys.map((k) => k.padEnd(widths[k])).join(" | ")
  console.log(header)
  console.log(keys.map((k) => "-".repeat(widths[k])).join("-+-"))

  // Rows
  for (const style of styles) {
    const row = keys
      .map((k) => String(style[k as keyof typeof style] ?? "").slice(0, 40).padEnd(widths[k]))
      .join(" | ")
    console.log(row)
  }

  console.log(`\n${styles.length} styles`)
}

function main(): void {
  const opts = parseArgs()
  const registry = loadStyles()

  let styles = filterStyles(registry.styles, opts)
  const projected = projectFields(styles, opts.fields)

  if (opts.format === "table") {
    printTable(projected)
  } else {
    console.log(JSON.stringify(projected, null, 2))
  }
}

main()

#!/usr/bin/env bun
/**
 * Build the Next.js playground app into a static export.
 *
 * Usage: bun run skills/deck-creator/scripts/build_playground.ts
 * Output: skills/deck-creator/playground/out/ (Next.js static export)
 */

import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))

const playgroundDir = resolve(__dirname, "../playground")
const outDir = resolve(playgroundDir, "out")

// Run next build
console.error("Building Next.js playground...")
const result = spawnSync("bun", ["run", "build"], {
	cwd: playgroundDir,
	stdio: "inherit",
})

if (result.status !== 0) {
	console.error("Next.js build failed")
	process.exit(1)
}

if (!existsSync(outDir)) {
	console.error("Error: next build did not produce out/ directory")
	process.exit(1)
}

// Report sizes
function dirSize(dir: string): number {
	let total = 0
	if (!existsSync(dir)) return 0
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = resolve(dir, entry.name)
		if (entry.isDirectory()) {
			total += dirSize(p)
		} else {
			total += statSync(p).size
		}
	}
	return total
}

const totalKb = (dirSize(outDir) / 1024).toFixed(1)
console.error(`Built playground static export → ${outDir} (${totalKb} KB total)`)

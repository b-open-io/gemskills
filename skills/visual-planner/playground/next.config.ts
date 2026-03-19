import path from "node:path"
import type { NextConfig } from "next"

const PLAYGROUND_DIR = path.dirname(new URL(import.meta.url).pathname)

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: { unoptimized: true },
  turbopack: {
    root: PLAYGROUND_DIR,
    resolveAlias: {
      tailwindcss: path.join(PLAYGROUND_DIR, "node_modules/tailwindcss"),
      "tw-animate-css": path.join(PLAYGROUND_DIR, "node_modules/tw-animate-css"),
    },
  },
}

export default nextConfig

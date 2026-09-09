---
provider: gemini
task: image
model: gemini-3-pro-image
version: 1
---

# Prompt guide — Gemini Nano Banana Pro (`gemini-3-pro-image`)

Gemini is the full-featured default: rich scene description, style tiles,
up to 14 reference images, negative prompts, transparency, and 1K/2K/4K sizes.

The canonical, detailed guidance lives in
`skills/generate-image/references/prompt-guide.md` — **read that file** for the
7 strategies and example transformations. Core principle:

> **Describe the scene, don't just list keywords.**

## Gemini-specific levers (other providers lack these)
- **Style tiles** (`--style <id>`): a reference tile is sent alongside the
  prompt; prepend "Match the artistic style, palette, textures, and technique
  from the reference image — do not copy its subject matter."
- **Reference images** (`--input`, up to 14): describe how to combine them
  (character + location + props) for scene/character consistency.
- **Negative prompt** (`--negative`): a true negative parameter — use it.

Transparency is also supported on OpenAI Image 2.5 (`--transparent`).

Keep the full scene-description discipline (subject, environment, lighting,
composition, style, mood, technical specs).

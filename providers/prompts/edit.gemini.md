---
provider: gemini
task: edit
model: gemini-3-pro-image
version: 1
---

# Prompt guide — Gemini Nano Banana Pro (edit)

Gemini is the default editor: conversational edits, inpainting, outpainting,
style transfer, transparency, and multi-image composition. The detailed
guidance lives in the `edit-image` skill's own SKILL.md and
`skills/generate-image/references/prompt-guide.md`.

## Gemini-specific levers (other providers lack these)
- **Negative prompts** as a true parameter.
- **Style tiles** for style-consistent edits.

Transparency is also supported on OpenAI Image 2.5 (`--transparent`).

## Essentials
- Describe the change precisely and how it integrates (lighting, perspective,
  materials). Reference unchanged regions to keep them stable.
- Prefer Gemini whenever the edit needs a style tile or a true negative
  prompt; otherwise Image 2.5 (`gpt-image-2.5-flare`) is a strong alternative
  for masked inpainting, multi-image compositing, and transparent PNG.

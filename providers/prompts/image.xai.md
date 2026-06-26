---
provider: xai
task: image
model: grok-imagine-image-quality
version: 1
---

# Prompt guide — xAI Grok Imagine (text-to-image)

Grok Imagine favors **shorter, punchier prompts** than Gemini or gpt-image-2. It
responds well to a strong central subject and a clear vibe, and tends to
over-bake when given long multi-clause paragraphs.

## Do
- **Lead with the subject and the single dominant style word** ("neon cyberpunk
  alley", "watercolor fox"). 1–3 sentences max.
- **Name a concrete aesthetic or reference era** rather than stacking modifiers.
- **Specify aspect + resolution via flags** (`--aspect`, `--size 1K|2K`), not prose.

## Don't
- **No negative parameter.** Fold exclusions into the description positively.
  (The skill appends an `Avoid: …` clause for `--negative`, but keep it short.)
- **No style tiles / reference images.** Grok Imagine text-to-image is prompt-only.
  If the user needs style-tile adherence or img2img, route to Gemini.
- **Don't pile on more than ~2 style adjectives** — it muddies the result.

## When to pick xAI for images
Grok Imagine is the spicier/faster option and a good fallback when Gemini's
safety filter blocks benign prompts. For maximum fidelity/likeness and styles,
prefer Gemini; for best text rendering, prefer gpt-image-2.

## Skeleton
> [Subject], [one dominant style], [setting/mood]. [Optional: lighting or color].

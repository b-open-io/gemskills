---
name: generate-svg
description: This skill should be used when the user asks to "generate SVG", "create SVG", "make a logo", "create vector graphics", "generate icon", "make vector illustration", "vectorize image", or needs scalable vector graphics generated via AI.
---

# Generate SVG

Generate SVG graphics using Arrow `arrow-preview` by Quiver AI. Supports both text-to-SVG generation and image-to-SVG vectorization.

## When to Use

Use this skill when the user asks to:
- Create SVG graphics, logos, icons, or illustrations from a text description
- Vectorize / convert an existing image to SVG

## API Key Required

Set `QUIVERAI_API_KEY` or `QUIVER_API_KEY` in your environment. Get a key at https://quiver.ai.

## Usage

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-svg/scripts/generate.ts "prompt" [options]
```

### Text-to-SVG Options

| Flag | Type | Default | Range | Description |
|------|------|---------|-------|-------------|
| `--instructions <text>` | string | — | — | Additional style or formatting guidance |
| `--references <url>` | string | — | up to 4 | Reference image URL or base64 (repeat flag for multiple) |
| `--count <n>` | integer | 1 | 1–16 | Number of SVGs to generate |
| `--temperature <n>` | float | 1 | 0–2 | Sampling temperature (lower = more deterministic) |
| `--top-p <n>` | float | 1 | 0–1 | Nucleus sampling probability |
| `--presence-penalty <n>` | float | 0 | -2–2 | Penalty for tokens already in prior output |
| `--max-tokens <n>` | integer | — | 1–131072 | Max output tokens (use 131072 for highest detail) |
| `--output <path>` | string | output.svg | — | Output file path |

### Image-to-SVG (Vectorize) Options

| Flag | Type | Default | Range | Description |
|------|------|---------|-------|-------------|
| `--vectorize` | boolean | false | — | Enable vectorization mode |
| `--image <url\|base64>` | string | — | — | Source image (required in vectorize mode) |
| `--auto-crop` | boolean | false | — | Auto-crop to dominant subject before vectorization |
| `--target-size <n>` | integer | — | 128–4096 | Square resize target in pixels before inference |
| `--count`, `--temperature`, `--top-p`, `--presence-penalty`, `--max-tokens`, `--output` | — | — | — | Same as text-to-SVG |

### Examples

```bash
# Simple SVG generation
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-svg/scripts/generate.ts "minimalist mountain logo"

# High-detail render (max tokens)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-svg/scripts/generate.ts "photorealistic bee" --max-tokens 131072

# With style instructions
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-svg/scripts/generate.ts "geometric pattern" --instructions "Use only blue and green colors, bold strokes"

# With reference images
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-svg/scripts/generate.ts "logo in this style" \
  --references https://example.com/ref1.png \
  --references https://example.com/ref2.png

# Save to specific file
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-svg/scripts/generate.ts "company logo" --output logo.svg

# Vectorize an image URL to SVG
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-svg/scripts/generate.ts --vectorize --image https://example.com/photo.jpg --auto-crop

# Vectorize with high-res target
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-svg/scripts/generate.ts --vectorize --image https://example.com/photo.jpg --target-size 2048 --max-tokens 131072
```

## Model

Uses Arrow `arrow-preview` (Quiver AI) for SVG generation. Override with `SVG_MODEL` env var.

Cost: 1 credit per request (regardless of `--count`).
Rate limit: 20 requests per 60 seconds.

> Last verified: March 2026.

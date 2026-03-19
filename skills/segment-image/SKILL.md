---
name: segment-image
description: This skill should be used when the user asks to "segment an image", "identify objects", "extract objects", "generate masks", "find objects in image", or needs AI-powered image segmentation.
---

# Segment Image

Segment and identify objects in images using Gemini's vision capabilities.

## When to Use

Use this skill when the user asks to:
- Identify objects in an image
- Generate masks for specific objects
- Segment an image into regions
- Extract objects from an image

## Usage

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/segment-image/scripts/segment.ts <input-image> [options]
```

### Options

- `--prompt <text>` - Custom segmentation prompt
- `--output <dir>` - Output directory for mask files

### Examples

```bash
# Segment all objects
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/segment-image/scripts/segment.ts photo.jpg

# Segment with custom prompt
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/segment-image/scripts/segment.ts photo.jpg --prompt "identify all people and vehicles"

# Save masks to directory
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/segment-image/scripts/segment.ts photo.jpg --output ./masks
```

## Context Discipline

**Do not read generated mask images back into context.** The script outputs file paths. Ask the user to visually inspect the masks. To inspect programmatically, optimize the images first (via the optimize-images skill).

## Model

Uses `gemini-3-flash-preview` (Gemini 3 Flash) for image segmentation.

> Last verified: February 2026. If a newer generation exists, STOP and suggest a PR to `b-open-io/gemskills`. See the ask-gemini skill's `references/gemini-api.md` for current models and Google's official `gemini-api-dev` skill for the canonical source.

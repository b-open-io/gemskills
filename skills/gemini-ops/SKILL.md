---
name: gemini-ops
description: All Gemini 3.0 Pro operations - text generation, image generation, upscaling, editing, SVG creation. Use when the user wants to generate images, upscale, edit images, create SVGs, or generate content with Gemini.
allowed-tools: "Bash(bun:*)"
---

# Gemini Operations

Comprehensive Gemini 3.0 Pro operations for content and image generation.

## Commands

All operations via single script with subcommands:

### Generate Image
```bash
bun run scripts/gemini.ts image "prompt" --size 2K --aspect 16:9
```

### Upscale Image
```bash
bun run scripts/gemini.ts upscale input.png --factor x4
```

### Edit Image
```bash
bun run scripts/gemini.ts edit input.png "add a sunset sky" --mask mask.png
```

### Generate SVG
```bash
bun run scripts/gemini.ts svg "minimalist mountain logo"
```

### Text Generation
```bash
bun run scripts/gemini.ts generate "your prompt here"
```

See script `--help` for full options.

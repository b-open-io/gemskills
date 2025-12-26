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
bun run scripts/segment.ts <input-image> [options]
```

### Options

- `--prompt <text>` - Custom segmentation prompt
- `--output <dir>` - Output directory for mask files

### Examples

```bash
# Segment all objects
bun run scripts/segment.ts photo.jpg

# Segment with custom prompt
bun run scripts/segment.ts photo.jpg --prompt "identify all people and vehicles"

# Save masks to directory
bun run scripts/segment.ts photo.jpg --output ./masks
```

## Model

Uses `gemini-3-pro-preview` for image segmentation.

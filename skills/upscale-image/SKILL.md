# Upscale Image

Upscale images using Gemini's imagen-3.0 upscaler.

## When to Use

Use this skill when the user asks to:
- Upscale a low-resolution image
- Increase image resolution
- Enhance image quality

## Usage

```bash
bun run scripts/upscale.ts <input-image> [options]
```

### Options

- `--factor <x2|x4>` - Upscale factor (default: x2)
- `--format <png|jpeg|webp>` - Output format
- `--quality <n>` - JPEG quality (1-100)
- `--output <path>` - Output path

### Examples

```bash
# 2x upscale
bun run scripts/upscale.ts photo.jpg

# 4x upscale
bun run scripts/upscale.ts photo.jpg --factor x4

# Upscale and save as PNG
bun run scripts/upscale.ts photo.jpg --factor x4 --format png --output hires.png
```

## Model

Uses `imagen-3.0-generate-001` with upscaling configuration.

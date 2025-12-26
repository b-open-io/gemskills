# Generate Image

Generate images using Gemini's imagen-3.0 models.

## When to Use

Use this skill when the user asks to:
- Generate an image from a text prompt
- Create artwork, illustrations, or graphics
- Generate variations of an existing image (img2img)

## Usage

```bash
bun run scripts/generate.ts "prompt" [options]
```

### Options

- `--size <1K|2K|4K>` - Image size (default: 2K)
- `--aspect <ratio>` - Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4
- `--negative <prompt>` - Negative prompt (what to avoid)
- `--count <n>` - Number of images (1-4, default: 1)
- `--guidance <n>` - Guidance scale
- `--seed <n>` - Random seed for reproducibility
- `--input <path>` - Input image for img2img
- `--output <path>` - Output path

### Examples

```bash
# Simple generation
bun run scripts/generate.ts "cyberpunk cityscape at night"

# High-res with specific aspect ratio
bun run scripts/generate.ts "mountain landscape" --size 4K --aspect 16:9

# With negative prompt
bun run scripts/generate.ts "portrait of a cat" --negative "low quality, blurry"

# Generate multiple variations
bun run scripts/generate.ts "abstract art" --count 4

# Image-to-image
bun run scripts/generate.ts "make it look like a watercolor painting" --input photo.jpg
```

## Model

Uses `gemini-3-pro-image-preview` for image generation.

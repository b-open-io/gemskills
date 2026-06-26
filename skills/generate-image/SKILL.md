---
name: generate-image
description: This skill should be used when the user asks to "generate an image", "create a banner", "make artwork", "create an illustration", "generate a logo", "make a graphic", "design a header", "AI art", "img2img", "social share image", "OG image", "open graph image", "Twitter card", "hero image", "cover photo", "profile picture", "social media graphic", or needs AI image generation. Handles prompt rewriting and Gemini 3 Pro image generation API calls.
---

# Generate Image

Generate images using Nano Banana Pro (`gemini-3-pro-image`).

## When to Use

Use this skill when the user asks to:
- Generate an image from a text prompt
- Create artwork, illustrations, or graphics
- Generate variations of an existing image (img2img)
- Create scenes with multiple reference images (character + location + other characters)

## Style Selection

**If the user hasn't specified a style**, present a multi-choice question before proceeding:

> **How would you like to handle the art style?**
>
> 1. **Pick a style** - Browse 167 styles visually and choose one
> 2. **Let me choose** - I'll suggest a style based on your prompt
> 3. **What are styles?** - Learn how the style system works
> 4. **No style** - Generate without a specific art style

Use the `AskUserQuestion` tool to present this choice.

**If the user picks "Pick a style"**, launch the style picker (pick mode is the default):

```bash
STYLE_JSON=$(bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts)
```

The picker opens a browser. The user clicks a style, views the detail modal, clicks "Select This Style". `STYLE_JSON` receives the selection as JSON and the server exits. Parse the `id` field and pass it via `--style <id>` to the generate command.

**If the user picks "Let me choose"**, select the most fitting style based on their prompt and explain why. Use the style suggestions in the "Suggest Styles to Users" section below.

**If the user picks "What are styles?"**, explain: there are 167 curated art styles across 10 categories (traditional, digital, illustration, photography, design, retro, technique, decorative, creative, cultural). Each style includes prompt hints and a visual reference tile that gets sent to Gemini for better adherence. Then re-ask the style question.

**If the user already specified a style** (e.g. "generate in watercolor style"), skip this step entirely and use `--style` directly.

## Gather Design Direction First

**Ask clarifying questions before rewriting prompts** to understand the user's intent:

1. **Purpose**: What is the image for? (banner, logo, social media, product shot, art piece)
2. **Color palette**: Any brand colors? Dark/light theme? Specific mood?
3. **Composition constraints**: Aspect ratio needs? Text overlay space? Full-bleed vs bordered?
4. **Key elements**: What must be included? What should be avoided?

Simple requests like "make a cat image" can proceed with sensible defaults. Complex requests like "create a banner for my app" require clarification to avoid iteration waste.

## Prompt Rewriting (Critical)

**Before generating any image, always rewrite the user's prompt** using the guide in `references/prompt-guide.md`.

The core principle: **"Describe the scene, don't just list keywords."**

### Rewriting Checklist

Transform simple prompts by adding:
1. **Subject details**: Specific appearance, clothing, expression, materials
2. **Environment/Setting**: Location, time of day, weather, indoor/outdoor
3. **Lighting**: Natural/artificial, direction, quality, color temperature
4. **Composition**: Camera angle, distance, framing, focal length
5. **Style/Aesthetic**: Photorealistic, illustration style, art movement
6. **Mood/Atmosphere**: Emotional tone, color palette mood
7. **Technical specs**: Aspect ratio, level of detail, textures

### Example Transformation

**User says**: "banner for my app"
**Rewritten prompt**: "A modern, full-bleed banner for a technology application. Dark gradient background transitioning from deep navy to black. Abstract geometric network visualization with glowing nodes connected by thin lines. Clean sans-serif typography positioned left of center. Professional, tech-forward aesthetic with no visible borders or edges - the design extends seamlessly to all edges. 16:9 aspect ratio."

**User says**: "a cat"
**Rewritten prompt**: "A fluffy orange tabby cat lounging on a sun-drenched windowsill, soft afternoon light creating a warm glow on its fur. The cat is in a relaxed pose with half-closed eyes, conveying contentment. Shot from a low angle with shallow depth of field, the background showing a blurred garden view. Photorealistic, warm color palette."

## Recommended Workflow

**Draft → Iterate → Final** approach saves time and API costs:

1. **Draft Phase (1K)**: Generate quickly at default resolution to test prompts
2. **Iteration Phase**: Refine prompts incrementally, creating new files each attempt
3. **Final Phase (4K)**: Only produce high-res output after prompt is validated

**Do not read the image back** - the script outputs only the file path. This allows efficient iteration without Claude loading large image data.

## Usage

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "prompt" [options]
```

### Options

- `--input <path>` - Reference image (can specify multiple times, up to 14 images)
- `--style <id>` - Apply style from the style library (see browsing-styles skill)
- `--size <1K|2K|4K>` - Image size (default: 1K for fast drafts)
- `--aspect <ratio>` - Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4
- `--negative <prompt>` - Negative prompt (what to avoid)
- `--count <n>` - Number of images (1-4, default: 1)
- `--guidance <n>` - Guidance scale
- `--seed <n>` - Random seed for reproducibility
- `--output <path>` - Output path
- `--provider <name>` - `gemini`, `openai`, or `xai`. Omit to **auto-pick** the best available provider for the request (see Models). `--model` is a legacy alias; `grok` maps to `xai`.

### Examples

```bash
# Simple generation
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "cyberpunk cityscape at night"

# With art style (100+ available, use short names or full IDs)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "mountain landscape" --style impressionism
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "portrait" --style ukiy
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "city street" --style noir

# High-res with specific aspect ratio
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "mountain landscape" --size 4K --aspect 16:9

# With negative prompt
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "portrait of a cat" --negative "low quality, blurry"

# Combine style with other options
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "cat sleeping" --style wtrc --size 4K --aspect 1:1

# Generate multiple variations
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "abstract art" --count 4

# Single reference image (img2img)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "make it look like a watercolor painting" --input photo.jpg

# Multiple reference images (character consistency, scene composition)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "King on throne in dramatic lighting" \
  --input character.png \
  --input throne-room.png \
  --aspect 16:9 --size 2K

# Multiple characters in a scene
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "Two warriors facing each other in combat" \
  --input warrior1.png \
  --input warrior2.png \
  --input battlefield.png \
  --aspect 16:9
```

## Multiple Reference Images

Gemini supports up to 14 reference images per request:
- **6 objects** - Locations, items, environments
- **5 humans** - Character consistency across generations
- Use detailed prompts describing how reference images should be combined
- Reference images help maintain consistency across scene generations

## Common Formats

| Format | Aspect Ratio | Recommended Size | Crop Target |
|--------|-------------|-----------------|-------------|
| OG / Social Share | 16:9 | 2K | 1200x630 via sips |
| Twitter Card | 16:9 | 2K | 1200x628 via sips |
| Hero Banner | 16:9 | 4K | Full width |
| Profile Picture | 1:1 | 1K | 512x512 or 1024x1024 |
| Story / Reel | 9:16 | 2K | 1080x1920 |
| Team Lineup | 21:9 | 2K | Full width |

### Social Share Image Workflow

**All 4 steps are required. Do not skip optimization.**

1. **Generate** at 16:9 with center-weighted prompt at `--size 2K` (retina-ready):
   ```bash
   bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "CENTER all important elements, no content near edges. [your prompt]" --aspect 16:9 --size 2K --output social-share.png
   ```
2. **Crop** to exact platform dimensions:
   ```bash
   sips -z 630 1200 -c 630 1200 social-share.png --out social-share-og.png   # OG
   sips -z 628 1200 -c 628 1200 social-share.png --out social-share-tw.png   # Twitter
   ```
3. **Optimize** - convert to JPEG at 85% quality (social images never need transparency):
   ```bash
   sips -s format jpeg -s formatOptions 85 social-share-og.png --out social-share-og.jpg
   ```
4. **Verify** dimensions and file size:
   ```bash
   sips -g pixelWidth -g pixelHeight social-share-og.jpg
   ls -la social-share-og.jpg  # Target: <500KB
   ```

**Why optimize?** Gemini outputs PNG (~1-2MB). JPEG at 85% reduces to ~200-400KB with no visible quality loss. Social platforms re-compress uploads, so starting with a well-optimized JPEG prevents double-compression artifacts.

## Available Styles

100+ styles across 9 categories: traditional art, digital, illustration, photography, design/UI, retro, techniques, decorative, and creative/material-based.

When a style has a tile reference image (`assets/tiles/<id>.png`), it is automatically sent as a visual reference to Gemini alongside the prompt hints — this produces much better style adherence.

### Suggest Styles to Users

When generating images, proactively suggest relevant styles:
- For landscapes: `impr`, `roma`, `wtrl`, `cine`
- For portraits: `barq`, `prer`, `anim`, `fnoi`
- For UI/web: `brut`, `nbrt`, `glas`, `flat`
- For retro/vintage: `y2k`, `frug`, `psyc`, `koda`
- For whimsical/fun: `ghbl`, `kawa`, `chld`, `brit`
- For dramatic: `cybr`, `nnoi`, `surr`, `expr`
- For creative: `sand`, `undr`, `orig`, `clay`, `lego`

Browse all: `bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/list_styles.ts --table`
Search: `bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/list_styles.ts --search "watercolor"`

## Models & Providers

Three providers, selected with `--provider` or **auto-picked** when omitted.

| Provider | Model | Key | Strengths | Can't do |
|----------|-------|-----|-----------|----------|
| `gemini` (default fallback) | `gemini-3-pro-image` (Nano Banana Pro) | `GEMINI_API_KEY` | Style tiles, up to 14 reference images, negative prompts, **transparency**, 1K/2K/4K | — |
| `openai` | `gpt-image-2` | `OPENAI_API_KEY` | Best **in-image text**, dense prompt understanding, custom sizes, **image-to-image** (`--input`, up to 16, via the edits endpoint) | No transparency, no style tiles, no negative param |
| `xai` | `grok-imagine-image-quality` | `XAI_API_KEY` | Fast, spicier; good when Gemini's filter blocks a benign prompt | Text-to-image only — no img2img/tiles/negative |

### Auto-pick (default when `--provider` is omitted)

The script chooses the **best provider whose key is present and that supports
what the request needs**. Ranking is `openai > gemini > xai`.

`--input` (img2img / reference images) is supported by **both openai and gemini**
— openai routes it through the `gpt-image-2` edits endpoint, gemini through Nano
Banana Pro (which also supports style tiles + up to 14 refs). So img2img
auto-picks openai when its key is present; pass `--provider gemini` for Gemini's
style-tile / multi-ref compositing.

Capability gating still forces **Gemini** when the request uses `--style` (style
tiles) or `--negative` (a true negative parameter) — only Gemini supports those.
Pin a default with `/gemskills:setup` or `GEMSKILLS_IMAGE_PROVIDER`.

When openai is chosen with a `--style`, the style **tile image** is dropped (the
textual hints are still applied) and `--negative` is folded into the prompt as an
`Avoid: …` clause. xAI additionally drops reference images (text-to-image only).

### Prompt templates (tune per provider)

Each provider parses prompts differently. **After the provider is resolved, read
the matching guide and rewrite the prompt to it:**
- `providers/prompts/image.gemini.md`
- `providers/prompts/image.openai.md`
- `providers/prompts/image.xai.md`

```bash
# Force a provider
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "neon city street, rain" --provider openai --size 4K
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "watercolor fox" --provider xai
```

> Models verified live: June 2026 (`gpt-image-2`, `grok-imagine-image-quality`, `gemini-3-pro-image`). If a newer generation exists, STOP and suggest a PR to `b-open-io/gemskills`.

## Reference Files

For detailed prompting strategies and techniques:
- **`references/prompt-guide.md`** - Comprehensive Gemini prompting guide with 7 strategies, example transformations, and best practices from Google's official documentation
- **ask-gemini skill's `references/gemini-api.md`** - Current Gemini models, SDK info, and dynamic documentation via llms.txt

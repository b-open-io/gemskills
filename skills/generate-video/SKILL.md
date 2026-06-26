---
name: generate-video
description: This skill should be used when the user asks to "generate a video", "create a video", "animate an image", "text to video", "image to video", "make a video clip", "video from image", "bring this image to life", "subject-consistent video", "match character likeness in video", "interpolate between frames", or needs AI video generation using Veo 3.1. Handles prompt rewriting, style application, reference images for subject consistency, and Gemini Veo video generation API calls.
---

# Generate Video

Generate videos using Veo 3.1 (`veo-3.1-generate-preview`) with native audio, 720p/1080p/4K resolution, and 4-8 second clips.

## When to Use

Use this skill when the user asks to:
- Generate a video from a text prompt (text-to-video)
- Animate an existing image (image-to-video)
- Create a styled video clip using the art style library
- Build an image-to-video pipeline with auto-generated starting frames

## Critical: Run as Background Task

Veo video generation takes **11 seconds to 6 minutes**. The script handles polling internally and outputs only a file path when complete.

**Always run the generate script as a background task** to avoid blocking the conversation and bloating context with polling output:

```bash
# CORRECT: background task
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "prompt" --output video.mp4
# Run with run_in_background: true in the Bash tool
```

After the background task completes, read only the final line of output (the file path). Do not read the full output — it contains only stderr progress dots.

## Style Selection

**If the user hasn't specified a style**, present a multi-choice question before proceeding:

> **How would you like to handle the art style?**
>
> 1. **Pick a style** - Browse 169 styles visually and choose one
> 2. **Let me choose** - I'll suggest a style based on your prompt
> 3. **No style** - Generate without a specific art style

Use the `AskUserQuestion` tool to present this choice.

**If the user picks "Pick a style"**, launch the interactive style picker:

```bash
STYLE_JSON=$(bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts --pick --port=3456)
```

Pass the selected style via `--style <id>` to the generate command.

**If the user already specified a style**, skip this step and use `--style` directly.

## Prompt Rewriting

**Before generating any video, rewrite the user's prompt** using the guide in `references/veo-prompt-guide.md`.

Transform prompts by adding:
1. **Subject details** - Specific appearance, position, scale
2. **Action/Motion** - What moves, speed, direction
3. **Style/Aesthetic** - Visual treatment, color palette
4. **Camera motion** - Pan, dolly, orbit, static
5. **Composition** - Framing, depth, focus
6. **Ambiance/Audio** - Lighting mood, sound cues (Veo generates native audio)

### Example Transformation

**User says**: "ocean waves"
**Rewritten**: "Dramatic slow-motion ocean waves crashing against dark volcanic rocks at golden hour. Spray catches the warm sunlight, creating rainbow mist. Low-angle shot, camera slowly dollying forward. Deep rumbling wave sounds with seagull calls in the distance."

## Usage

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "prompt" [options]
```

### Options

- `--input <path>` - Starting frame image (image-to-video mode)
- `--ref <path>` - Reference image for subject consistency (up to 3, can specify multiple times). Auto-selects `replicate-veo` model.
- `--last-frame <path>` - Ending frame for interpolation. Auto-selects `replicate-veo` model.
- `--style <id>` - Apply style from the style library (same as generate-image)
- `--aspect <ratio>` - `16:9` (default) or `9:16`
- `--resolution <res>` - `720p` (Gemini default), `1080p` (Replicate default), `4k` (Gemini API only)
- `--duration <sec>` - `4`, `6`, `8` (default: 8)
- `--negative <text>` - Negative prompt (what to avoid)
- `--seed <n>` - Random seed for reproducibility
- `--output <path>` - Output `.mp4` path
- `--provider <name>` - `gemini` (Veo) or `xai` (Grok Imagine). Omit to **auto-pick** by available keys. `--model` is a legacy alias (`veo`/`replicate-veo`→`gemini`, `grok`→`xai`).
- `--oneshot` - xAI only: direct text-to-video on `grok-imagine-video` (v1) instead of the default auto-frame → `grok-imagine-video-1.5` image-to-video
- `--no-audio` - Disable audio generation (Replicate Veo only)
- `--auto-image` - With `--style`, auto-generate a styled starting frame first (Veo)

### Examples

```bash
# Text-to-video (Gemini API, default)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "Ocean waves crashing on volcanic rocks at sunset" --output waves.mp4

# Image-to-video (animate an existing image)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "The lion slowly turns its head, dots shimmer" --input lion.png --output lion.mp4

# Subject-consistent video with reference images (auto-selects Replicate Veo)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "Two warriors face off in a wheat field, dramatic standoff" \
  --ref warrior1.png --ref warrior2.png --ref scene.png --output standoff.mp4

# Image-to-video with last frame interpolation (auto-selects Replicate Veo)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "Camera slowly pans across the landscape" \
  --input start.png --last-frame end.png --output pan.mp4

# With art style
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "Mountain landscape comes alive with wind" --style impr --output mountain.mp4

# Full pipeline: auto-generate styled image, then animate
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "A lion turns majestically" --style kusm --auto-image --output lion.mp4

# Vertical video for social
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "Waterfall in lush forest" --aspect 9:16 --resolution 1080p --output waterfall.mp4

# High resolution (Gemini API)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "City skyline timelapse" --resolution 4k --duration 8 --output city.mp4

# xAI Grok Imagine — default path: auto-generate a frame, then animate with grok-imagine-video-1.5
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "neon koi swimming in a dark pond" --provider xai --resolution 720p --output koi.mp4

# xAI one-shot text-to-video (grok-imagine-video v1) — faster/cheaper, lower quality
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "a paper crane rotating" --provider xai --oneshot --output crane.mp4

# xAI image-to-video from your own frame (grok-imagine-video-1.5, up to 1080p)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "the scene comes alive with wind" --provider xai --input frame.png --resolution 1080p --output alive.mp4
```

## Reference Images (Subject Consistency)

Use `--ref` to pass 1-3 reference images for subject-consistent video generation (R2V). This automatically uses Replicate Veo 3.1.

**Constraints:**
- Cannot combine `--ref` with `--input` (Replicate API limitation)
- Reference images require 16:9 aspect ratio and 8s duration
- Last frame is ignored when reference images are provided

**Best for:** Maintaining character likeness across camera angles, matching specific people/objects in generated video.

## Aspect Ratio Matching (Critical for Image-to-Video)

When using `--input`, the input image **must** match the target video aspect ratio. A square image fed to 16:9 video produces black pillarboxing with cutoff edges.

- Generate starting frames at `--aspect 16:9` (default video) or `--aspect 9:16` (vertical video)
- The `--auto-image` flag handles this automatically

## Two-Step Pipeline (Image then Video)

For maximum control, generate the starting frame separately. Always match the aspect ratio:

```bash
# Step 1: Generate styled image at 16:9 (matches default video aspect)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "majestic lion portrait" --style kusm --aspect 16:9 --size 2K --output lion.png

# Step 2: Animate the image
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts "The lion turns its head slowly, dots shimmer in the light" --input lion.png --output lion.mp4
```

## Context Discipline

- **Never read generated .mp4 files back into context** - instruct the user to play them with `open <file>.mp4`
- **Run as background task** - the script outputs only the file path to stdout
- Auto-generated starting frames (via `--auto-image`) are saved as PNG files for reference

## Models & Providers

Two providers, selected with `--provider` or **auto-picked** when omitted
(ranking for video is `xai > gemini`). When `--ref` or `--last-frame` is used,
the request routes to Gemini/Veo automatically (those features are Veo-only).

Tune prompts per provider — after the provider is resolved, read the matching
guide: `providers/prompts/video.gemini.md` or `providers/prompts/video.xai.md`.

### gemini — Veo 3.1 (`GEMINI_API_KEY`)

- **Gemini API** (default): `veo-3.1-generate-preview`. Text-to-video,
  image-to-video, 720p/1080p/4K, native audio, negative prompts. Override via
  `GEMINI_VIDEO_MODEL`.
- **Replicate Veo** (advanced features, requires `REPLICATE_API_TOKEN`,
  auto-selected by `--ref`/`--last-frame`): reference images for subject
  consistency (R2V), last-frame interpolation, 720p/1080p.

### xai — Grok Imagine Video (`XAI_API_KEY`)

- **Default (text prompt)**: generate a start frame (Gemini if available, else
  Grok Imagine image), then animate with **`grok-imagine-video-1.5`** — the
  newest, highest-quality model (image-to-video only, up to 1080p, native audio).
- **`--oneshot`**: direct text-to-video on **`grok-imagine-video`** (v1) — faster
  and cheaper, lower quality.
- **`--input <frame>`**: your own start frame → straight to `grok-imagine-video-1.5`.
- Rate-limited to ~1 req/s at low tiers (the provider retries automatically).
- Cost is reported per clip (xAI `cost_in_usd_ticks`).

> Models verified live: June 2026 (`veo-3.1-generate-preview`, `grok-imagine-video`, `grok-imagine-video-1.5`). `grok-imagine-video-1.5` is image-to-video ONLY — text-to-video on it is rejected by the API. If a newer generation exists, STOP and suggest a PR to `b-open-io/gemskills`.

## Reference Files

For detailed video prompting strategies:
- **`references/veo-prompt-guide.md`** - Veo prompt elements, audio cues, negative prompts, and image-to-video tips
- **ask-gemini skill's `references/gemini-api.md`** - Current Gemini/Veo models and SDK info

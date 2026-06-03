# Gemini API Reference

Shared reference for all gemskills. Last verified: **February 2026**.

## Current Models (Gemini 3.1 Generation)

| Model ID | Name | Use Case | Context |
|---|---|---|---|
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro | Complex reasoning, text, code, agentic workflows | 1M tokens |
| `gemini-3.5-flash` | Gemini 3 Flash | Fast balanced text/multimodal | 1M tokens |
| `gemini-3-pro-image` | Nano Banana Pro | Image generation AND editing | 1M tokens |
| `veo-3.1-generate-preview` | Veo 3.1 | Video generation (text/image-to-video) | N/A |

**Gemini 3.1 Pro** (`gemini-3.1-pro-preview`) is the latest reasoning model with improved software engineering, agentic tool use, and animated SVG generation. Replaces `gemini-3-pro-preview`.

**Nano Banana Pro** (`gemini-3-pro-image`) is Google's official branding for their professional image generation/editing model with thinking capabilities.

**Veo 3.1** (`veo-3.1-generate-preview`) is Google's video generation model with native audio, 720p/1080p/4K resolution, and 4-8 second clips. Uses async long-running operations (11s-6min latency).

## Deprecation Notice

All models below Gemini 3 are legacy and deprecated:
- `gemini-2.5-flash`, `gemini-2.5-pro` - Deprecated
- `gemini-2.5-flash-image` - Deprecated (use `gemini-3-pro-image`)
- `gemini-2.0-*`, `gemini-1.5-*` - Deprecated

## Self-Correcting Instruction

If a newer generation of Gemini models exists beyond what is listed here, **STOP**. Do not use stale model names. Instead, suggest opening a PR to `b-open-io/gemskills` to update model references.

## Official Sources

- **Google's official `gemini-api-dev` skill**: Canonical source for model list and API patterns
- **llms.txt index**: `https://ai.google.dev/gemini-api/docs/llms.txt` - Index of all doc pages in `.md.txt` format. Fetch specific pages for latest API details.
- **REST API Discovery Spec**: `https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta` - Source of truth for request/response schemas

### Key Documentation Pages

| Topic | URL |
|---|---|
| Models overview | `https://ai.google.dev/gemini-api/docs/models.md.txt` |
| Image generation | `https://ai.google.dev/gemini-api/docs/image-generation.md.txt` |
| Text generation | `https://ai.google.dev/gemini-api/docs/text-generation.md.txt` |
| Function calling | `https://ai.google.dev/gemini-api/docs/function-calling.md.txt` |
| Structured output | `https://ai.google.dev/gemini-api/docs/structured-output.md.txt` |

## SDK

- **Current**: `@google/genai` (used by gemskills)
- **Legacy**: `@google/generative-ai` - Deprecated, do not use

## Environment Variable Overrides

gemskills supports pinning models via environment variables:

| Variable | Default | Description |
|---|---|---|
| `GEMINI_TEXT_MODEL` | `gemini-3.1-pro-preview` | Text/reasoning model |
| `GEMINI_FLASH_MODEL` | `gemini-3.5-flash` | Fast multimodal model |
| `GEMINI_IMAGE_MODEL` | `gemini-3-pro-image` | Image gen/edit model |
| `GEMINI_VIDEO_MODEL` | `veo-3.1-generate-preview` | Video generation model |

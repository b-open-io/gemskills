# Changelog

## 0.0.72

GPT Image 2.6 default (checked 2026-11-07 against the OpenAI, xAI, and Google model lists).

- **OpenAI**: `--model flare|sunburst` and the full ids now map to `gpt-image-2.6-flare` and `gpt-image-2.6-sunburst`. Sunburst is the default (finals, more consistent edits). Flare is documented for fast drafts. Size, quality, transparent, and edits handling were re-tested on 2.6.
- **Auto-pick**: edit now ranks `openai > gemini` (image already did). Gemini-only flags (`--mode`, `--count`, `--seed`, `--guidance`, `--negative`, `--style`) still route to Gemini.
- **generate-icon**: new OpenAI path (`--provider`, `--model`) for the master image, with the existing background-removal pipeline.
- **xAI**: image default is `grok-imagine-image-2.0` (the old `grok-imagine-image-quality` id is no longer in the model list).
- **Docs**: README has a feature table and a per-skill provider table. Every skill states its provider support. The content agent, setup flow, and codex adapter describe the three providers.
- **Not changed, flagged**: Google lists `gemini-nano-banana-2.1`, a newer Flash-tier image model. The Gemini key in the test environment was rejected, so the Gemini path was not live-tested and the default stays `gemini-3.1-flash-image` / `gemini-3-pro-image`.

## 0.0.71

GPT Image 2.5 sizes and quality (API rules checked 2026-09-23 against docs and live probes).

- **Custom sizes**: `--size` takes `1K|2K|4K` or an exact `WxH` for openai. `--aspect` takes any `W:H` from 1:3 to 3:1. The script computes a valid size (edges divisible by 16, max edge 3840, 655,360–8,294,400 px). It stops with an error for an invalid size. It never sends `auto` in place of an invalid size. Before, any aspect except 1:1, 16:9, 4:3, 9:16, and 3:4 became `auto`, and 16:9 produced 3:2.
- **Quality flag**: new `--quality low|medium|high|xhigh|max|auto` for openai. `--size` no longer sets the quality. Before, `--size 4K` gave a high-quality image at the default size.
- **edit-image**: the Gemini JPEG quality flag is now `--jpeg-quality`, so `--quality` has one meaning. Each flag stops with an error on the wrong provider.
- **Cost**: per-model price table (text input $5, image input $8, image output $30 per 1M tokens for both 2.5 variants). Models without an entry print "no price data".

## 0.0.70

Codex plugin catalog icons (product-plugin icon sweep).

- Wire official gemskills catalog art into `.codex-plugin/plugin.json` as `composerIcon` and `logo`.
- Ship `assets/icon.png` and `assets/logo.png` from `https://bopen.ai/images/catalog/plugins/gemskills.png`.

## 0.0.69

GPT Image 2.5 upgrade (Lisa/Luke policy locked 2026-09-08).

- **Flare default**: OpenAI image/edit model is `gpt-image-2.5-flare` (direct API id; never `openai/` prefix).
- **Sunburst opt-in**: `gpt-image-2.5-sunburst` via `--model sunburst` or `OPENAI_IMAGE_MODEL`.
- **Transparency supported** on Image 2.5 (`background=transparent`, CLI `--transparent`). No longer forces Gemini.
- Gemini remains unique for **style tiles** and a **dedicated negative** parameter.
- Capability matrix + auto-pick updated; ranking still `openai > gemini > xai` for image.
- Prompt guides, setup, README, and Lisa agent strings updated off bare `gpt-image-2`.
- Models verified September 2026.

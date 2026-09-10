# Changelog

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

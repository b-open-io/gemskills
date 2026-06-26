---
name: setup
description: This skill should be used when the user asks to "set up gemskills", "configure gemskills", "choose default image/video provider", "use OpenAI for images", "use xAI/Grok for video", "switch image model", "which providers are available", "gemskills onboarding", or wants to set or inspect which AI provider (Gemini, OpenAI gpt-image-2, xAI Grok Imagine) is used by default for image, video, and edit generation. Detects available API keys and persists provider defaults.
---

# gemskills setup

gemskills supports three providers, chosen per task with `--provider` or
auto-picked by available API keys. This skill detects keys and sets/inspects the
default provider for **image**, **video**, and **edit**.

| Task | Providers (key) | Notes |
|------|-----------------|-------|
| image | gemini (`GEMINI_API_KEY`), openai (`OPENAI_API_KEY`), xai (`XAI_API_KEY`) | openai `gpt-image-2` best text/realism; gemini = styles/refs/transparency; xai fast |
| video | xai (`XAI_API_KEY`), gemini (`GEMINI_API_KEY`) | xai `grok-imagine-video-1.5` newest i2v; gemini Veo 3.1 audio/4K/refs |
| edit | gemini (`GEMINI_API_KEY`), openai (`OPENAI_API_KEY`) | gemini conversational/transparency; openai masked inpaint/compose |

## Config CLI

All operations go through the config CLI (resolution precedence:
`--provider` flag → `GEMSKILLS_<TASK>_PROVIDER` env → project `.gemskills.json`
→ global `~/.config/gemskills/config.json` → capability-aware auto-pick):

```bash
# What keys are present?
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/providers/config.ts detect

# Show config paths + merged settings + keys
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/providers/config.ts show

# What would a task resolve to right now?
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/providers/config.ts get image

# Set a default (global, or add --project for repo-only)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/providers/config.ts set image openai
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/providers/config.ts set video xai --project
```

## Interactive flow

For a guided, question-based walkthrough, run the `/gemskills:setup` slash
command. Use `AskUserQuestion` to let the user pick a default for each task where
more than one provider has a key (offer only key-present providers plus an
"Auto-pick" option), then persist with `config set`.

## Agentic / non-interactive use

Agents can call the CLI directly. Typical repair: run `detect`; if a required
key is missing, tell the user the exact env var and where to get it
(aistudio.google.com / platform.openai.com / console.x.ai) — never substitute a
different key name. To pin a provider without prompting, `config set <task> <provider>`.

## Notes

- Auto-pick is **capability-aware**: requests using style tiles, reference
  images, transparency, or negative prompts route to Gemini regardless of the
  configured default, because only Gemini supports them.
- Per-call `--provider <name>` always wins over saved config.
- Keys are read from one canonical env var each; gemskills never falls back to
  alternate names — if the canonical var is unset, the provider fails loudly.

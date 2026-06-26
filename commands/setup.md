---
description: Configure gemskills image/video/edit providers (Gemini, OpenAI, xAI) and save defaults
argument-hint: "[show]"
allowed-tools: Bash(bun run:*), AskUserQuestion, Read
---

# gemskills setup

Configure which AI provider gemskills uses by default for **image**, **video**,
and **edit** tasks, based on which API keys you have. Works for terminal users
and can also be run by agents.

## Step 1 — Detect available keys and current config

Run:

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/providers/config.ts show
```

This prints which provider keys are present (`gemini`/`openai`/`xai`), the
config file paths (global + project), and the merged current settings.

If `$ARGUMENTS` is `show`, stop here and just report that output to the user.

## Step 2 — Provider facts (use these in the questions)

| Task | Provider options (only offer those with a key present) |
|------|--------------------------------------------------------|
| image | **openai** `gpt-image-2` (best text/realism) · **gemini** Nano Banana Pro (styles, refs, transparency) · **xai** Grok Imagine (fast) |
| video | **xai** Grok Imagine Video 1.5 (newest i2v) · **gemini** Veo 3.1 (audio, 4K, refs) |
| edit | **gemini** Nano Banana Pro (conversational, transparency) · **openai** `gpt-image-2` (masked inpaint/compose) |

Keys: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`. A missing key means that
provider can't be a default — mention how to get it (aistudio.google.com,
platform.openai.com, console.x.ai) but don't block setup.

## Step 3 — Ask the user (AskUserQuestion)

For each task where **two or more** providers have keys, ask which should be the
default. Offer only key-present providers, plus an "Auto-pick (recommended)"
option that defers to gemskills' built-in ranking. Phrase options with the
strength of each provider. Skip a task entirely if only one provider has a key
(there's nothing to choose) — or if no keys at all, tell the user to set at least
`GEMINI_API_KEY` and stop.

Also ask whether to save **globally** (all projects) or **project-only**
(`.gemskills.json` in this repo). Default to global.

## Step 4 — Persist

For each chosen task/provider (skip ones left on "Auto-pick"):

```bash
# global (default)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/providers/config.ts set <task> <provider>
# project-only — adds --project
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/providers/config.ts set <task> <provider> --project
```

## Step 5 — Confirm

Re-run `config show` and summarize the final defaults in a short table. Remind
the user they can always override per-call with `--provider <name>`, and that
"Auto-pick" tasks will choose the best available provider that supports each
request (e.g. style tiles/transparency force Gemini).

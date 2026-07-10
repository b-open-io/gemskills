---
name: codex-agent-setup
description: >-
  Explicit-only installer for the Gemskills Lisa Codex custom agent. Use ONLY
  when the user explicitly asks to install, update, check, uninstall, or set up
  the Gemskills or Lisa Codex agent, including "install Lisa in Codex", "update
  the Gemskills Codex agent", or "check gemskills_content". Never auto-invoke
  for ordinary image, video, design, or media-generation requests.
disable-model-invocation: false
user-invocable: true
metadata:
  author: b-open-io
  version: "1.0.0"
  codex:
    disable-model-invocation: true
    explicit_invocation_only: true
    never_modify_global_config: true
---

# Gemskills Codex Agent Setup

Install Lisa's generated Codex adapter as a regular file. Run this skill only
after an explicit request to install, update, check, or uninstall Lisa.

## Safety contract

- Default to the current project's `.codex/agents/` directory.
- Use `--user` only when the user explicitly requests a user-wide install.
- Never edit `~/.codex/config.toml` or any global Codex configuration.
- Never create plugin-cache symlinks or delete unrelated custom agents.
- Run `--check` when the user asks what would change.

## Commands

```bash
bash "${SKILL_DIR}/scripts/setup.sh" [--check|--uninstall|--force]
bash "${SKILL_DIR}/scripts/setup.sh" --user [--check|--uninstall|--force]
bash "${SKILL_DIR}/scripts/setup.sh" --target /custom/agents/directory
```

The installer manages only `gemskills-content.toml` and records ownership in
`.gemskills-agents.json`. An unmanaged collision is refused unless the user
explicitly authorizes `--force`.

After a successful install or update, tell the user to start a **new Codex
session**, then invoke Lisa using the runtime name `gemskills_content`.

## Maintainer generation

```bash
bash "${SKILL_DIR}/scripts/generate.sh"
bash "${SKILL_DIR}/scripts/generate.sh" --check
```

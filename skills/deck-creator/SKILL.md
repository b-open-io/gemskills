---
name: deck-creator
version: 1.3.0
description: This skill should be used when the user asks to "create a deck", "make a presentation", "build slides", "pitch deck", "investor deck", "sales presentation", "design a deck", "interactive presentation", "presenter mode", "HTML slides", "video background deck", "deck playground", "visual deck editor", "deck builder UI", "publish deck link", or needs to generate a complete deck with minimal friction. Handles low-question discovery, early Deck Creator UI launch, theme selection, copywriting, parallel slide generation, PDF stitching, optional HTML presenter, and publishing workflows.
---

# Deck Creator

Create professional presentation decks with consistent visual style, compelling copy, AI-generated slide images, and optional interactive HTML presenter with video backgrounds.

## When to Use

- Create a presentation or slide deck
- Build a pitch deck, proposal, or sales presentation
- Design slides for a product launch, company overview, or partnership
- Generate a complete deck from a document, requirements, or brief
- Restyle an existing deck with a different art style
- Build an interactive HTML presenter for live presentations
- Add ambient video backgrounds to a deck
- Use the "deck playground", "visual deck editor", or "deck builder UI"

## Interactive Playground

For a visual UI to design and generate decks interactively:

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/deck-creator/scripts/playground_server.ts --dir <deck-dir>
```

The playground provides style browsing, per-slide editing, live preview, and one-click generation. Supports both Gemini PNG and text-layered HTML modes.

**IMPORTANT:** Invoke this skill via the Skill tool (`Skill("deck-creator")`). Do not manually execute phases without loading this skill first. Follow the workflow step by step; do not skip phases.

## Fast-Path Defaults (Minimize Friction)

Prefer speed over exhaustive questioning. Ask only what is necessary, infer the rest, and get the user into the UI quickly.

Ask one compact question set first:

1. Goal/topic of the deck
2. Audience
3. Approx slide count
4. Output mode (`pdf`, `html+pdf`, or `web/publish`)

Infer defaults when missing:

- Slide count: `10`
- Mode: `html+pdf` for live/web use, otherwise `pdf`
- Theme: modern high-contrast business style
- Video background: `none`
- Art style: none unless requested

After creating `THEME.md` + `DECK-PLAN.md`, launch the playground immediately with the target deck dir preloaded:

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/deck-creator/scripts/playground_server.ts --dir <deck-dir>
```

Then ask exactly one fork-in-the-road question:

- **Option A (recommended):** "Generate slides in parallel now while you watch in Deck Creator?"
- **Option B:** "Open Deck Creator first and wait before generating?"

Do not auto-generate slides without explicit user confirmation (cost-sensitive), but offer a one-click quick start to generate slide 1 first.

## Process Overview

Six phases, executed in order:

1. **Discovery** - Gather context, examples, and references
2. **Launch** - Bootstrap files and open Deck Creator UI with the deck preloaded
3. **Theme** - Establish visual style, color palette, and optional art style
4. **Copy** - Plan and write slide content using marketing principles
5. **Generation** - Create all slides in parallel with consistent style + stitch PDF
6. **Present/Publish** - Build interactive HTML presenter and publish/share link (optional)

## Phase 1: Discovery

Gather only the minimum information needed before opening the UI.

Ask in tiers:

**Tier 1 (Always):** Audience, Purpose, Content sources/materials, Slide count (recommend 10-16)

**Tier 2 (Context):** Presentation setting, Brand guidelines, Style references, Existing assets

**Tier 3 (If live/conference/webinar):** PDF only or HTML presenter too? Video backgrounds? Browse styles visually or auto-suggest?

If example decks or references are provided, analyze visual style, layout patterns, typography, and messaging patterns.

## Phase 2: Launch (Default Early Step)

1. Create or confirm `<deck-dir>`
2. Bootstrap `THEME.md` and `DECK-PLAN.md` with best-guess defaults
3. Launch Deck Creator with `--dir <deck-dir>` so the user lands in the deck immediately
4. Ask the Option A/Option B generation fork question

This is the normal flow. Do not delay UI launch until every detail is finalized.

## Phase 3: Theme Selection

Establish a consistent visual system before generating slides.

**Option A: Theme Factory** (recommended) - Install and invoke theme-factory skill for a cohesive palette.

**Option B: Manual** - Define Background, Primary, Secondary, Text, and Accent colors from brand guidelines.

### Style Parameters

```yaml
Aspect Ratio: 16:9 (--size 2K produces 1376x768)
Art Style: (optional) Any style ID from browsing-styles skill (e.g., pixl, cybr, deco)
Typography: Headlines Bold 48-64px, Body 18-24px, Stats Extra Bold 72-96px
Layout: Card-based with generous whitespace
```

Apply a consistent art style across all slides using `--style <id>`. Browse 169 styles with the `browsing-styles` skill. When a style is specified, add `--style <id>` to every generation command.

If the user wants an HTML presenter, add a Presenter Settings block to THEME.md:

```yaml
## Presenter Settings
Format: html+pdf
Video Background: none | url(<url>) | veo-global | veo-per-slide
Transition: 500ms
Auto-Advance: false
```

Document the complete theme in THEME.md.

## Phase 4: Copy & Content Planning

Apply copywriting principles: one message per slide, headlines tell the story, show don't tell, problem-solution-proof structure, concrete over abstract, end with action.

Create a DECK-PLAN.md with deck overview and per-slide plan (headline, content points, visual concept, key message). Continue gathering content until 10-16 slides are fully planned. Do not proceed to generation until the content plan is complete.

Consult `references/copywriting.md` for headline formulas, persuasion patterns, and audience-specific framing. Consult `references/slide-types.md` for detailed templates per slide type.

## Phase 5: Slide Generation

### Pre-Generation Checklist

- [ ] Theme defined (colors, typography, style)
- [ ] All slides planned (10-16 slides)
- [ ] Each slide has: headline, content, visual concept
- [ ] Output directory created

### Generate Slides

Launch all slide generation agents simultaneously. Spawn one `gemskills:content-specialist` agent per slide via the Task tool. Include theme spec, slide prompt, output path, and the generate-image command:

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "prompt" --aspect 16:9 --size 2K [--style <id>] --output <path>
```

Limit to 12 parallel generations. For 14+ slides, generate in two batches.

### Post-Generation

Verify all slides exist, stitch into PDF, verify PDF, create DECK-INDEX.md, provide summary. Consult `references/generation.md` for detailed prompt templates, PDF stitching methods, and post-generation steps.

Do not read generated slide images back into context. Ask the user to visually inspect.

## Phase 6: Present/Publish (Optional)

If the user requested an HTML presenter (or THEME.md specifies `Format: html+pdf`):

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/deck-creator/scripts/build_presenter.ts --dir <deck-dir> [--open]
```

For video backgrounds, either pass `--video <url>` with a user-provided URL, or generate an ambient loop via Veo 3.1 first. Consult `references/presenter.md` for full CLI options, video modes, keyboard shortcuts, and verification checklist.

If the user asked for web/share/publish, guide them to `Deck > Publish & Share...` in the playground and complete one publish route (Vercel, Zip, or Cloudflare Tunnel). Treat "publish link delivered" as the finish line for web mode.

## Output Structure

```
project/deck/
├── THEME.md              # Visual style definition
├── DECK-PLAN.md          # Content planning document
├── DECK-INDEX.md         # Final deck inventory
├── deck.pdf              # Stitched presentation PDF
├── presenter.html        # Interactive HTML presenter (optional)
├── ambient.mp4           # AI-generated video background (optional)
├── PRESENTER-CONFIG.json # Per-slide video config (optional)
└── slides/
    ├── 01-title.png
    └── ...
```

## Best Practices

1. **Uniform Style** - Every slide uses the same theme parameters
2. **Consistent Terminology** - Same words for concepts throughout
3. **Visual Hierarchy** - Headlines largest, supporting text smaller
4. **Generous Whitespace** - Avoid overcrowding slides
5. **Center-Weight Important Elements** - Account for cropping
6. **High Contrast** - Ensure readability on projectors
7. **No Orphan Slides** - Every slide connects to the narrative

## Reference Files

- **`references/slide-types.md`** - Expanded templates for each slide type
- **`references/copywriting.md`** - Marketing copy principles and headline formulas
- **`references/generation.md`** - Prompt templates, parallel generation, PDF stitching
- **`references/presenter.md`** - HTML presenter build, video modes, keyboard shortcuts
- **`assets/videos/`** - Bundled ambient video backgrounds (seeded to ~/.gemskills on first use)

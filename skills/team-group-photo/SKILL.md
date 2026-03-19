---
name: team-group-photo
description: This skill should be used when the user asks to "create team photo", "generate group portrait", "make team banner", "team image in any style", "group shot with multiple people", or needs a composite image featuring multiple team members arranged together in any art style.
---

# Team Group Photo

Generate team group portraits by first creating individual styled portraits, then compositing them into a group scene. Supports any art style from the 169 style library.

## Workflow Overview

1. **Gather inputs** from the user (original headshots, names, background preferences)
2. **Pick style for individual portraits** via style picker
3. **Generate individual styled portraits** for each team member
4. **Pick style for group composite** (can be same or different)
5. **Generate group composite** using individual portraits as inputs
6. **Optimize all outputs** for web (original + optimized copies)

**Do not skip steps.** Prompt the user for anything not provided.

## Step 1: Gather Inputs

Ask the user for the following. Do not proceed until all required inputs are collected:

- **Team member names** (required) - Who is in the photo, left-to-right order
- **Original headshot photos** (required) - Path to each person's unmodified photo
- **Background preference** (required) - Ask: "Do you have a background image, or should I describe one in the prompt?"
- **Output directory** (required) - Where to save results

If the user hasn't provided headshots, ask for them. Do not use previously styled/generated images as source material - always start from original photos.

## Step 2: Style Selection for Individual Portraits

Launch the interactive style picker so the user can choose a style for individual portraits:

```bash
STYLE_JSON=$(bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts --pick --port=3456)
```

The picker opens a browser. The user clicks a style and `STYLE_JSON` receives:

```json
{
  "id": "sci-fi-pulp",
  "shortName": "sfpl",
  "name": "Sci-Fi Pulp",
  "promptHints": "retro science fiction, chrome spaceships..."
}
```

If the user already specified a style (e.g. "make it in pixel art"), skip the picker and use `--style <id>` directly.

## Step 3: Generate Individual Styled Portraits

For each team member, generate an individual portrait using the selected style. Use the generate-image script with each person's **original headshot** as input:

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts \
  "[Style name] portrait of [Name]. Transfer exact likeness from the reference photo. [Style-specific details]. No text. No border." \
  --style <style-id> \
  --input /path/to/original-headshot.png \
  --size 1K \
  --output /path/to/output/name-styled.png
```

Repeat for each team member. Show each result to the user for approval before continuing.

## Step 4: Style Selection for Group Composite

Ask the user: "Use the same style for the group photo, or pick a different one?"

- **Same style**: Reuse the style from Step 2
- **Different style**: Launch the style picker again

## Step 5: Generate Group Composite

Use all individual styled portraits as inputs along with the background:

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts \
  "[Style name] team group portrait. Arrange left to right: [Name1], [Name2], [etc]. Transfer exact likeness from each input reference. [Background instruction]. Uniform [style] style. No text. No border." \
  --style <style-id> \
  --input /path/to/name1-styled.png \
  --input /path/to/name2-styled.png \
  --input /path/to/name3-styled.png \
  --input /path/to/background.png \
  --aspect 16:9 --size 2K \
  --output /path/to/output/team-group.png
```

If the user provided a background image, include it as `--input` and say "Use the background image exactly" in the prompt. If no background image, describe the scene in the prompt instead.

## Step 6: Optimize for Web

Run the optimize-images script on all generated outputs. Save both original and optimized copies:

```bash
IMAGES_DIR=/path/to/output bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/optimize-images/scripts/optimize-images.ts
```

Report file sizes before and after optimization.

## Context Discipline

**Do not read generated images back into context.** Scripts output only file paths. Ask the user to visually inspect individual portraits and group composites before proceeding to the next step. To inspect programmatically, optimize images first (via Step 6). Reading multiple uncompressed portrait and group images will quickly exhaust the context window.

## Key Insight: Transfer, Don't Describe

**DO NOT describe faces in the prompt.** The more facial features are described, the more the model GENERATES new faces instead of TRANSFERRING likeness from input images.

- Provide reference images as `--input` flags
- Use simple "Transfer exact likeness from the reference photo" language
- Let the input images speak for themselves

## What NOT to Do

**BAD - Describing faces:**
```
1. **KURT** - Bald head, brown beard, navy suit, friendly smile
2. **LUKE** - Dark curly hair, beard, pink shirt
```

**GOOD - Simple transfer instruction:**
```
"Transfer exact likeness from each input reference"
```

## Light vs Dark Variants

For theme-aware websites, generate both variants by running Step 5 twice:

1. **Light mode**: Bright/day background image as input
2. **Dark mode**: Dark/night background image as input

Same individual portraits, different background input.

## Options Reference

- `--style <id>` - Art style from the style library (pixel-art, simpsons, studio-ghibli, etc.)
- `--input <path>` - Reference image (up to 14 total)
- `--aspect <ratio>` - 1:1, 16:9, 9:16, 4:3, 3:4, 21:9
- `--size <1K|2K|4K>` - Image resolution
- `--output <path>` - Output file path

## Troubleshooting

### Faces don't match references
- Remove ALL facial descriptions from the prompt
- Ensure each reference image is included as `--input`
- Use simpler prompt focused on "transfer" language

### Style inconsistent across characters
- Generate individual portraits first (Step 3) to lock in style per person
- Add "Uniform [style name] style" to group prompt
- Generate at 2K for better detail consistency

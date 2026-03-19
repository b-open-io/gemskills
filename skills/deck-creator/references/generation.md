# Slide Generation Reference

Detailed instructions for Phase 4: parallel slide generation, PDF stitching, and post-generation steps.

## Generation Prompt Template

Each slide prompt should follow this structure:

```
Create a professional presentation slide.

**Slide [N]: [Title]**

Specifications:
- Aspect: 16:9 at --size 2K (1376x768)
- Background: [background color]
- Visual style: [defined style - flat, modern, infographic, etc.]
- Art style: [if using --style flag, e.g., "pixel art" for pixl]

Visual elements:
[Describe the visual layout, icons, diagrams, charts]

Text to include:
- Title: "[Headline]" ([primary color], bold)
- [Content elements with positioning]
- Footer: "[Company/Contact]" (small, bottom)

Save to: [output path]/[NN]-[slug].png
```

## Parallel Generation

Launch all slide generation agents simultaneously for efficiency.

Spawn one `gemskills:content-specialist` agent per slide using the Task tool. Include in each agent's prompt:
- The complete theme specification (colors, typography, style)
- The slide-specific prompt with layout, text content, and visual elements
- The output path (e.g., `slides/01-title.png`)
- The generate-image command: `bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "prompt" --aspect 16:9 --size 2K [--style <id>] --output <path>`

If an art style was defined in the theme, include `--style <id>` in every generation command.

Launch all agents in a single message for maximum parallelism. Wall-clock time equals the slowest single generation (~30-45 seconds), not N x sequential.

**Rate limiting:** Gemini API may timeout if too many requests fire simultaneously. Limit to 12 parallel generations. For 14+ slide decks, generate in two batches.

If subagents are unavailable, generate slides directly via background Bash commands.

## PDF Stitching

Every deck MUST end with a stitched PDF. Try these methods in order:

### Method A: ImageMagick (preferred)

```bash
magick slides/*.png deck.pdf
```

If `magick` is not found:
```bash
brew install imagemagick && magick slides/*.png deck.pdf
```

### Method B: sips + Python (macOS fallback)

```bash
# Convert each PNG to PDF page
for f in slides/*.png; do sips -s format pdf "$f" --out "${f%.png}.pdf"; done
# Combine with Python
python3 -c "
from PyPDF2 import PdfMerger
import glob
merger = PdfMerger()
for f in sorted(glob.glob('slides/*.pdf')):
    merger.append(f)
merger.write('deck.pdf')
merger.close()
"
```

If PyPDF2 is not installed: `pip3 install PyPDF2`

### Method C: sips only (last resort)

```bash
for f in slides/*.png; do sips -s format pdf "$f" --out "${f%.png}.pdf"; done
```

Note in the summary that individual PDFs were created instead of a combined deck.

## Post-Generation Steps

### Step 1: Verify all slides exist

```bash
ls -la slides/*.png | wc -l  # Must match expected slide count
```

Re-generate any missing slides before proceeding.

### Step 2: Stitch into PDF

Use the methods above.

### Step 3: Verify PDF

```bash
ls -lh deck.pdf
sips -g pixelWidth -g pixelHeight deck.pdf
```

### Step 4: Create DECK-INDEX.md

Generate a DECK-INDEX.md containing:
- Deck metadata (title, slide count, audience, theme, resolution)
- Slide table (number, file, title, type)
- File tree including deck.pdf

### Step 5: Provide Summary

List all slides with file paths and confirm deck.pdf was created.

## Context Discipline

Do not read generated slide images back into context. Each slide is a large PNG. With 10-16 slides per deck, reading them back would immediately exhaust the context window. Scripts output only file paths. Ask the user to visually inspect slides and provide feedback.

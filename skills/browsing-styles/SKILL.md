---
name: browsing-styles
description: This skill should be used when the user asks to "browse art styles", "pick a style", "choose a style", "select a style", "list available styles", "search styles", "show style options", "what styles are available", "explore artistic styles", "open style browser", "style picker", or needs to see available styles for image generation. Launch the visual browser (browse.ts) when the user wants to interactively pick a style.
---

# Browsing Styles

Browse and preview 169 artistic styles for image generation. Each style includes prompt hints and a generated tile reference image.

## When to Use

- Browsing available art styles for image generation
- Searching for a specific style by name or category
- Helping users choose a style for their project
- Generating tile reference images for styles

## Style Categories

| Category | Description | Examples |
|----------|-------------|----------|
| traditional | Classical art styles | Impressionism, Surrealism, Art Deco |
| digital | Digital & modern aesthetics | Cyberpunk, Vaporwave, Pixel Art |
| illustration | Illustration styles | Anime, Comic Book, Concept Art |
| photography | Photography & film looks | Cinematic, Film Noir, Kodachrome |
| design | Design & UI trends | Brutalism, Glassmorphism, Bauhaus |
| retro | Retro & nostalgia | Y2K, Frutiger Aero, 90s Grunge |
| technique | Specific art techniques | Watercolor, Charcoal, Linocut |
| decorative | Pattern & decorative arts | Islamic Geometric, Mandala, Moroccan |
| creative | Creative & material-based | Made of Sand, Underwater, Origami |
| cultural | Pop culture & iconic styles | Simpsons, Spawn, Dragon Ball, Cowboy Bebop |

## Quick Reference (Popular Styles)

| Short | Name | Category |
|-------|------|----------|
| impr | Impressionism | traditional |
| surr | Surrealism | traditional |
| deco | Art Deco | traditional |
| cybr | Cyberpunk | digital |
| pixl | Pixel Art | digital |
| vapr | Vaporwave | digital |
| anim | Anime / Manga | illustration |
| ghbl | Studio Ghibli | illustration |
| brit | Romero Britto Pop | illustration |
| brut | Brutalism | design |
| nbrt | Neo-Brutalism | design |
| glas | Glassmorphism | design |
| riso | Risograph | design |
| y2k | Y2K | retro |
| frug | Frutiger Aero | retro |
| psyc | 70s Psychedelic | retro |
| wtrl | Watercolor Loose | technique |
| sumi | Ink Wash / Sumi-e | technique |
| sand | Made of Sand | creative |
| undr | Underwater | creative |

## Style Picker (Default)

Running the preview server opens a browser with the full tile grid. The user clicks a style, views details in a modal, clicks "Select This Style". The script prints the selected style as JSON to stdout and **exits automatically**. Pick mode is the default.

```bash
STYLE_JSON=$(bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts)
```

Parse `STYLE_JSON` for the `id` field and pass it as `--style <id>` to generate-image.

### Options

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts                          # Pick mode (default): opens browser, returns JSON, exits
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts --port=4200              # Custom port
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts --no-open                # Don't auto-open browser
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts --browse                 # Browse-only mode: long-running server, no selection returned
```

## Browse Mode

For standalone browsing without returning a selection, pass `--browse`:

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/preview_server.ts --browse
```

This runs a long-lived server at `localhost:3456`. Use Ctrl+C to stop.

### List Styles (CLI)

```bash
# List all styles
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/list_styles.ts

# Table format
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/list_styles.ts --table

# Filter by category
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/list_styles.ts --category design --table

# Search by name
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/list_styles.ts --search "watercolor"

# Show specific fields
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/list_styles.ts --fields id,shortName,name,category --table
```

### Generate Tile Reference Images

Generate 1:1 tile images that visually represent each style:

```bash
# Generate all missing tiles
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/generate_tiles.ts --skip-existing

# Generate for a specific category
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/generate_tiles.ts --category creative --skip-existing

# Generate a single style tile
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/generate_tiles.ts --style cyberpunk

# Preview what would be generated
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/generate_tiles.ts --dry-run

# Higher concurrency (default: 2)
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/generate_tiles.ts --concurrency 4 --skip-existing
```

Tiles are saved to `assets/tiles/<style-id>.png` (512x512 PNG).

## Integration with generate-image

Use styles with the generate-image skill:

```bash
# Using style ID
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "mountain landscape" --style impressionism

# Using short name
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "portrait" --style brit

# Style with other options
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-image/scripts/generate.ts "city street" --style cybr --size 4K --aspect 16:9
```

When a tile image exists for the style, it is automatically sent as a visual reference alongside the prompt hints.

## Style Registry

Styles are defined in `assets/styles.json`. Each style includes:

```json
{
  "id": "cyberpunk",
  "shortName": "cybr",
  "name": "Cyberpunk",
  "category": "digital",
  "promptHints": "neon lights reflecting on rain-soaked streets...",
  "tilePrompt": "A rain-soaked cyberpunk megacity alley..."
}
```

- **promptHints**: Comma-separated descriptors prepended to user prompts
- **tilePrompt**: Full prompt used to generate the style's reference tile image

## Adding Custom Styles

Edit `assets/styles.json`:

1. Choose a unique `id` (lowercase, hyphens)
2. Assign a short `shortName` (3-4 chars)
3. Write descriptive `promptHints`
4. Write a `tilePrompt` for generating the tile image
5. Run `bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/browsing-styles/scripts/generate_tiles.ts --style <id>` to generate the tile

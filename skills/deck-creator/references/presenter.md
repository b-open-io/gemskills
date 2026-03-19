# HTML Presenter Reference

Detailed instructions for Phase 5: building the interactive HTML presenter with optional video backgrounds.

## Build Script

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/deck-creator/scripts/build_presenter.ts --dir <deck-dir>
```

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--dir <path>` | Deck directory (required) | - |
| `--output <path>` | Output file path | `<dir>/presenter.html` |
| `--video <url>` | Global video background URL | none |
| `--video-type <type>` | `mp4` or `hls` | auto-detect |
| `--transition <ms>` | Slide transition duration | 500 |
| `--auto-advance <sec>` | Auto-advance interval | 0 (disabled) |
| `--accent <hex>` | Accent color override | from THEME.md Primary |
| `--bg <hex>` | Background color override | from THEME.md Background |
| `--title <string>` | Deck title override | from DECK-INDEX.md |
| `--open` | Open in browser after build | false |

### What the Build Script Does

1. Parses DECK-INDEX.md for slide titles and types
2. Falls back to filesystem discovery (`slides/` or `pages/` directories)
3. Parses THEME.md for Primary (accent) and Background colors
4. Reads optional PRESENTER-CONFIG.json for per-slide video URLs
5. Token-replaces the `assets/presenter.html` template
6. Writes the output HTML file (~19KB)

## Keyboard Navigation

| Key | Action |
|-----|--------|
| ArrowRight / ArrowDown / Space | Next slide |
| ArrowLeft / ArrowUp | Previous slide |
| F | Toggle fullscreen |
| Escape | Exit fullscreen |
| Home | First slide |
| End | Last slide |

Touch swipe and clickable progress dots are also supported.

## Controls

- Liquid glass bottom bar with backdrop-filter blur
- Auto-hides after 3 seconds of idle, reappears on mouse movement
- Contains: slide counter (left), progress dots (center), nav buttons + fullscreen (right)
- Progress dots: 6px circles, active slide expands to 24px pill

## Video Backgrounds

Three modes for video backgrounds:

### Mode 1: User-Provided URL

Pass a video URL directly:
```bash
bun run scripts/build_presenter.ts --dir <deck-dir> --video "https://example.com/bg.mp4"
```

### Mode 2: AI-Generated via Veo 3.1

Generate an ambient loop as a background task:
```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/generate-video/scripts/generate.ts \
  "Abstract ambient loop, <theme-described-visuals>, slow movement, seamless loop" \
  --aspect 16:9 --duration 8 --output <deck-dir>/ambient.mp4
```

Then rebuild with the generated video:
```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/deck-creator/scripts/build_presenter.ts \
  --dir <deck-dir> --video ambient.mp4
```

### Mode 3: Per-Slide Videos

Create a `PRESENTER-CONFIG.json` in the deck directory:

```json
{
  "slides": {
    "01-title.png": { "videoUrl": "https://stream.mux.com/xxx.m3u8" },
    "05-solution.png": { "videoUrl": "./ambient-solution.mp4" }
  },
  "overlay": 0.3,
  "transition": 500
}
```

The build script merges per-slide video URLs into the slide data automatically.

## Video Format Support

- **MP4**: Native `<video>` element, works everywhere
- **HLS (.m3u8)**: Loads hls.js from CDN; Safari uses native HLS. HLS loading is attempted only when needed, with graceful fallback.

## Stacking Order

1. `<video>` - fixed, z-0, autoplay muted loop playsinline, object-fit: cover
2. `.overlay` - z-1, rgba(0,0,0,0.3) dimming (adjustable via overlay opacity)
3. `.slide img` - z-2, centered, object-fit: contain
4. `.controls` - z-3, glass bar

## Offline Behavior

- Slides referenced via relative paths (`slides/01-title.png`)
- No external dependencies for basic operation (no video)
- hls.js loaded with try-catch; falls back to native video
- Template stays under 25KB

## THEME.md Presenter Block

To signal that a deck should include an HTML presenter, add to THEME.md:

```yaml
## Presenter Settings
Format: html+pdf
Video Background: none | url(<url>) | veo-global | veo-per-slide
Transition: 500ms
Auto-Advance: false
```

## Verification Checklist

After building the presenter:

- [ ] `presenter.html` exists alongside `deck.pdf`
- [ ] Opens correctly from `file://` (no server needed)
- [ ] All slide images display
- [ ] Keyboard navigation works (arrows, space, F, Escape, Home, End)
- [ ] Controls auto-hide after 3s, reappear on mouse movement
- [ ] Progress dots expand for current slide and are clickable
- [ ] Slide counter shows correct "N / Total"
- [ ] Video background plays (if configured)

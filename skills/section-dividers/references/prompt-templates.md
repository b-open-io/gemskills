# Prompt Templates for Section Dividers

Complete prompt templates for generating dividers with dual color matching.

## Template: Dual Color Matching Cross-Section

This template ensures:
1. Background matches the PARALLAX (eliminates edge artifacts)
2. Silhouette matches the ADJACENT SECTION (visual blending)
3. TRUE cross-section (surface UP, underground DOWN - not reflection)

```bash
cd /path/to/gemskills/skills/generate-image
bun run scripts/generate.ts "ONE THIN horizontal divider strip floating in solid [PARALLAX_COLOR]. MICRO-SCALE cross-section diorama: TOP EDGE has [SURFACE_CONTENT] pointing UPWARD. BOTTOM EDGE has [UNDERGROUND_CONTENT] pointing DOWNWARD. The silhouettes are [SECTION_COLOR]. JAGGED organic edges on BOTH top AND bottom. Strip is 12-15% of image height in vertical center. 85% background above and below. Hand-drawn ink illustration style, shadow puppet silhouettes." --aspect 21:9 --size 2K --negative "flat edges, reflection, mirror, white, full scene, pink, magenta, gradient, soft edges" --output divider-raw.png
```

### Placeholder Reference

| Placeholder | Description | How to Get Value |
|-------------|-------------|------------------|
| `[PARALLAX_COLOR]` | Background color of parallax image | Run `analyze-bg.ts` on parallax image |
| `[SECTION_COLOR]` | CSS color of adjacent section | Check theme/CSS (e.g., `#042f2e`) |
| `[SURFACE_CONTENT]` | What appears on TOP edge pointing UP | Design decision (houses, trees, rooftops) |
| `[UNDERGROUND_CONTENT]` | What appears on BOTTOM edge pointing DOWN | Design decision (sewers, caves, pipes) |

## Template: Crystal/Geode Style

For decorative crystal borders (use magenta for easy removal):

```bash
bun run scripts/generate.ts "ONE single THIN horizontal [MATERIAL] divider strip floating in MAGENTA (#FF00FF). THIN HEIGHT - a delicate decorative horizontal line, not a thick bar. The [MATERIAL] strip has JAGGED IRREGULAR organic edges on BOTH the top AND bottom - no flat edges anywhere. Full width from left edge to right edge. [COLOR_DESCRIPTION], photorealistic [MATERIAL] texture. The entire background is solid bright magenta. This is ONE divider strip, like a fancy horizontal rule made of [MATERIAL]." --aspect 21:9 --size 2K --output divider-raw.png
```

| Placeholder | Options |
|-------------|---------|
| `[MATERIAL]` | crystal, geode, gemstone, obsidian, quartz |
| `[COLOR_DESCRIPTION]` | "teal/cyan crystals", "dark obsidian with blue highlights", "emerald green gems" |

## Template: Black Silhouette (For Colorizing)

Generate black on white, then colorize to match theme:

```bash
bun run scripts/generate.ts "A product photography shot on PURE WHITE (#FFFFFF) backdrop. A THIN horizontal strip spanning FULL WIDTH, only 10% of image height, in VERTICAL CENTER. MICRO-SCALE terrain cross-section: TOP surface has [SURFACE_CONTENT] pointing UPWARD. BOTTOM surface has [UNDERGROUND_CONTENT] pointing DOWNWARD. Like a micro diorama. COMPLETELY SOLID BLACK shapes - shadow puppet style with no internal details. 90% white above and below." --aspect 21:9 --size 2K --negative "outlines, line art, hollow, details inside shapes, gray, gradient, touching edges" --output silhouette-raw.png
```

Then colorize:
```bash
cd /path/to/gemskills/skills/section-dividers
bun run scripts/colorize.ts silhouette-raw.png silhouette-final.png "[SECTION_COLOR]"
```

---

## Post-Generation Processing

After generating, remove the background:

```bash
cd /path/to/gemskills/skills/section-dividers
bun run scripts/remove-bg.ts [raw-image].png [final-image].png
```

If color fringing occurs, use color-based removal with the parallax color:

```bash
bun run scripts/remove-background.ts [raw-image].png [final-image].png "[PARALLAX_COLOR]"
```

---

## EXAMPLES: TokenPass Project

> **Note:** These are working examples with hardcoded colors specific to the TokenPass project. Use the templates above with your own colors determined by `analyze-bg.ts` and your theme CSS.

### Example 1: suburban-surface.png

**Location:** diagonal-indigo-blue parallax -> How It Works section
- Parallax color: `#1f285d` (dark indigo) - from `analyze-bg.ts`
- Section color: `#042f2e` (dark teal-black) - from theme CSS

```bash
cd /Users/satchmo/code/gemskills/skills/generate-image
bun run scripts/generate.ts "ONE THIN horizontal divider strip floating in solid dark indigo (#1f285d). MICRO-SCALE geological cross-section diorama: TOP EDGE has TINY 1980s suburban neighborhood - miniature ranch houses with pitched roofs, small trees, tiny picket fences, microscopic mailboxes pointing UPWARD toward the sky. BOTTOM EDGE has TINY underground sewer system - miniature tunnel archways, small pipes, tiny valve wheels, microscopic rats pointing DOWNWARD into the earth. The silhouettes are dark teal-black (#042f2e). JAGGED organic edges on BOTH top AND bottom - no flat edges anywhere. Strip is 12-15% of image height floating in vertical center. 85% solid dark indigo background above and below. Hand-drawn ink illustration style, shadow puppet silhouettes." --aspect 21:9 --size 2K --negative "flat edges, reflection, mirror, white, full scene, pink, magenta, gradient, soft edges" --output suburban-surface-raw.png
```

### Example 2: sewer-ceiling.png

**Location:** blob-emerald-teal parallax -> API Preview section
- Parallax color: `#0d4447` (dark teal) - from `analyze-bg.ts`
- Section color: `#042f2e` (dark teal-black) - from theme CSS

```bash
cd /Users/satchmo/code/gemskills/skills/generate-image
bun run scripts/generate.ts "ONE THIN horizontal divider strip floating in solid dark teal (#0d4447). MICRO-SCALE geological cross-section diorama: TOP EDGE has TINY underground ceiling view - miniature stalactites, small dripping water, tiny roots from above pointing UPWARD. BOTTOM EDGE has TINY deeper cavern - miniature rock formations, small crystal clusters, tiny underground pools pointing DOWNWARD into deeper earth. The silhouettes are dark teal-black (#042f2e). JAGGED organic edges on BOTH top AND bottom - no flat edges anywhere. Strip is 12-15% of image height floating in vertical center. 85% solid dark teal background above and below. Hand-drawn ink illustration style, shadow puppet silhouettes." --aspect 21:9 --size 2K --negative "flat edges, reflection, mirror, white, full scene, pink, magenta, gradient, soft edges" --output sewer-ceiling-raw.png
```

### Example 3: cyberpunk-city.png

**Location:** wave-teal-indigo-new parallax -> Footer
- Parallax color: `#1a222f` (dark gray-blue) - from `analyze-bg.ts`
- Section color: `#042f2e` (dark teal-black) - from theme CSS

```bash
cd /Users/satchmo/code/gemskills/skills/generate-image
bun run scripts/generate.ts "ONE THIN horizontal divider strip floating in solid dark gray-blue (#1a222f). MICRO-SCALE geological cross-section diorama: TOP EDGE has TINY futuristic cyberpunk cityscape - miniature skyscrapers, small antenna towers, tiny satellite dishes pointing UPWARD toward the sky. BOTTOM EDGE has TINY subway tunnel system - miniature hanging cables, small industrial pipes, tiny train tracks pointing DOWNWARD into underground. The silhouettes are dark teal-black (#042f2e). JAGGED organic edges on BOTH top AND bottom - no flat edges anywhere. Strip is 12-15% of image height floating in vertical center. 85% solid dark gray-blue background above and below. Hand-drawn ink illustration style, shadow puppet silhouettes." --aspect 21:9 --size 2K --negative "flat edges, reflection, mirror, white, full scene, pink, magenta, gradient, soft edges, neon, glow" --output cyberpunk-city-raw.png
```

---

## Verification Checklist

After generating each border:

1. **Cross-section check**: TOP content points UP, BOTTOM content points DOWN (not mirror)
2. **Color check**: Background matches parallax, silhouette matches section
3. **Edge check**: Jagged organic edges on BOTH top and bottom (no flat edges)
4. **Thickness check**: Thin strip (12-15%), not a full scene
5. **Artifact check**: No halos or fringing after background removal
6. **On-page check**: Blends seamlessly with parallax and sections

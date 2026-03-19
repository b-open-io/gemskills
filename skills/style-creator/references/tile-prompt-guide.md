# Style Tile Prompt Guide

Expert guidance for writing prompts that generate effective style reference tiles. These tiles are sent alongside user prompts as visual references to improve style adherence during image generation.

## Core Principle: Texture vs Object

The fundamental difference between a great style tile and a mediocre one is **subject matter independence**.

**Mediocre prompts** describe a scene *in* that style ("A cyberpunk city street"). When this tile is used to style a user's prompt of a "cyberpunk dog," the downstream model gets confused — it tries to blend "city street" with "dog."

**Great prompts** describe the **materiality, medium, and technique** of the style ("Neon light refractions, rain-slicked chrome texture, heavy film grain, cyan and magenta gradients"). This transfers the *physics* and *color* of the style without semantic baggage.

A great style tile looks like a swatch, a seamless pattern, or a macro shot of the art itself.

## Prompt Structure

Every tile prompt should follow this modular structure:

### 1. Full-Bleed Anchor
Commands the model to fill the frame, not create a framed piece.
- Keywords: `Full-bleed`, `filling the entire canvas`, `edge to edge`

### 2. Macro/Texture Anchor
Focuses on surface and texture, not scene.
- Keywords: `Seamless pattern`, `macro close-up`, `texture study`, `abstract composition`

### 3. Style Descriptors
Specific movements, artists, or time periods.
- Keywords: `Bauhaus`, `Ukiyo-e`, `Vaporwave`, `oil impasto`

### 4. Materiality/Medium
What the image appears to be "made" of.
- Keywords: `Cracked canvas`, `halftone dots`, `VHS static`, `watercolor bleed`, `vector lines`

### 5. Palette and Lighting
Transfers mood and color language.
- Keywords: `Chiaroscuro`, `pastel gradients`, `neon rim light`, `sepia tones`

### 6. Anti-Container Enforcers
Prevents frames, borders, and containers.
- Keywords: `No frame, no border, no canvas edge, no gallery wall, no table, no desk`

## Category-Specific Strategies

### Abstract Styles (Cubism, Abstract Expressionism)
Focus on geometry and brushwork.
- **Use**: "Chaotic geometric shards," "heavy palette knife strokes," "intersecting planes"
- **Avoid**: Naming specific objects (guitars, faces) common in these styles

### Figurative Styles (Anime, Comic Book, Renaissance)
Hardest category. Generate the *ink* and the *paper*, not a character.
- **Use**: "Collage of manga screentones," "close-up of ink hatching," "cracked oil paint texture on linen," "cross-hatching details"
- **Trick**: Keywords like `dense montage` or `extreme macro of brushwork` prevent a single coherent figure from forming

### Photography Aesthetics (Polaroid, Film Noir, Kodachrome)
Focus on camera artifacts and optical qualities.
- **Use**: "Film grain noise," "light leaks," "vignette," "motion blur texture," "bokeh field," "chromatic aberration"
- **Subject**: Use "abstract light play" or "blurred environment" as placeholder subject

### Design Movements (Art Deco, Memphis, Brutalism)
Focus on repetitive motifs and materials.
- **Use**: "Repeating geometric fan pattern," "terrazzo texture," "concrete surface," "gold leaf inlay"

### Regional Aesthetics (Miami, New York Luxury, Lauderdale)
Focus on color palette, texture, and design language — NOT a photo of the place.
- **Use**: "Art Deco geometric patterns in flamingo pink and turquoise," "polished marble textures with gold accents"
- **Avoid**: Buildings, streets, interiors, recognizable landmarks

## Example: Bad vs Good vs Excellent

### Art Nouveau

**BAD** (scene trap):
> "Art Nouveau style illustration of a woman in a garden with flowers. Beautiful, elegant, Alphonse Mucha style."

Fails because it transfers the *subject* (woman), not the style. Using this tile to generate a "spaceship" would blend a woman's face into the hull.

**GOOD** (pattern attempt):
> "Full-bleed Art Nouveau pattern filling the entire canvas. Flowers and vines in gold and sage green. Edge to edge, no frame, no border."

Better — removes the woman, focuses on botanical elements. But "pattern" can result in flat, digital-looking wallpaper lacking the painted feel.

**EXCELLENT** (materiality masterpiece):
> "Full-bleed extreme close-up macro texture of an Art Nouveau lithograph filling the entire canvas. Intertwining organic whiplash curves, gold leaf inlay details, intricate floral motifs, stained glass fragments and watercolor wash texture, muted olive ochre and gold palette, heavy artistic detail. Edge to edge, no frame, no border, no white background."

Works because "lithograph" and "stained glass" tell the model *how* to render lines. "Whiplash curves" is the defining geometric feature. Provides a dense map of color, line weight, and shading applicable to any subject.

## Negative Prompt Patterns

Use these with `--negative` when generating tiles:

```
frame, border, margin, white border, canvas edge, picture frame, wall, gallery, museum, furniture, table, interior room, watermark, signature, text, typography, centerpiece
```

Include "interior room" because asking for styles like "mural" causes the model to generate a photo of a room *with* a mural on the wall instead of the mural itself.

## Full-Bleed Failure Modes

| Failure | Cause | Fix |
|---------|-------|-----|
| Art on a canvas/easel | Model interprets style as "painting of" | Add "no canvas, no easel" to prompt |
| Art on a wall/gallery | Model frames it in a room | Add "no wall, no gallery, no museum" |
| Art on a desk/table | Model shows it as a physical object | Add "no desk, no table, no surface" |
| Art on a monitor/screen | Model shows it displayed | Add "no monitor, no screen, no device" |
| Embroidery in a hoop | Model shows the craft object | Add "no hoop, no frame" |
| Photo with black bars | Model adds letterboxing | Add "no letterbox, no black bars" |
| Cloth/fabric shown | Model shows material substrate | Add "no cloth edge, no fabric edge" |

# Gemini Image Generation Prompt Guide

Official prompting strategies from Google's Gemini documentation.

## Core Principle

**"Describe the scene, don't just list keywords."**

The model excels at processing narrative descriptions rather than disconnected terms. Comprehensive prompts are significantly more successful than keyword lists.

## Seven Effective Prompt Strategies

### 1. Photorealistic Scenes

Use photography terminology to guide realistic outputs. Reference camera angles, lens specifications, lighting conditions, and fine details.

**Key elements**: Shot type, subject, action/expression, environment, lighting description, mood, camera/lens details, textures, aspect ratio.

**Example approach**: Specify an "85mm portrait lens" for soft bokeh, "golden hour light" for warmth, and describe specific textures like "sun-etched wrinkles."

### 2. Stylized Illustrations & Stickers

Be explicit about artistic style and request specific visual treatments like transparent backgrounds or cel-shading.

**Key elements**: Style category, subject characteristics, line style, shading approach, color palette, background specifications.

**Example**: "kawaii-style sticker" with "bold, clean outlines" and "simple cel-shading."

### 3. Accurate Text in Images

Gemini excels at rendering readable text. Clearly specify the text content, font style (descriptively), and design aesthetic.

**Key elements**: Image type, brand/concept, exact text, font style description, design style, color scheme.

### 4. Product Mockups & Commercial Photography

Create professional product shots for ecommerce using studio lighting terminology.

**Key elements**: Studio-lit photography setup, surface/background, three-point lighting setup, camera angle, sharp focus areas, realism level, aspect ratio.

### 5. Minimalist & Negative Space Design

Perfect for backgrounds where text will overlay. Position a single subject with vast empty space.

**Key elements**: Singular subject, placement position, background color, negative space amount, lighting direction, aspect ratio.

### 6. Sequential Art (Comic/Storyboard)

Build on character consistency and scene description for visual storytelling.

**Key elements**: Panel count, artistic style, character placement, scene type, specific visual qualities.

### 7. Grounding with Google Search

Generate images based on current information using real-time data for news, weather, and time-sensitive topics.

**Key elements**: Current event or condition, visualization style, data presentation format, visual elements to include.

## Professional Best Practices

### Be Hyper-Specific

Instead of generic descriptors, provide detailed specifications.

**Bad**: "fantasy armor"
**Good**: "ornate elven plate armor, etched with silver leaf patterns, with a high collar and pauldrons shaped like falcon wings"

### Provide Context and Intent

Explain the image's purpose.

**Bad**: "create a logo"
**Good**: "Create a logo for a high-end, minimalist skincare brand"

### Iterate and Refine

Leverage the conversational model nature. Make incremental changes with follow-up prompts like "Keep everything the same, but change the expression to be more serious."

### Use Step-by-Step Instructions

For complex multi-element scenes, break requests into sequential steps: "First, create... Then add... Finally, place..."

### Employ Semantic Negative Prompts

Describe the desired outcome positively rather than stating what to exclude.

**Bad**: "no cars"
**Good**: "an empty, deserted street with no signs of traffic"

### Control the Camera

Use cinematic language to command composition: "wide-angle shot," "macro shot," "low-angle perspective"

## Prompt Rewriting Checklist

When rewriting a user's simple prompt, consider adding:

1. **Subject details**: What exactly is being shown? Be specific about appearance, clothing, expression
2. **Environment/Setting**: Where is this? Indoor/outdoor, time of day, weather, location type
3. **Lighting**: Natural/artificial, direction, quality (soft/harsh), color temperature
4. **Composition**: Camera angle, distance, framing, focal length
5. **Style/Aesthetic**: Photorealistic, illustration style, art movement, medium
6. **Mood/Atmosphere**: Emotional tone, energy level, color palette mood
7. **Technical specs**: Aspect ratio, level of detail, texture descriptions

## Example Prompt Transformations

### Simple to Effective

**User prompt**: "a cat"
**Rewritten**: "A fluffy orange tabby cat lounging on a sun-drenched windowsill, soft afternoon light creating a warm glow on its fur. The cat is in a relaxed pose with half-closed eyes, conveying contentment. Shot from a low angle with shallow depth of field, the background showing a blurred garden view through the window. Photorealistic, warm color palette."

**User prompt**: "banner for my app"
**Rewritten**: "A modern, full-bleed banner for a technology application. Dark gradient background transitioning from deep navy to black. Abstract geometric network visualization with glowing nodes connected by thin lines. Clean sans-serif typography positioned left of center. Professional, tech-forward aesthetic with no visible borders or edges - the design extends seamlessly to all edges."

**User prompt**: "mountain landscape"
**Rewritten**: "A majestic mountain landscape at golden hour, with snow-capped peaks catching the last warm rays of sunlight. Rolling clouds weave between the mountain ridges, creating depth and atmosphere. Foreground shows alpine meadow with wildflowers. Wide-angle shot emphasizing the vast scale. Dramatic but natural lighting with warm highlights and cool shadows. 16:9 aspect ratio."

## Image Editing Prompts

### Adding/Removing Elements
Describe changes while maintaining original style, lighting, and perspective details.

### Style Transfer
Provide photographic source and request recreation in specific artistic styles, preserving original composition.

### High-Fidelity Detail Preservation
Describe critical details (faces, logos) in great specificity alongside edit requests.

## Common Mistakes to Avoid

1. **Keyword lists**: "cat, cute, fluffy, orange" - Use descriptive sentences instead
2. **Vague requests**: "make it better" - Be specific about what to improve
3. **Conflicting instructions**: "photorealistic cartoon" - Choose a consistent style
4. **Missing context**: "logo" - For what? What industry? What feeling?
5. **Negative-only prompts**: "no blur, no artifacts" - Describe what you want, not what to avoid

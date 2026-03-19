# Veo 3.1 Prompt Guide

Condensed guide for writing effective Veo video generation prompts.

## Six Elements of a Video Prompt

### 1. Subject
The main focus of the scene. Be specific about appearance, position, and scale.

- "A golden retriever puppy with floppy ears"
- "A weathered lighthouse on a rocky cliff"
- "A woman in a flowing red dress"

### 2. Action / Motion
What moves, how fast, and in what direction. Veo excels with clear motion descriptions.

- "slowly turns its head to face the camera"
- "waves crash and recede in rhythmic cycles"
- "sparks spiral upward from a campfire"
- "traffic flows through rain-slicked streets"

Motion keywords: `slowly`, `rapidly`, `gently`, `explosively`, `drifting`, `swirling`, `pulsing`, `flowing`, `cascading`, `flickering`

### 3. Style / Aesthetic
Visual treatment and artistic direction.

- "cinematic film grain, desaturated color palette"
- "Studio Ghibli hand-painted animation style"
- "hyper-realistic 8K footage"
- "neon-lit cyberpunk aesthetic"

When using `--style`, the promptHints are prepended automatically. Layer additional style cues on top.

### 4. Camera Motion
How the virtual camera moves. Veo responds well to explicit camera direction.

- **Static**: "locked-off shot", "tripod shot"
- **Pan**: "camera slowly pans left to right"
- **Tilt**: "camera tilts up to reveal the sky"
- **Dolly**: "camera dollies forward through the corridor"
- **Orbit**: "camera orbits around the subject at eye level"
- **Crane**: "crane shot rising from ground level"
- **Tracking**: "camera tracks alongside the running figure"
- **Zoom**: "slow zoom into the subject's eyes"
- **Handheld**: "slight handheld camera movement"
- **Aerial/Drone**: "aerial drone shot sweeping over the landscape"

### 5. Composition
Framing, depth, and spatial arrangement.

- "close-up shot", "wide establishing shot", "medium shot"
- "shallow depth of field with bokeh background"
- "symmetrical composition centered on the subject"
- "foreground elements frame the distant subject"
- "rule of thirds with subject on the left"

### 6. Ambiance / Audio
Lighting mood and sound design. Veo 3.1 generates native audio, so audio cues in the prompt influence the soundtrack.

**Lighting:**
- "golden hour warm light", "blue hour twilight"
- "dramatic chiaroscuro lighting", "soft diffused overcast"
- "neon glow reflecting off wet surfaces"
- "flickering candlelight", "harsh midday sun"

**Audio cues:**
- "gentle piano melody in the background"
- "birds singing, leaves rustling in the wind"
- "deep bass rumble with industrial metal sounds"
- "rain pattering on a tin roof"
- "crowd murmuring, distant traffic"
- "complete silence with occasional water drips"

## Negative Prompts

Use `--negative` to specify what to avoid. Effective negative prompts:

- "blurry, low quality, distorted faces, text overlays"
- "shaky camera, rapid cuts, jarring transitions"
- "watermark, logo, border, letterbox"
- "unrealistic motion, morphing artifacts"

## Image-to-Video Tips

When using `--input` with a starting frame:

1. **Match aspect ratio** - The input image MUST match the video aspect ratio. A square image fed to 16:9 video produces black pillarboxing. Generate the starting frame at `--aspect 16:9` (or `9:16` for vertical) to match the target video.
2. **Describe the motion, not the image** - The image provides the visual; the prompt should describe what happens next
3. **Match the style** - If the starting frame has a specific art style, mention it so Veo maintains consistency
4. **Start subtle** - Small, natural movements work better than dramatic transformations
5. **Reference elements** - "The figure in the center slowly raises their hand" anchors motion to visible elements

**Good image-to-video prompts:**
- "The clouds drift slowly across the sky, light shifts from warm to cool"
- "The character blinks and turns their head slightly to the right"
- "Water begins to flow down the rocks, mist rises gently"

**Avoid:**
- "Transform this into a completely different scene" (too much change)
- "Add a person walking" (adding new major elements is unreliable)
- Prompts that contradict visible elements in the starting frame

## Prompt Length

- **Sweet spot**: 2-4 sentences covering subject, action, and 2-3 additional elements
- **Too short**: "A cat" (no motion, no style, no camera direction)
- **Too long**: Overly detailed prompts can confuse the model; prioritize clarity over exhaustiveness

## Complete Example

**Prompt**: "A majestic bald eagle soars through a misty mountain valley at dawn. The camera tracks alongside as the eagle banks right, sunlight catching its white head feathers. Cinematic shallow depth of field with fog-covered peaks in the background. Wind rushing sounds with distant eagle call."

**Negative**: "blurry, text, watermark, unrealistic wing movement"

This covers all six elements: subject (eagle), action (soars, banks), style (cinematic), camera (tracking), composition (shallow DOF), ambiance (dawn mist, wind sounds).

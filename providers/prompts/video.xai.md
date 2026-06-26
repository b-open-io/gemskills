---
provider: xai
task: video
models: [grok-imagine-video, grok-imagine-video-1.5]
version: 1
---

# Prompt guide — xAI Grok Imagine Video

Two models, two modes (verified live):
- **`grok-imagine-video` (v1)** — text-to-video. Prompt-only.
- **`grok-imagine-video-1.5`** — **image-to-video only** (text-to-video is
  rejected). The newest/highest-quality model; native audio; up to 1080p for i2v.

**Best quality path for "video from a prompt":** generate a strong start frame
first (Gemini Nano Banana Pro or Grok Imagine image), then animate it with
`grok-imagine-video-1.5`. The skill does this automatically unless `--oneshot`
is passed (which uses v1 text-to-video for speed/lower cost).

## Prompt style — describe MOTION, not just a scene
The start frame already defines the look. The video prompt should describe what
**changes over time**:
- **Camera move**: "slow push-in", "orbit left", "handheld drift".
- **Subject motion**: "the leaf spins and drifts down", "she turns to camera".
- **Ambient life**: wind, ripples, flicker, drifting particles, steam.
- **Audio cue** (1.5 has native audio): "soft wind, distant birdsong".

## Do
- Keep it to 1–2 sentences of concrete motion.
- One clear action beats several competing ones.
- For i2v, let the frame carry the style; don't re-describe the whole scene.

## Don't
- Don't request text-to-video on 1.5 (it errors) — that routing is automatic.
- Don't over-specify; Grok video drifts with long prompts.

## Flags
`--duration` (s), `--aspect` (t2v only), `--resolution 480p|720p|1080p`
(1080p = i2v only), `--image <frame>` for direct i2v, `--oneshot` for v1 t2v.

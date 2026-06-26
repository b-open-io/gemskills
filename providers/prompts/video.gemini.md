---
provider: gemini
task: video
model: veo-3.1-generate-preview
version: 1
---

# Prompt guide — Gemini Veo 3.1

Veo handles both text-to-video and image-to-video natively, with synchronized
audio, 720p/1080p/4K, and 4–8s clips. The detailed guidance lives in
`skills/generate-video/references/veo-prompt-guide.md` — **read that file**.

## Essentials
- Describe **subject + action + camera + ambient sound** in one coherent shot.
- Veo respects cinematic language: shot size, lens, camera move, lighting.
- For image-to-video, the `--input` frame anchors the look; describe the motion.
- Use `--style` to apply an art-style tile to an auto-generated starting frame.

Veo is the default for highest control over audio + resolution. For the newest
image-to-video motion model, compare against xAI `grok-imagine-video-1.5`.

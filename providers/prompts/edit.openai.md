---
provider: openai
task: edit
model: gpt-image-2
version: 1
---

# Prompt guide — OpenAI `gpt-image-2` (edit / inpaint / compose)

The edits endpoint takes up to **16 input images** and an optional **mask**
(transparent areas of the PNG mask = the region to change). Returns `b64_json`.

## Masked inpainting
- Describe **only what should appear in the masked region**, plus how it should
  blend ("matching the existing lighting and perspective").
- The mask's transparent pixels mark the edit area; opaque pixels are preserved.
- Keep the rest-of-image consistent by referencing it ("same wood grain").

## Multi-image compose (no mask)
- Pass multiple `--input` images and describe the composite explicitly:
  "place the subject from image 1 onto the background of image 2, matching the
  golden-hour light."

## Do
- State materials, lighting continuity, and perspective for seamless edits.
- Quote any text to render.

## Don't
- **No transparent output** on gpt-image-2 — for transparent results use Gemini.
- **No `input_fidelity` control** on gpt-image-2 (always high). If you need an
  explicit low/high fidelity knob, that's gpt-image-1/1.5.
- No negative parameter — phrase exclusions positively.

## Sizes
`1:1`→1024x1024, `16:9`→1536x1024, `9:16`→1024x1536; quality `low|medium|high`.

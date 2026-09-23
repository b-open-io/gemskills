---
provider: openai
task: edit
model: gpt-image-2.5-flare
version: 2
---

# Prompt guide — OpenAI Flare / Image 2.5 (edit / inpaint / compose)

Default model: `gpt-image-2.5-flare` (Flare). High-precision opt-in:
`gpt-image-2.5-sunburst` (Sunburst) via `--model sunburst` or
`OPENAI_IMAGE_MODEL`. Direct API ids only — never prefix `openai/`.

The edits endpoint takes up to **16 input images** and an optional **mask**
(transparent areas of the PNG mask = the region to change). Returns `b64_json`.

## Flare vs Sunburst
- **Flare** — default for most edits and composites.
- **Sunburst** — opt in when the edit needs tighter instruction following or
  precise type/layout.

## Masked inpainting
- Describe **only what should appear in the masked region**, plus how it should
  blend ("matching the existing lighting and perspective").
- The mask's transparent pixels mark the edit area; opaque pixels are preserved.
  **Mask transparency is not output alpha** — they are different channels.
- Keep the rest-of-image consistent by referencing it ("same wood grain").

## Multi-image compose / reference edits (no mask)
- Pass multiple `--input` images and describe the composite explicitly:
  "place the subject from image 1 onto the background of image 2, matching the
  golden-hour light."
- Name which image supplies identity, which supplies setting, and what must
  stay locked (face, logo, product proportions).
- Call out lighting continuity, camera angle, and materials so the model
  composites instead of restyling.

## Do
- State materials, lighting continuity, and perspective for seamless edits.
- Quote any text to render.
- Request a **transparent PNG** when you need output alpha, and pass
  `background=transparent` (CLI: `--transparent`).

## Don't
- Do not confuse **mask transparency** (edit region) with **output alpha**
  (transparent background). Request output transparency separately.
- **No `input_fidelity` control** on Image 2.5 (always high). If you need an
  explicit low/high fidelity knob, that's gpt-image-1/1.5.
- No negative parameter — phrase exclusions positively.

## Sizes
Same rules as generation: `--size 1K|2K|4K` + `--aspect W:H` (1:3 to 3:1), or an exact
`--size WxH` (edges divisible by 16, max edge 3840). Quality: `--quality low|medium|high|xhigh|max|auto`.

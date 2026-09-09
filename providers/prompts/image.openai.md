---
provider: openai
task: image
model: gpt-image-2.5-flare
version: 2
---

# Prompt guide — OpenAI Flare / Image 2.5 (text-to-image)

Default model: `gpt-image-2.5-flare` (Flare). High-precision opt-in:
`gpt-image-2.5-sunburst` (Sunburst) via `--model sunburst` or
`OPENAI_IMAGE_MODEL`. Pass the **direct API id** only — never prefix `openai/`.

Image 2.5 is reasoning-augmented: it reads dense, well-structured natural
language and renders text inside images far better than prior models. Tune
prompts differently than Gemini.

## Flare vs Sunburst
- **Flare** (`gpt-image-2.5-flare`) — default. Lisa/content go-to.
- **Sunburst** (`gpt-image-2.5-sunburst`) — high-precision opt-in for tighter
  layouts, fine type, and exact instruction following.

## Do
- **Write in clear prose, not keyword lists.** One or two tight paragraphs.
  State subject → setting → lighting → composition → mood, in that order.
- **Be explicit about any in-image text.** Quote it: `the sign reads "OPEN"`.
  Image 2.5 is strong at legible typography — use it.
- **Name the framing and lens feel** ("eye-level, 35mm, shallow depth of field").
- **State the output intent** ("product hero on seamless white", "editorial
  cover"). The model uses intent to resolve ambiguity.
- **Ask for transparency when you need alpha.** Request a transparent/alpha
  background for cut-outs and icons, and pass `background=transparent`
  (CLI: `--transparent`).

## Don't
- **No negative-prompt syntax.** Image 2.5 has no negative parameter. To
  exclude something, say it positively: instead of "no people", write "an empty
  plaza". (The skill auto-appends an `Avoid: …` clause when `--negative` is set,
  but prefer baking exclusions into the description.)
- **Don't over-stack styles.** One coherent aesthetic beats five adjectives.

## Themes that play to Image 2.5
- Lighting and material textures
- Complex multi-step instructions
- Detailed layouts and typography
- Transparent backgrounds
- Reference-image edits (via the edits endpoint)

## Size / quality mapping
- Aspect → size: `1:1`→1024x1024, `16:9`/`4:3`→1536x1024, `9:16`/`3:4`→1024x1536.
- `--size`: `1K`→quality `low` (fast drafts), `2K`→`medium`, `4K`→`high`.
  Iterate at low, finalize at high.

## Skeleton
> A [subject, specific appearance + materials], [doing what], in [setting +
> time/weather]. [Lighting: direction, quality, color temp]. [Camera: angle,
> distance, lens]. [Style/medium]. [Mood/palette]. [Any text, quoted exactly.]

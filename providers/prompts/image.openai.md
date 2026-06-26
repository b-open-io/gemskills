---
provider: openai
task: image
model: gpt-image-2
version: 1
---

# Prompt guide — OpenAI `gpt-image-2` (text-to-image)

`gpt-image-2` is reasoning-augmented: it reads dense, well-structured natural
language and renders text inside images far better than prior models. Tune
prompts differently than Gemini.

## Do
- **Write in clear prose, not keyword lists.** One or two tight paragraphs.
  State subject → setting → lighting → composition → mood, in that order.
- **Be explicit about any in-image text.** Quote it: `the sign reads "OPEN"`.
  gpt-image-2 is strong at legible typography — use it.
- **Name the framing and lens feel** ("eye-level, 35mm, shallow depth of field").
- **State the output intent** ("product hero on seamless white", "editorial
  cover"). The model uses intent to resolve ambiguity.

## Don't
- **No negative-prompt syntax.** gpt-image-2 has no negative parameter. To
  exclude something, say it positively: instead of "no people", write "an empty
  plaza". (The skill auto-appends an `Avoid: …` clause when `--negative` is set,
  but prefer baking exclusions into the description.)
- **Don't ask for transparency.** gpt-image-2 cannot produce alpha backgrounds —
  use Gemini for cut-outs/icons.
- **Don't over-stack styles.** One coherent aesthetic beats five adjectives.

## Size / quality mapping
- Aspect → size: `1:1`→1024x1024, `16:9`/`4:3`→1536x1024, `9:16`/`3:4`→1024x1536.
- `--size`: `1K`→quality `low` (fast drafts), `2K`→`medium`, `4K`→`high`.
  Iterate at low, finalize at high.

## Skeleton
> A [subject, specific appearance + materials], [doing what], in [setting +
> time/weather]. [Lighting: direction, quality, color temp]. [Camera: angle,
> distance, lens]. [Style/medium]. [Mood/palette]. [Any text, quoted exactly.]

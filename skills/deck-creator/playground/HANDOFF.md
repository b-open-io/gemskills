# Deck Creator Playground — Issue Handoff (2026-02-23)

This document catalogs every known issue in the deck-creator playground, observed through code audit and live Chrome inspection on 2026-02-23. Issues are prioritized P0 (broken/blocking), P1 (significant quality gap), P2 (nice to have).

---

## Issue 1 — Main Preview CSS Isolation + Two Critical CSS Processing Bugs (P0)

**What's broken:** The main slide preview renders HTML content using `dangerouslySetInnerHTML` inside a scoped `<div>`. The result is unstyled text on a dark background. Three compounding problems:

### Bug 1A: `scopeStyles()` @import regex breaks Google Font URLs (CRITICAL)

The regex at `slide-preview.tsx:65`:
```typescript
processed = processed.replace(/@import\s+[^;]+;/gi, (block) => { ... })
```
Matches up to the FIRST semicolon. But Google Font URLs contain semicolons in weight parameters:
```
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```
The regex captures only `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;` — the rest becomes dangling CSS text that breaks all subsequent parsing.

**Confirmed in Chrome:** Both `@import` lines are truncated, leaving `500;600;700;800;900&display=swap');` as garbage CSS tokens.

**Fix:** Use a smarter regex that matches through the closing `)` and semicolon:
```typescript
processed = processed.replace(/@import\s+url\([^)]+\)\s*;/gi, (block) => { ... })
```
Or extract @imports before any other processing using a line-based approach.

### Bug 1B: CSS comments break selector scoping

The `scopeStyles()` selector-scoping regex produces broken CSS when the model puts comments before selectors. The output becomes:
```css
.slide-scope /* Pop Art Influence: Ben-Day Halftone Dots */
.halftone-bg {
```
This is invalid CSS — the comment breaks the `.slide-scope .halftone-bg` selector chain. **5 instances confirmed in the current slide.**

**Fix:** Strip CSS comments before running the selector scoping pass:
```typescript
processed = processed.replace(/\/\*[\s\S]*?\*\//g, '')
```

### Bug 1C: Inherited app styles (Tailwind/shadcn cascade leak)

Even with 1A and 1B fixed, the app's Tailwind preflight and shadcn global styles still leak into the slide content. The `.slide-wrapper` gets `font-family: Inter, "Inter Fallback"` from the app instead of the generated font.

**Why variant thumbnails look correct:** They use `<iframe srcDoc={...}>` which gives complete CSS isolation.

**The `dangerouslySetInnerHTML` concern:** The user flagged this as a code smell. It IS the standard React approach for injecting arbitrary HTML, but combined with the leaking app styles, the rendering is fundamentally unreliable.

**Recommended fix — Shadow DOM:**
```tsx
// Replace the current inline rendering with a Shadow DOM container
const shadowRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!shadowRef.current || !rendered) return
  let shadow = shadowRef.current.shadowRoot
  if (!shadow) shadow = shadowRef.current.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${rendered.css}</style><div class="slide-scope">${rendered.html}</div>`
}, [rendered])
```
Shadow DOM gives iframe-level CSS isolation while keeping the DOM accessible for annotations (Agentation can querySelector into shadowRoot).

**Alternative:** If Shadow DOM creates issues with the annotation overlay (Agentation needs to detect elements), use an iframe with `srcdoc` for the main preview too, but mount the Agentation annotation layer on top of the iframe using absolute positioning. The annotations would use coordinate-based positioning (which they already do — x/y percentages) rather than DOM element targeting.

**Files:** `src/components/slide-preview.tsx`

---

## Issue 2 — Theme Colors Present But Not Visible in Output (P0)

**What's broken:** Theme colors ARE correctly stored in state, passed to the API, and included in the system prompt. BUT two problems prevent them from working:

1. The model sometimes hardcodes colors instead of using var() references. **Confirmed in Chrome:** `.slide-wrapper` has `background: #030508` and `color: #ffffff` — hardcoded values instead of `var(--background)` and `var(--foreground)`. The system prompt says to use var() but the model ignores it.

2. Even when the model DOES use var(), the CSS custom properties set on the slide container (via `themeVars` inline style, line 314) are overridden by the app's own CSS custom properties from the Tailwind/shadcn theme (same cascade leak as Issue 1C).

**The data flow (verified working):**
1. `state.themeConfig` has correct hex values (confirmed: `#0a0e1a`, `#e2e8f0`, `#00d4aa`)
2. `dashboard-footer.tsx` passes `themeConfig: state.themeConfig` to `generateHtmlSlide()` (line 96)
3. `generate-html-slide/route.ts` passes themeConfig to `buildHtmlSlideSystemPrompt()` (line 159)
4. `deck.ts:buildHtmlSlideSystemPrompt()` includes actual hex values with instructions to use var() (lines 489-503)
5. Generated HTML uses var() references correctly
6. `slide-preview.tsx` sets CSS custom properties on the slide container div (line 314)

**Why it fails:** The inline style CSS custom properties on the container ARE set, but the app's global CSS also defines `--primary`, `--background`, etc. The specificity battle means sometimes the app's values win, especially for inherited properties. This is the same root cause as Issue 1 — CSS isolation.

**Fix:** Shadow DOM (same as Issue 1) — once styles are isolated, var() references resolve correctly against the container's custom properties.

**Files:** `src/components/slide-preview.tsx`, `src/lib/server/deck.ts`

---

## Issue 3 — No Background Image Generation in HTML Mode (P1)

**What's broken:** HTML slides always get a flat color background (`var(--background)` which is just `#0a0e1a`). There's no mechanism to generate a rich background image and layer HTML content on top.

The user said: "I still haven't seen it generate a background image with elements on top of it. I've only ever seen it work in video mode so far."

**Why:** The system prompt (deck.ts:402-407) says:
- With video: "The wrapper background MUST be transparent" (correct — video plays behind)
- Without video: "Use var(--background) as the wrapper background color" (produces boring flat slides)

**What should happen:** When there's no video background, the slide should still have a visually interesting background. Options:
1. **Two-pass generation:** First generate a background image via Imagen/Gemini image API, then generate HTML overlay content that composites on top. This matches what the user sees working in "image mode" but with HTML overlay.
2. **CSS-only rich backgrounds:** Instruct Gemini to generate complex CSS gradients, patterns, and decorative elements as the background layer instead of a flat color.
3. **Reuse existing generated images:** If a slide has an image-mode variant, offer to use that as the background for the HTML overlay.

**The most impactful fix:** Option 1 (two-pass) is the closest to the original vision. The generated image would be injected as a CSS `background-image` on the wrapper, with the HTML overlay content floating on top with glass cards.

**Files:** `src/lib/server/deck.ts` (system prompt), `src/app/api/generate-html-slide/route.ts`

---

## Issue 4 — Error Handling: No Retry or Raw Output Inspection (P1)

**What's broken:** When generation produces bad output, the app shows a generic toast error. The user said: "You need to very clearly just error and say, 'Hey, the model didn't produce the right type of output,' and press retry with a copy button so you can copy the raw output and inspect it yourself."

**Current error handling (route.ts):**
- Lines 218-223: Checks for valid HTML tags
- Lines 226-230: Checks for truncated style blocks
- Lines 237-243: Checks for truncated full documents
- Lines 236-259: Strips document wrappers if model ignored fragment instruction
- On error: returns `{ ok: false, error: "..." }` — no raw output attached

**Current error handling (dashboard-footer.tsx):**
- Lines 110-118: Shows `toast.error(data.error)` — no retry button, no raw output

**What should happen:**
1. When generation fails validation, return the raw output alongside the error message
2. In the UI, show an error state with:
   - The error message explaining what went wrong
   - A "Retry" button that re-triggers generation
   - A "Copy Raw Output" button that copies the raw model response to clipboard
3. The slide preview should show the error state (not a blank placeholder)

**Files:** `src/app/api/generate-html-slide/route.ts`, `src/components/dashboard-footer.tsx`, `src/components/slide-preview.tsx`

---

## Issue 5 — Slide Theme Mode Toggle Destructively Resets Colors (P1)

**What's broken:** Clicking Light/Dark in the "Slide Mode" toggle dispatches BOTH a mode change AND a full theme reset to defaults:

```tsx
onClick={() => {
  dispatch({ type: "SET_FIELD", field: "slideThemeMode", value: "light" })
  dispatch({ type: "SET_FIELD", field: "themeConfig", value: { ...DEFAULT_LIGHT_THEME } })
}}
```

This means if a user pastes a custom dark theme from tweakcn, then accidentally clicks "Light", all their custom colors are wiped and replaced with defaults.

**What should happen:** Toggling the mode should only change how paste interprets the CSS (`:root` vs `.dark` block). It should NOT reset the current themeConfig. A separate "Reset to Defaults" button already exists for that purpose.

**Files:** `src/components/look-and-feel.tsx`

---

## Issue 6 — `slideThemeMode` Not Persisted to THEME.md (P2)

**What's broken:** `slideThemeMode` is in the DeckState interface and initialState, but `loadDeckState()` in `deck.ts` never reads or writes it. The `parseTheme()` function doesn't know about it. When the playground reloads, it always defaults to "dark".

**Fix:** Add `slideThemeMode` to `parseTheme()` output and the save-deck API route. Include it in the THEME.md frontmatter or as a YAML key.

**Files:** `src/lib/server/deck.ts`, `scripts/parsers.ts`, save-deck API route

---

## Issue 7 — Font Not Reaching System Prompt (ALREADY FIXED)

**Status:** This WAS broken but has been fixed. The `fontFamily` IS now passed through:
- `dashboard-footer.tsx:95`: `fontFamily: state.fontFamily || undefined`
- `generate-html-slide/route.ts:100`: accepts `fontFamily` in body
- `route.ts:161`: passes to `buildHtmlSlideSystemPrompt({ fontFamily: body.fontFamily })`
- `deck.ts:382-394`: builds font stack and import URL from fontFamily

**Remaining issue:** The font dropdown in Look & Feel appears empty (no font selected) even though fonts should be available. Verify the font catalog is loading correctly.

**Files:** `src/components/look-and-feel.tsx`, `src/lib/font-catalog.ts`

---

## Issue 8 — Style Recipe "None" Selection Bug (P2)

**What's broken:** `getStyleRecipeById()` in `style-recipes.ts` line 49:
```typescript
if (typeof id === "undefined") return STYLE_RECIPES[0]
```

When `styleRecipeId` is `undefined` (not explicitly null), it falls back to the first recipe (Twitter Liquid Glass). This means older API calls or any code path that doesn't explicitly set `styleRecipeId: null` will always get the liquid glass recipe even if the user selected "None".

The fix at line 47 (`if (id === null || id === "") return null`) handles explicit null/empty correctly. The issue is only for `undefined`.

**Verify:** Check all call sites to ensure they pass `null` (not `undefined`) when "None" is selected.

**Files:** `src/lib/style-recipes.ts`

---

## Issue 9 — Variant Strip Height / Page Scroll (P2)

**What's broken:** The variant strip on the right side has a `ScrollArea` for internal scrolling, but its parent container doesn't properly constrain height. When many variants exist (8 in the current deck), the strip can push the page body to scroll instead of scrolling internally.

**Where:** `src/components/variant-strip.tsx` — the outer div uses `flex shrink-0 flex-col` but relies on the parent's flex constraints. In `page.tsx`, the variant strip is inside `<div className="flex flex-1 min-h-0">` which should work, but verify the `min-h-0` propagates correctly through the flex chain.

**Files:** `src/components/variant-strip.tsx`, `src/app/page.tsx`

---

## Issue 10 — Video Looping (ALREADY FIXED)

**Status:** Already handled in `generate-video/route.ts` lines 112-114:
```typescript
if (!videoPrompt.toLowerCase().includes("loop")) {
  videoPrompt += ", seamless loop, perfect loop point, continuous motion"
}
```

No action needed.

---

## Issue 11 — System Prompt Quality for Rich Slides (P1)

**What's broken:** The system prompt produces functional but visually underwhelming slides. Key gaps:

1. **No explicit glass card hierarchy guidance.** The prompt says to use glass cards but doesn't specify:
   - Primary cards (large, prominent) vs secondary cards (smaller, more transparent)
   - How to create visual depth through layering multiple glass surfaces
   - Minimum card sizes and spacing for readability

2. **No decorative element guidance.** Premium slides need:
   - Subtle gradient orbs/blobs in the background (radial-gradient with low opacity)
   - Thin line decorations (borders, dividers) using `var(--primary)` at low opacity
   - Optional grid/dot patterns for texture

3. **No animation instructions.** The original tweet reference included:
   - CSS animations for subtle motion (floating elements, pulsing accents)
   - Transition effects within individual slides

4. **The "Content" slide type instruction is too generic.** Most slides will be "Content" type but the instruction just says "headline with content cards or bullet points." It should produce rich, multi-column layouts with stats, icons, and structured data.

**Files:** `src/lib/server/deck.ts` (buildHtmlSlideSystemPrompt)

---

## Architecture Notes

### What works correctly:
- Theme paste from tweakcn: oklch/hsl/rgb colors are converted to hex at parse time
- Slide theme mode (light/dark) toggle exists and controls paste behavior
- Art style selection drives the aesthetic in the system prompt
- Style recipe system composes role-specific prompt directives
- Video generation includes seamless loop language
- Annotation system (Agentation) is fully wired for CRUD + submit
- Font catalog with Google Font imports
- Variant system with add/delete/select

### Core architectural constraint:
The main preview CANNOT use an iframe because the Agentation annotation system needs to detect DOM elements inside the slide for targeted annotations. Shadow DOM is the correct solution — it provides CSS isolation while keeping the DOM queryable through `shadowRoot`.

### Data flow for generation:
```
state.themeConfig (hex values)
  → dashboard-footer.tsx passes to generateHtmlSlide()
    → API route reads themeConfig, resolves style/recipe
      → buildHtmlSlideSystemPrompt() embeds hex values + var() instruction
        → Gemini generates HTML using var() references
          → Response validated, font enforced, saved to disk
            → Frontend receives HTML, dispatches to state
              → slide-preview.tsx renders with CSS custom properties on container
```

The pipeline is correct end-to-end. The only break is at the final rendering step (CSS isolation).

---

## Priority Summary

| # | Issue | Priority | Effort |
|---|-------|----------|--------|
| 1A | @import regex breaks Google Font URLs | P0 | Trivial |
| 1B | CSS comments break selector scoping | P0 | Trivial |
| 1C | Inherited app styles (cascade leak) | P0 | Medium (Shadow DOM) |
| 2 | Theme colors not visible (model hardcodes + cascade) | P0 | Addressed by 1C + prompt fix |
| 3 | No background image in HTML mode | P1 | High |
| 4 | Error handling: retry + copy raw | P1 | Low |
| 5 | Mode toggle destructively resets colors | P1 | Trivial |
| 6 | slideThemeMode not persisted | P2 | Low |
| 7 | Font reaching system prompt | Done | — |
| 8 | Style recipe "None" bug | P2 | Trivial |
| 9 | Variant strip height | P2 | Low |
| 10 | Video looping | Done | — |
| 11 | System prompt quality | P1 | Medium |

**Recommended execution order:**
1. Fix #1A + #1B (trivial regex fixes — unblocks CSS rendering immediately)
2. Fix #5 (trivial — just remove the theme reset from mode toggle)
3. Fix #1C (Shadow DOM — complete CSS isolation, fixes #2 cascade side)
4. Fix #2 model side (strengthen system prompt to enforce var() usage, add post-processing to replace hardcoded colors with var() references)
5. Fix #4 (error handling — enables iteration on output quality)
6. Fix #11 (system prompt — improves generation quality)
7. Fix #3 (background images — biggest visual impact after isolation)
8. Fix #6, #8, #9 (cleanup)

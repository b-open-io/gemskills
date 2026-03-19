# Live Annotation Edits

## Problem

HTML-mode slides have no targeted edit path. Clicking "Apply" on an annotation triggers full regeneration (~30s, includes backdrop generation). This breaks the iteration loop.

## Solution

Two-tier approach: app-side targeted HTML edits (Tier 1) and MCP hands-free mode (Tier 2).

## Tier 1: App-Side Targeted HTML Edits

### New endpoint: `/api/annotations/apply-html`

Accepts current slide HTML + batch of annotations, sends to Gemini with a focused edit prompt, returns modified HTML.

**Request:**
```typescript
{
  html: string           // current slide HTML content
  annotations: Array<{
    note: string
    x: number
    y: number
    element?: { type: string; currentText?: string }
    intent?: "fix" | "change" | "question" | "approve"
    severity?: "blocking" | "important" | "suggestion"
  }>
  themeConfig: Record<string, string>  // for theme var context
  slideIndex: number
}
```

**Response:**
```typescript
{ ok: true; html: string }
| { ok: false; error: string }
```

**Gemini prompt strategy:** "Here is the current HTML for a presentation slide. Apply these edits without changing the overall structure, layout, or unrelated content. Use only CSS custom properties (var(--background), var(--card), etc.) for colors. [annotations with positions and element context]"

### Changes to annotation-list.tsx

`handleApply` for HTML mode currently does:
```typescript
if (slide.renderMode === "html") {
    updateAnnotation(ann.id, { status: "applied" })
    onRegenerate()  // full regen
    return
}
```

Change to: call `/api/annotations/apply-html` with the current HTML + annotation, then hot-swap via `SET_ACTIVE_VARIANT_HTML`. Falls back to full regen if the edit fails.

### Changes to page.tsx `handleAnnotationSubmit`

After saving annotations on submit, batch-apply all open annotations via the same endpoint. Update the slide HTML in place. Mark annotations as applied.

### API client addition (api.ts)

```typescript
export async function applyHtmlAnnotationEdit(body: {
  html: string
  annotations: Array<{ note: string; x: number; y: number; element?: { type: string; currentText?: string } }>
  themeConfig: Record<string, string>
  slideIndex: number
}): Promise<{ ok: boolean; html?: string; error?: string }>
```

## Tier 2: MCP Hands-Free Mode (future)

With `agentation-mcp` installed, Claude Code can run a watch loop:
1. `agentation_watch_annotations` blocks until annotations arrive
2. Agent reads current slide HTML from the playground API or filesystem
3. Calls `/api/annotations/apply-html` (same endpoint from Tier 1)
4. Calls `agentation_resolve` with summary
5. Slide updates live in browser

This layers on top of Tier 1 with no additional playground code changes needed.

## Files

| File | Change |
|------|--------|
| `app/api/annotations/apply-html/route.ts` | New endpoint |
| `components/annotation-list.tsx` | `handleApply` calls targeted edit for HTML mode |
| `app/page.tsx` | `handleAnnotationSubmit` auto-applies on submit |
| `lib/api.ts` | New `applyHtmlAnnotationEdit` client function |

## Verification

1. Add annotation to HTML slide, click Apply -> slide updates in ~3-5s without full regen
2. Add multiple annotations, click Submit in Agentation -> all applied as batch
3. Theme vars respected in edits (no hardcoded colors)
4. Fallback to full regen if targeted edit fails
5. Build passes

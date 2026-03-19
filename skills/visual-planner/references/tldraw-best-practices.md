# tldraw Best Practices (v4.4.0)

Research findings for generating correct, well-laid-out `.tldr` files programmatically.

---

## Arrow Bindings

Bindings are **separate store records** — they are NOT embedded in arrow props.

### Required Binding Fields

```json
{
  "id": "binding:<unique>",
  "typeName": "binding",
  "type": "arrow",
  "fromId": "shape:<arrow_id>",
  "toId": "shape:<target_node_id>",
  "props": {
    "terminal": "start",
    "normalizedAnchor": { "x": 0.5, "y": 0.5 },
    "isExact": false,
    "isPrecise": false,
    "snap": "none"
  },
  "meta": {}
}
```

### Field Semantics

| Field | Recommended | Notes |
|-------|-------------|-------|
| `terminal` | `"start"` or `"end"` | Which end of the arrow this binding controls |
| `normalizedAnchor` | `{ x: 0.5, y: 0.5 }` | Anchor point on target shape (0,0 = top-left, 1,1 = bottom-right) |
| `isPrecise` | `false` (default) | `false` = arrow auto-routes to shape center. `true` = connects to exact `normalizedAnchor` point |
| `isExact` | `false` (default) | `false` = arrowhead stops at shape boundary. `true` = arrowhead enters the shape |
| `snap` | `"none"` (default) | Elbow routing snap: `"none"`, `"center"`, `"edge"`, `"edge-point"`. Only relevant for elbow arrows |

**Use `isPrecise: false, isExact: false` as defaults.** tldraw will calculate the best connection points automatically.

### Arrow Position When Bound

When an arrow has bindings, tldraw recalculates its position from the binding targets. Set these to zero — tldraw ignores them anyway:

```json
"x": 0,
"y": 0,
"props": {
  "start": { "x": 0, "y": 0 },
  "end": { "x": 0, "y": 0 }
}
```

**Never try to compute arrow `x,y` manually for bound arrows.** tldraw owns those values once bindings exist.

---

## Layout

**tldraw has no auto-layout.** Positions must be computed before writing the `.tldr` file. The official tldraw MCP server also does not auto-layout — the LLM specifies coordinates directly, which causes ugly overlapping diagrams when the LLM guesses badly.

### Recommended: dagre for DAG Layout

Use `@dagrejs/dagre` (npm) for automatic graph layout. It handles topological sort and row-based positioning.

**Dagre config for workflow diagrams:**

```typescript
import dagre from "@dagrejs/dagre";

const g = new dagre.graphlib.Graph();
g.setDefaultEdgeLabel(() => ({}));
g.setGraph({
  rankdir: "TB",   // top-to-bottom flow
  nodesep: 150,    // horizontal gap between nodes in same rank
  ranksep: 120,    // vertical gap between ranks
  marginx: 50,
  marginy: 50,
});

// Add nodes (use actual shape dimensions)
g.setNode("api", { width: 200, height: 80 });

// Add edges
g.setEdge("api", "auth");

// Run layout
dagre.layout(g);

// Read positions (dagre gives center coordinates — convert to top-left)
const node = g.node("api");
const x = node.x - node.width / 2;
const y = node.y - node.height / 2;
```

### Spacing Constants

| Element | Size |
|---------|------|
| Node width (default) | 200 px |
| Node height (default) | 80 px |
| Horizontal gap (`nodesep`) | 150 px |
| Vertical gap (`ranksep`) | 120 px |
| Frame padding | 40 px |

### Elbow Arrow Spacing Requirement

For `kind: "elbow"` arrows, nodes need a **minimum 80 px gap** between them for routing headroom. With less space, elbow arrows will overlap the shapes they connect.

**Prefer `kind: "arc"` with `bend: 0` as the default.** It renders as a straight line and works correctly at any spacing. Elbow arrows are only worth using when you have explicit control over layout and can guarantee the 80 px gap.

---

## Arrow Kinds

| Kind | Behavior | When to Use |
|------|----------|-------------|
| `"arc"` with `bend: 0` | Straight line | Default — safe for any layout |
| `"arc"` with `bend > 0` | Curved arc | When you want visual curves |
| `"elbow"` | Right-angle routing | Only when nodes have 80+ px gap AND elbow headroom is guaranteed |

---

## Valid Style Values

### Colors
`black`, `grey`, `light-violet`, `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`, `white`

### Fill
`none`, `semi`, `solid`, `pattern`, `fill`, `lined-fill`

### Dash
`draw`, `solid`, `dashed`, `dotted`

### Size
`s`, `m`, `l`, `xl`

### Font
`draw`, `sans`, `serif`, `mono`

### Geo Types
`cloud`, `rectangle`, `ellipse`, `triangle`, `diamond`, `pentagon`, `hexagon`, `octagon`, `star`, `rhombus`, `rhombus-2`, `oval`, `trapezoid`, `arrow-right`, `arrow-left`, `arrow-up`, `arrow-down`, `x-box`, `check-box`, `heart`

### Arrowheads
`arrow`, `triangle`, `square`, `dot`, `pipe`, `diamond`, `inverted`, `bar`, `none`

---

## richText Format (ProseMirror)

All text in tldraw uses a ProseMirror-compatible document structure.

**Single line:**
```json
{ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Hello" }] }] }
```

**Empty:**
```json
{ "type": "doc", "content": [{ "type": "paragraph" }] }
```

**Multi-line** — split on `\n`, one paragraph per line:
```json
{
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "Line 1" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "Line 2" }] }
  ]
}
```

---

## Fractional Indexing

tldraw uses fractional index strings for z-ordering. Use `@tldraw/utils` for correct values — do not hand-roll them.

```typescript
import { getIndices } from "@tldraw/utils";

// Generate n indices starting from "a1"
const indices = getIndices(totalShapeCount);
// Returns: ["a1", "a2", "a3", ...]
```

**Ordering rule:** Assign node indices first, then arrow indices. Arrows render on top of nodes (higher index = in front). This ensures arrowheads are never hidden behind shapes.

Available functions: `getIndices(n)`, `getIndexAbove(index)`, `getIndexBetween(below, above)`, `getIndicesAbove(index, n)`, `getIndicesBetween(below, above, n)`

---

## Frame Sizing with Auto-Layout

When using dagre layout, frames cannot be sized until after nodes are positioned. The correct order is:

1. Run dagre layout on all non-frame shapes
2. Update shape x,y positions from dagre output
3. For each frame, compute bounding box of its children (with padding)
4. Create frame records sized to contain their children

Frame children use **coordinates relative to the frame's origin** — subtract the frame's x,y from each child's position.

---

## Headless SDK (for validation/generation)

The tldraw headless SDK works without React:

```typescript
import { createTLStore, createShapeId, createBindingId } from "@tldraw/tlschema";

const store = createTLStore();
store.put([shape1, shape2, binding1]);
const snapshot = store.getStoreSnapshot(); // Valid .tldr store
```

Note: `getSnapshot(store)` produces an editor snapshot — different format, NOT for `.tldr` files. Use `store.getStoreSnapshot()`.

---

## Common Pitfalls (Raw .tldr JSON)

When writing raw `.tldr` store records directly (not using focused shapes + create_diagram.ts), avoid these errors:

1. **Frame shapes require `color` in `props`**. Valid values: `"black"`, `"grey"`, `"violet"`, `"blue"`, `"light-blue"`, `"yellow"`, `"orange"`, `"green"`, `"light-green"`, `"light-red"`, `"red"`, `"white"`, `"light-violet"`. Omitting `color` causes a `ValidationError` at render time.

2. **Arrow `start`/`end` coordinates must not be `null`**. Use `{ "x": 0, "y": 0 }` as placeholder — tldraw recomputes positions from bindings. Setting `null` crashes the renderer.

3. **The `schema` record is required**. Every `.tldr` file must include a top-level `"schema"` object with `schemaVersion: 2` and the `sequences` map. Without it, tldraw throws `Cannot read properties of undefined (reading 'schemaVersion')`.

4. **Rich text handling**. Labeled shapes need `"richText": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Label" }] }] }`. For **unlabeled arrows**, omit the `richText` key entirely — do NOT use empty content arrays (`[]`), empty paragraphs (`{ "type": "paragraph" }`), or space-only text (`" "`). All of these cause "Empty text nodes are not allowed" errors.

5. **Child shapes in frames use relative coordinates**. When `parentId` points to a frame, `x` and `y` are relative to the frame's top-left corner, not the canvas origin.

6. **Index keys must be valid fractional index strings**. tldraw uses a specific fractional indexing format. Valid examples: `"a1"`, `"a2"`, `"a1V"`, `"aD"`, `"aG"`. **Invalid**: `"b1"`, `"c2"`, `"d0"`, `"aK0"` — indices must not start with letters beyond `"a"` and must not end with `"0"`. Use sequential `"a1"` through `"a9"`, then `"aA"` through `"aZ"`, then two-char like `"a1V"` for ordering. When in doubt, use `"a1"`, `"a2"`, `"a3"`, etc.

7. **Always use `"size": "s"` (small font)**. Medium and large text overflow boxes quickly and look cluttered in architecture diagrams. Small is the default for readability.

8. **Give generous spacing between nodes**. Use at least 120px vertical gap between connected nodes and 60px horizontal gap between siblings. Make boxes at least 240w x 70h for readability. Cramped diagrams are harder to read than slightly larger ones — when in doubt, add more space.

9. **Validate JSON after every edit**. Run `python3 -m json.tool < file.tldr` after writing or editing `.tldr` files. Incremental edits can corrupt string literals. Always validate before launching the playground.

10. **Avoid `replace_all: true` on `.tldr` files**. It matches across the entire file and can corrupt unrelated strings that happen to contain the search text. Use targeted edits with enough surrounding context to be unique.

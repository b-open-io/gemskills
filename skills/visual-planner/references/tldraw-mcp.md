# tldraw MCP Reference

How the official tldraw MCP works internally, so our skill can provide equivalent functionality without requiring the MCP server.

Source: `github.com/tldraw/tldraw/apps/mcp-app/`

## MCP Tools

The tldraw MCP exposes these tools:

| Tool | Description |
|------|-------------|
| `diagram_drawing_read_me` | Returns shape format reference docs |
| `create_shapes` | Add new shapes to canvas (optionally blank slate) |
| `update_shapes` | Modify existing shapes by shapeId |
| `delete_shapes` | Remove shapes and associated bindings |
| `read_checkpoint` | Retrieve saved drawing state |
| `save_checkpoint` | Persist drawing state |

## Focused Shape Format

The MCP uses a **simplified "focused shape" format** instead of raw tldraw records. This is much easier for agents to work with. The converter code (`focused-shape-converters.ts`) handles the translation.

### Focused vs Raw tldraw

| Aspect | Focused (MCP) | Raw (.tldr) |
|--------|--------------|-------------|
| Arrow connections | `fromId`/`toId` on arrow | Separate binding records |
| Text content | `text: "string"` | `richText: { type: "doc", content: [...] }` |
| Shape ID | `shapeId: "myid"` | `id: "shape:myid"` |
| Parent/child | `children: ["id1"]` on frames | `parentId: "shape:frame1"` on children |
| Fill names | `none`, `tint`, `background`, `solid`, `pattern` | `none`, `solid`, `semi`, `lined-fill`, `pattern` |

### Focused Geo Shape

```json
{
  "_type": "rectangle",
  "shapeId": "box1",
  "x": 100, "y": 200,
  "w": 200, "h": 100,
  "color": "blue",
  "fill": "tint",
  "text": "My Label",
  "note": "invisible annotation"
}
```

Available `_type` values: `rectangle`, `ellipse`, `triangle`, `diamond`, `hexagon`, `pill`, `cloud`, `x-box`, `check-box`, `heart`, `pentagon`, `octagon`, `star`, `parallelogram-right`, `parallelogram-left`, `trapezoid`, `fat-arrow-right`, `fat-arrow-left`, `fat-arrow-up`, `fat-arrow-down`

### Focused Arrow Shape

```json
{
  "_type": "arrow",
  "shapeId": "arrow1",
  "x1": 300, "y1": 250,
  "x2": 450, "y2": 250,
  "color": "black",
  "fromId": "box1",
  "toId": "box2",
  "text": "connects to",
  "bend": 0
}
```

Bindings are auto-created from `fromId`/`toId`. No separate binding records needed.

### Focused Text Shape

```json
{
  "_type": "text",
  "shapeId": "label1",
  "x": 50, "y": 50,
  "text": "Title Text",
  "color": "black",
  "anchor": "top-left",
  "font": "sans",
  "maxWidth": 300
}
```

Anchor values: `top-left`, `top-center`, `top-right`, `center-left`, `center`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`

### Focused Note Shape

```json
{
  "_type": "note",
  "shapeId": "note1",
  "x": 400, "y": 100,
  "color": "yellow",
  "text": "Remember this"
}
```

### Focused Frame Shape

```json
{
  "_type": "frame",
  "shapeId": "frame1",
  "x": 0, "y": 0,
  "w": 600, "h": 400,
  "name": "Phase 1",
  "children": ["box1", "box2"]
}
```

Children can be explicit or auto-detected by containment.

### Focused Line Shape

```json
{
  "_type": "line",
  "shapeId": "line1",
  "x1": 0, "y1": 0,
  "x2": 200, "y2": 100,
  "color": "grey",
  "dash": "dashed"
}
```

## Fill Mapping

| Focused | tldraw | Visual Effect |
|---------|--------|--------------|
| `none` | `none` | Transparent |
| `tint` | `solid` | Opaque solid fill |
| `background` | `semi` | Semi-transparent |
| `solid` | `lined-fill` | Lined fill pattern |
| `pattern` | `pattern` | Crosshatch pattern |

## Color Aliases

The MCP accepts aliases and normalizes them:

| Alias | Maps To |
|-------|---------|
| `purple` | `violet` |
| `pink` | `light-violet` |
| `light-pink` | `light-violet` |
| `light-orange` | `yellow` |
| `brown` | `orange` |

## Geo Type Mapping

| Focused Name | tldraw Geo |
|-------------|-----------|
| `pill` | `oval` |
| `parallelogram-right` | `rhombus` |
| `parallelogram-left` | `rhombus-2` |
| `fat-arrow-right` | `arrow-right` |
| `fat-arrow-left` | `arrow-left` |
| `fat-arrow-up` | `arrow-up` |
| `fat-arrow-down` | `arrow-down` |
| `geo` | `rectangle` (fallback) |

## Layout Guidelines from MCP

From the official `read-me.ts`:

- Coordinate system: 0,0 is top-left, x increases right, y increases down
- Minimum spacing: 140px gap between shapes
- Keep numeric fields as numbers (not strings) before JSON stringifying
- For bidirectional arrows, use opposite-sign bend values to prevent label collision
- Text shapes auto-wrap when `maxWidth` is set

## How Our Skill Replaces the MCP

Our skill provides equivalent functionality without requiring the MCP server:

| MCP Tool | Our Equivalent |
|----------|---------------|
| `create_shapes` | `scripts/create_diagram.ts` — accepts focused-shape JSON, outputs .tldr |
| `update_shapes` | Direct .tldr file editing (JSON manipulation) |
| `delete_shapes` | Direct .tldr file editing |
| `read_checkpoint` | Read the .tldr file |
| `save_checkpoint` | Write the .tldr file |
| Canvas widget | Playground (tldraw React component) |

The key advantage: our skill works without any MCP server running. Agents generate .tldr files directly, and the playground loads them. If the tldraw MCP IS available, the playground can show that in the UI as an optional connection.

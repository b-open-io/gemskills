# tldraw .tldr Format Reference

Complete reference for generating valid `.tldr` files programmatically. A `.tldr` file is JSON containing a tldraw store snapshot. tldraw v4.4.0.

## Table of Contents

- [File Structure](#file-structure)
- [Record ID Conventions](#record-id-conventions)
- [Index Keys (z-ordering)](#index-keys)
- [Pages](#pages)
- [Base Shape Interface](#base-shape-interface)
- [Shape Types](#shape-types)
  - [Geo (rectangles, ellipses, etc.)](#geo-shape)
  - [Arrow](#arrow-shape)
  - [Text](#text-shape)
  - [Note (sticky notes)](#note-shape)
  - [Frame (containers)](#frame-shape)
  - [Group](#group-shape)
  - [Line](#line-shape)
  - [Draw (freehand)](#draw-shape)
  - [Image](#image-shape)
- [Bindings (arrow connections)](#bindings)
- [Rich Text Format](#rich-text)
- [Style Values](#style-values)
- [Complete .tldr Example](#complete-example)
- [Layout Patterns for Diagrams](#layout-patterns)

---

## File Structure

A `.tldr` file is a `TLStoreSnapshot`:

```json
{
  "schema": {
    "schemaVersion": 2,
    "sequences": { ... }
  },
  "store": {
    "document:document": { ... },
    "page:page1": { ... },
    "shape:abc123": { ... },
    "binding:def456": { ... },
    ...
  }
}
```

The `store` is a flat key-value map where keys are record IDs. Every `.tldr` file must contain at minimum:
- One `document:document` record
- One `page:*` record
- Shape and binding records as needed

For agent-generated diagrams, omit session-specific records (instance, camera, pointer, page_state). tldraw creates these automatically when loading.

### Minimal Valid .tldr

```json
{
  "store": {
    "document:document": {
      "gridSize": 10,
      "name": "",
      "meta": {},
      "id": "document:document",
      "typeName": "document"
    },
    "page:page": {
      "meta": {},
      "id": "page:page",
      "name": "Page 1",
      "index": "a1",
      "typeName": "page"
    }
  }
}
```

The `schema` field is optional for loading — tldraw will migrate as needed. Include it for forward-compatibility.

---

## Record ID Conventions

All IDs use the format `typeName:uniqueId`:

| Record Type | ID Pattern | Example |
|-------------|-----------|---------|
| Document | `document:document` | Always this exact value |
| Page | `page:<id>` | `page:page`, `page:planning` |
| Shape | `shape:<id>` | `shape:node1`, `shape:arrow_a` |
| Binding | `binding:<id>` | `binding:bind1` |

Use descriptive IDs for agent-generated diagrams — they make the file human-readable and debuggable. IDs must be unique within their type.

---

## Index Keys

The `index` field on shapes and pages controls z-ordering (stacking). Use fractional index strings:

| Position | Index Value |
|----------|-------------|
| First | `"a1"` |
| Second | `"a2"` |
| Third | `"a3"` |
| Between a1 and a2 | `"a1V"` |

For simple diagrams, sequential `"a1"`, `"a2"`, `"a3"` etc. works fine. Later shapes render on top of earlier ones.

---

## Pages

```json
{
  "id": "page:page",
  "typeName": "page",
  "name": "Page 1",
  "index": "a1",
  "meta": {}
}
```

Most agent-generated diagrams use a single page. Shapes reference their page via `parentId`.

---

## Base Shape Interface

Every shape shares these fields:

```json
{
  "id": "shape:<unique_id>",
  "typeName": "shape",
  "type": "<shape_type>",
  "x": 100,
  "y": 100,
  "rotation": 0,
  "index": "a1",
  "parentId": "page:page",
  "isLocked": false,
  "opacity": 1,
  "props": { ... },
  "meta": {}
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `shape:<unique>` |
| `typeName` | `"shape"` | Always `"shape"` |
| `type` | string | Shape type: `geo`, `arrow`, `text`, `note`, `frame`, `group`, `line`, `draw`, `image` |
| `x`, `y` | number | Position in canvas coordinates |
| `rotation` | number | Rotation in radians |
| `index` | string | Z-order fractional index |
| `parentId` | string | `page:<id>` or `shape:<frame_id>` for frames |
| `isLocked` | boolean | Prevent editing |
| `opacity` | number | 0.1, 0.25, 0.5, 0.75, or 1 |
| `props` | object | Shape-specific properties |
| `meta` | object | Arbitrary JSON metadata (use for planning data) |

---

## Shape Types

### Geo Shape

Geometric shapes: rectangles, ellipses, diamonds, clouds, and more. The workhorse for diagrams.

**Available geo types:**
`cloud`, `rectangle`, `ellipse`, `triangle`, `diamond`, `pentagon`, `hexagon`, `octagon`, `star`, `rhombus`, `rhombus-2`, `oval`, `trapezoid`, `arrow-right`, `arrow-left`, `arrow-up`, `arrow-down`, `x-box`, `check-box`, `heart`

```json
{
  "id": "shape:box1",
  "typeName": "shape",
  "type": "geo",
  "x": 100, "y": 100,
  "rotation": 0,
  "index": "a1",
  "parentId": "page:page",
  "isLocked": false,
  "opacity": 1,
  "props": {
    "geo": "rectangle",
    "w": 200,
    "h": 100,
    "color": "blue",
    "fill": "solid",
    "dash": "solid",
    "size": "m",
    "font": "sans",
    "align": "middle",
    "verticalAlign": "middle",
    "labelColor": "black",
    "richText": {
      "type": "doc",
      "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "My Label" }] }]
    },
    "url": "",
    "growY": 0,
    "scale": 1
  },
  "meta": {}
}
```

**Key props:**

| Prop | Values | Default | Description |
|------|--------|---------|-------------|
| `geo` | See list above | `"rectangle"` | Shape geometry |
| `w`, `h` | number | — | Width and height in px |
| `color` | See [colors](#colors) | `"black"` | Stroke/fill color |
| `fill` | `none`, `semi`, `solid`, `pattern`, `fill`, `lined-fill` | `"none"` | Interior fill style |
| `dash` | `draw`, `solid`, `dashed`, `dotted` | `"draw"` | Outline style |
| `size` | `s`, `m`, `l`, `xl` | `"m"` | Stroke weight |
| `font` | `draw`, `sans`, `serif`, `mono` | `"draw"` | Label font |
| `align` | `start`, `middle`, `end` | `"middle"` | Horizontal text align |
| `verticalAlign` | `start`, `middle`, `end` | `"middle"` | Vertical text align |
| `labelColor` | See [colors](#colors) | `"black"` | Text color |
| `richText` | RichText object | — | Label content |
| `growY` | number >= 0 | `0` | Extra height for overflowing text |
| `scale` | number != 0 | `1` | Display scale |

**For diagrams, prefer:**
- `geo: "rectangle"` with `fill: "solid"` for nodes
- `geo: "diamond"` for decision points
- `geo: "ellipse"` for start/end states
- `geo: "cloud"` for external systems
- `font: "sans"` and `dash: "solid"` for clean appearance

---

### Arrow Shape

Arrows connect shapes. The visual line is defined by `start`/`end` coordinates, but connections to shapes are handled by separate [binding records](#bindings).

**Arrow kinds:** `arc` (curved), `elbow` (right-angle routing)

**Arrowhead types:** `arrow`, `triangle`, `square`, `dot`, `pipe`, `diamond`, `inverted`, `bar`, `none`

```json
{
  "id": "shape:arrow1",
  "typeName": "shape",
  "type": "arrow",
  "x": 300, "y": 150,
  "rotation": 0,
  "index": "a5",
  "parentId": "page:page",
  "isLocked": false,
  "opacity": 1,
  "props": {
    "kind": "elbow",
    "color": "black",
    "fill": "none",
    "dash": "solid",
    "size": "m",
    "font": "sans",
    "labelColor": "black",
    "arrowheadStart": "none",
    "arrowheadEnd": "triangle",
    "start": { "x": 0, "y": 0 },
    "end": { "x": 200, "y": 0 },
    "bend": 0,
    "richText": {
      "type": "doc",
      "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "" }] }]
    },
    "labelPosition": 0.5,
    "scale": 1,
    "elbowMidPoint": 0.5
  },
  "meta": {}
}
```

**Key props:**

| Prop | Values | Default |
|------|--------|---------|
| `kind` | `"arc"`, `"elbow"` | `"arc"` |
| `arrowheadStart` | See arrowhead types | `"none"` |
| `arrowheadEnd` | See arrowhead types | `"triangle"` |
| `start`, `end` | `{ x, y }` | — |
| `bend` | number | `0` (positive = curve left) |
| `labelPosition` | 0-1 | `0.5` (center of arrow) |
| `elbowMidPoint` | 0-1 | `0.5` (for elbow routing) |

**For diagrams, prefer** `kind: "elbow"` for clean right-angle connections between nodes.

The `start` and `end` coordinates are relative to the arrow shape's `x,y` position. When bindings exist, tldraw recalculates these automatically.

---

### Text Shape

Standalone text on the canvas.

```json
{
  "id": "shape:label1",
  "typeName": "shape",
  "type": "text",
  "x": 50, "y": 50,
  "rotation": 0,
  "index": "a1",
  "parentId": "page:page",
  "isLocked": false,
  "opacity": 1,
  "props": {
    "color": "black",
    "size": "m",
    "font": "sans",
    "textAlign": "start",
    "w": 200,
    "richText": {
      "type": "doc",
      "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Title" }] }]
    },
    "scale": 1,
    "autoSize": true
  },
  "meta": {}
}
```

| Prop | Values | Description |
|------|--------|-------------|
| `textAlign` | `start`, `middle`, `end` | Text alignment |
| `w` | number | Width (auto-adjusted if `autoSize: true`) |
| `autoSize` | boolean | Auto-fit width to text |

---

### Note Shape

Sticky notes with background color. Good for annotations.

```json
{
  "id": "shape:note1",
  "typeName": "shape",
  "type": "note",
  "x": 400, "y": 100,
  "rotation": 0,
  "index": "a1",
  "parentId": "page:page",
  "isLocked": false,
  "opacity": 1,
  "props": {
    "color": "yellow",
    "labelColor": "black",
    "size": "m",
    "font": "sans",
    "fontSizeAdjustment": 0,
    "align": "middle",
    "verticalAlign": "middle",
    "growY": 0,
    "url": "",
    "richText": {
      "type": "doc",
      "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Remember!" }] }]
    },
    "scale": 1
  },
  "meta": {}
}
```

Note shapes don't have explicit `w`/`h` — their size is determined by the `size` prop (`s`, `m`, `l`, `xl`) and `growY`.

---

### Frame Shape

Containers that group child shapes. Child shapes use `parentId: "shape:<frame_id>"`.

```json
{
  "id": "shape:frame1",
  "typeName": "shape",
  "type": "frame",
  "x": 0, "y": 0,
  "rotation": 0,
  "index": "a1",
  "parentId": "page:page",
  "isLocked": false,
  "opacity": 1,
  "props": {
    "w": 600,
    "h": 400,
    "name": "Phase 1: Setup",
    "color": "black"
  },
  "meta": {}
}
```

Child shapes inside a frame set `parentId` to the frame's ID:
```json
{
  "id": "shape:child1",
  "parentId": "shape:frame1",
  ...
}
```

Child coordinates are **relative to the frame's origin**.

---

### Group Shape

Invisible container for grouping shapes. No visual properties.

```json
{
  "id": "shape:group1",
  "typeName": "shape",
  "type": "group",
  "x": 100, "y": 100,
  "rotation": 0,
  "index": "a1",
  "parentId": "page:page",
  "isLocked": false,
  "opacity": 1,
  "props": {},
  "meta": {}
}
```

---

### Line Shape

Multi-point lines or splines.

```json
{
  "id": "shape:line1",
  "typeName": "shape",
  "type": "line",
  "x": 0, "y": 0,
  "rotation": 0,
  "index": "a1",
  "parentId": "page:page",
  "isLocked": false,
  "opacity": 1,
  "props": {
    "color": "black",
    "dash": "solid",
    "size": "m",
    "spline": "line",
    "points": {
      "a1": { "id": "a1", "index": "a1", "x": 0, "y": 0 },
      "a2": { "id": "a2", "index": "a2", "x": 200, "y": 100 }
    },
    "scale": 1
  },
  "meta": {}
}
```

| Prop | Values | Description |
|------|--------|-------------|
| `spline` | `"line"`, `"cubic"` | Straight segments or smooth curves |
| `points` | dict of `{ id, index, x, y }` | Points keyed by ID |

---

### Draw Shape

Freehand drawing. Path data is base64-encoded. Rarely needed for agent-generated diagrams.

```json
{
  "id": "shape:draw1",
  "typeName": "shape",
  "type": "draw",
  "x": 0, "y": 0,
  "props": {
    "color": "black",
    "fill": "none",
    "dash": "draw",
    "size": "m",
    "segments": [{ "type": "free", "path": "<base64>" }],
    "isComplete": true,
    "isClosed": false,
    "isPen": false,
    "scale": 1,
    "scaleX": 1,
    "scaleY": 1
  }
}
```

---

### Image Shape

Displays raster images. Requires an associated asset record.

```json
{
  "id": "shape:img1",
  "typeName": "shape",
  "type": "image",
  "x": 0, "y": 0,
  "props": {
    "w": 400,
    "h": 300,
    "playing": true,
    "url": "",
    "assetId": null,
    "crop": null,
    "flipX": false,
    "flipY": false,
    "altText": ""
  }
}
```

---

## Bindings

Bindings connect arrows to shapes. Without bindings, arrows are just floating lines. Each binding is a separate record in the store.

An arrow connecting shape A to shape B needs **two bindings**: one for the start terminal and one for the end terminal.

```json
{
  "id": "binding:arrow1_start",
  "typeName": "binding",
  "type": "arrow",
  "fromId": "shape:arrow1",
  "toId": "shape:nodeA",
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

```json
{
  "id": "binding:arrow1_end",
  "typeName": "binding",
  "type": "arrow",
  "fromId": "shape:arrow1",
  "toId": "shape:nodeB",
  "props": {
    "terminal": "end",
    "normalizedAnchor": { "x": 0.5, "y": 0.5 },
    "isExact": false,
    "isPrecise": false,
    "snap": "none"
  },
  "meta": {}
}
```

| Prop | Type | Description |
|------|------|-------------|
| `fromId` | string | Always the arrow shape ID |
| `toId` | string | The shape being connected to |
| `terminal` | `"start"` or `"end"` | Which end of the arrow |
| `normalizedAnchor` | `{ x, y }` | Anchor point on target (0,0 = top-left, 1,1 = bottom-right) |
| `isExact` | boolean | If true, arrowhead enters the shape |
| `isPrecise` | boolean | If true, use exact anchor; if false, connects to center |
| `snap` | `"center"`, `"edge-point"`, `"edge"`, `"none"` | Elbow arrow snap behavior |

**For diagrams:** Use `normalizedAnchor: { x: 0.5, y: 0.5 }`, `isExact: false`, `isPrecise: false`, `snap: "none"` as defaults. tldraw will calculate the best connection points automatically.

---

## Rich Text

All text content uses a ProseMirror-compatible document structure:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hello " },
        { "type": "text", "text": "bold", "marks": [{ "type": "bold" }] },
        { "type": "text", "text": " world" }
      ]
    }
  ]
}
```

**Plain text shortcut** (single line):
```json
{
  "type": "doc",
  "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Simple text" }] }]
}
```

**Multi-line:**
```json
{
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "Line 1" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "Line 2" }] }
  ]
}
```

**Empty text:**
```json
{
  "type": "doc",
  "content": [{ "type": "paragraph" }]
}
```

---

## Style Values

### Colors

13 named colors available for all shapes:

| Color | Use For |
|-------|---------|
| `black` | Default text and outlines |
| `grey` | Muted/disabled elements |
| `light-violet` | Highlights, categories |
| `violet` | Accents |
| `blue` | Primary actions, links |
| `light-blue` | Info, secondary |
| `yellow` | Warnings, sticky notes |
| `orange` | Alerts, attention |
| `green` | Success, completed |
| `light-green` | Progress, secondary success |
| `light-red` | Soft errors, review needed |
| `red` | Errors, critical, blocked |
| `white` | Backgrounds (on dark) |

### Fill Styles

| Fill | Effect |
|------|--------|
| `none` | Transparent interior |
| `semi` | Semi-transparent fill |
| `solid` | Opaque solid fill |
| `pattern` | Crosshatch pattern |
| `fill` | Alternative solid fill |
| `lined-fill` | Lined fill pattern |

### Dash Styles

| Dash | Effect |
|------|--------|
| `draw` | Hand-drawn sketchy line |
| `solid` | Clean solid line |
| `dashed` | Evenly spaced dashes |
| `dotted` | Evenly spaced dots |

### Sizes

| Size | Usage |
|------|-------|
| `s` | Small — compact diagrams |
| `m` | Medium — default |
| `l` | Large — emphasis |
| `xl` | Extra large — titles |

### Fonts

| Font | Style |
|------|-------|
| `draw` | Hand-drawn (default) |
| `sans` | Clean sans-serif |
| `serif` | Traditional serif |
| `mono` | Monospace/code |

---

## Complete Example

A simple flowchart with two nodes connected by an arrow:

```json
{
  "store": {
    "document:document": {
      "gridSize": 10,
      "name": "Agent Workflow",
      "meta": {},
      "id": "document:document",
      "typeName": "document"
    },
    "page:page": {
      "meta": {},
      "id": "page:page",
      "name": "Page 1",
      "index": "a1",
      "typeName": "page"
    },
    "shape:start": {
      "id": "shape:start",
      "typeName": "shape",
      "type": "geo",
      "x": 100,
      "y": 200,
      "rotation": 0,
      "index": "a1",
      "parentId": "page:page",
      "isLocked": false,
      "opacity": 1,
      "props": {
        "geo": "rectangle",
        "w": 200,
        "h": 80,
        "color": "blue",
        "fill": "solid",
        "dash": "solid",
        "size": "m",
        "font": "sans",
        "align": "middle",
        "verticalAlign": "middle",
        "labelColor": "black",
        "richText": {
          "type": "doc",
          "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Supervisor" }] }]
        },
        "url": "",
        "growY": 0,
        "scale": 1
      },
      "meta": {
        "nodeType": "supervisor",
        "phase": "implemented",
        "agent": "orchestrator"
      }
    },
    "shape:worker": {
      "id": "shape:worker",
      "typeName": "shape",
      "type": "geo",
      "x": 450,
      "y": 200,
      "rotation": 0,
      "index": "a2",
      "parentId": "page:page",
      "isLocked": false,
      "opacity": 1,
      "props": {
        "geo": "rectangle",
        "w": 200,
        "h": 80,
        "color": "green",
        "fill": "solid",
        "dash": "solid",
        "size": "m",
        "font": "sans",
        "align": "middle",
        "verticalAlign": "middle",
        "labelColor": "black",
        "richText": {
          "type": "doc",
          "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Code Writer" }] }]
        },
        "url": "",
        "growY": 0,
        "scale": 1
      },
      "meta": {
        "nodeType": "worker",
        "phase": "planned",
        "agent": "coder",
        "tools": ["Read", "Write", "Bash"]
      }
    },
    "shape:arrow_s_w": {
      "id": "shape:arrow_s_w",
      "typeName": "shape",
      "type": "arrow",
      "x": 300,
      "y": 240,
      "rotation": 0,
      "index": "a3",
      "parentId": "page:page",
      "isLocked": false,
      "opacity": 1,
      "props": {
        "kind": "elbow",
        "color": "black",
        "fill": "none",
        "dash": "solid",
        "size": "m",
        "font": "sans",
        "labelColor": "black",
        "arrowheadStart": "none",
        "arrowheadEnd": "triangle",
        "start": { "x": 0, "y": 0 },
        "end": { "x": 150, "y": 0 },
        "bend": 0,
        "richText": {
          "type": "doc",
          "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "delegate" }] }]
        },
        "labelPosition": 0.5,
        "scale": 1,
        "elbowMidPoint": 0.5
      },
      "meta": {}
    },
    "binding:arrow_s_w_start": {
      "id": "binding:arrow_s_w_start",
      "typeName": "binding",
      "type": "arrow",
      "fromId": "shape:arrow_s_w",
      "toId": "shape:start",
      "props": {
        "terminal": "start",
        "normalizedAnchor": { "x": 0.5, "y": 0.5 },
        "isExact": false,
        "isPrecise": false,
        "snap": "none"
      },
      "meta": {}
    },
    "binding:arrow_s_w_end": {
      "id": "binding:arrow_s_w_end",
      "typeName": "binding",
      "type": "arrow",
      "fromId": "shape:arrow_s_w",
      "toId": "shape:worker",
      "props": {
        "terminal": "end",
        "normalizedAnchor": { "x": 0.5, "y": 0.5 },
        "isExact": false,
        "isPrecise": false,
        "snap": "none"
      },
      "meta": {}
    }
  }
}
```

---

## Layout Patterns for Diagrams

### Spacing Constants

For clean, readable diagrams:

| Element | Recommended Size |
|---------|-----------------|
| Node width | 180-240 px |
| Node height | 70-100 px |
| Horizontal gap | 120-160 px between nodes |
| Vertical gap | 100-140 px between rows |
| Frame padding | 40 px inside edges |

### Supervisor Pattern

Supervisor at top center, workers in a row below:

```
        [Supervisor]           x=300, y=50
       /     |      \
  [Worker1] [Worker2] [Worker3]   x=100,300,500  y=250
```

### Pipeline Pattern

Linear left-to-right flow:

```
[Input] -> [Process] -> [Review] -> [Output]
x=100      x=400        x=700       x=1000     y=200
```

### Hierarchical Pattern

Use frames to group phases:

```
┌─ Frame: Phase 1 ──────────┐  ┌─ Frame: Phase 2 ──────────┐
│ [Task A]  [Task B]         │  │ [Task C]  [Task D]         │
│    └──────┘                │  │    └──────┘                │
└────────────────────────────┘  └────────────────────────────┘
```

### Using Meta for Planning Data

Store planning-specific data in the `meta` field of shapes. This keeps the diagram valid tldraw while carrying extra semantics:

```json
"meta": {
  "nodeType": "supervisor",
  "phase": "in_progress",
  "agent": "orchestrator-agent",
  "model": "claude-sonnet-4-6",
  "tools": ["Read", "Write", "Bash", "Agent"],
  "description": "Coordinates worker agents and merges results",
  "estimatedTokens": 50000,
  "priority": "high"
}
```

### Color Conventions for Planning

| Phase | Color | Fill |
|-------|-------|------|
| Planned | `grey` | `solid` |
| In Progress | `blue` | `solid` |
| Implemented | `green` | `solid` |
| Needs Revision | `orange` | `solid` |
| Blocked | `red` | `solid` |

| Node Type | Geo | Color |
|-----------|-----|-------|
| Supervisor | `rectangle` | `violet` |
| Worker | `rectangle` | `blue` |
| Human-in-loop | `diamond` | `yellow` |
| Tool Node | `cloud` | `light-blue` |
| Decision | `diamond` | `orange` |
| Start/End | `ellipse` | `green`/`red` |

# Design System

Visual conventions for the visual-planner skill. These rules ensure diagrams are consistent and readable whether viewed in tldraw's canvas or as exported SVGs.

---

## Node Types and Shapes

Each node type maps to a tldraw geo shape. Do not vary shapes — consistency is what makes diagrams scannable.

| Node type | tldraw geo | Color | Notes |
|-----------|-----------|-------|-------|
| `supervisor` | `rectangle` | `violet` | Central coordinator |
| `worker` | `rectangle` | Phase-based (see below) | General agent node |
| `human_checkpoint` | `diamond` | `yellow` | Human approval gate |
| `tool` | `cloud` | `light-blue` | External system/API |
| `decision` | `diamond` | Phase-based | Automated branching point |
| `start` | `ellipse` | `green` | Flow entry point |
| `end` | `ellipse` | `red` | Flow terminal |

### Special Containers

- **Frames** (`frame` type) — Group related nodes (teams, parallel workers). Children are parented to the frame in tldraw. Frame names appear above the frame border.

---

## Phase Indicators

Phases track where a node is in the Plan-Code Loop. Phase determines the color for worker and decision nodes. Supervisor, start, end, human_checkpoint, and tool nodes use fixed role-based colors instead.

| Phase | Worker color | Meaning |
|-------|-------------|---------|
| `planned` | `grey` | Not yet started |
| `in_progress` | `blue` | Currently being built |
| `implemented` | `green` | Working and tested |
| `needs_revision` | `orange` | Needs changes |

### Phase in meta

Every planning node should have `meta.nodeType` and `meta.phase` fields:

```json
{
  "meta": {
    "nodeType": "worker",
    "phase": "implemented",
    "agent": "Parker",
    "model": "sonnet",
    "tools": ["web-search", "summarize"],
    "description": "Handles information gathering"
  }
}
```

---

## Arrow Conventions

Arrows use tldraw's built-in arrow shape with bindings to source and target shapes.

| Arrow type | Style | When to use |
|-----------|-------|-------------|
| Solid black | `dash: "solid"`, `color: "black"` | Primary forward flow |
| Dashed black | `dash: "dashed"`, `color: "black"` | Conditional dispatch (supervisor to worker) |
| Dotted grey | `dash: "dotted"`, `color: "grey"` | Return paths (worker back to supervisor) |
| Dashed orange | `dash: "dashed"`, `color: "orange"` | Rejection/revision loops |

### Arrow Labels

- Dispatch arrows: label with the task type ("Research", "Write", "Code")
- Return arrows: label with the output type ("results", "draft", "output")
- Conditional arrows: label with the condition ("approved", "rejected", "simple query")
- No label needed for obvious sequential connections (start-to-first-node, last-node-to-end)

---

## Color System

tldraw provides 13 named colors. The visual-planner uses a subset with semantic meaning:

### Semantic Color Map

| Color | Usage |
|-------|-------|
| `violet` | Supervisor/coordinator nodes |
| `green` | Start nodes, implemented phase |
| `red` | End nodes |
| `yellow` | Human checkpoint nodes, warning states |
| `light-blue` | Tool/external system nodes |
| `blue` | In-progress phase |
| `grey` | Planned phase (default for workers) |
| `orange` | Needs-revision phase, rejection arrows |
| `black` | Default arrow color |

### Fill Convention

Use `solid` fill for all planning nodes. This gives them a tinted background that makes them visually distinct from empty shapes a user might draw.

---

## Layout Constants

Standard spacing for agent workflow diagrams:

| Dimension | Value |
|-----------|-------|
| Node width | 200px (workers), 220px (supervisors) |
| Node height | 80px (standard), 120px (diamonds) |
| Start/end size | 60x60px |
| Vertical gap | 60-80px between tiers |
| Horizontal gap | 50px between siblings |
| Frame padding | 20px inside frames |

### Tier Layout

```
Tier 0: Start node (ellipse, centered)
Tier 1: Supervisor (rectangle, centered)
Tier 2: Workers (rectangles, fanned out horizontally)
Tier 3: Human checkpoint (diamond, centered)
Tier 4: End node (ellipse, centered)
```

Not every diagram has all tiers. Adjust based on the pattern.

---

## Sticky Note Annotations

Use tldraw's built-in note shape for annotations. Notes are for design decisions, implementation hints, and discovery observations — not for node labels.

Good uses for sticky notes:
- "Use lightweight intent classifier for routing"
- "This stage needs retry logic with exponential backoff"
- "Blocked on API access — talk to infra team"

Place notes near the relevant node but not overlapping it.

---

## Legend

Every diagram must include a legend. Use a frame named "Legend" positioned below the main diagram content, containing miniature examples of each shape/color/line style used.

```json
{ "_type": "frame", "shapeId": "legend", "name": "Legend", "children": ["legend_supervisor", "legend_worker", ...] }
```

Inside the legend frame, place small labeled shapes (w: 120, h: 40) showing what each color/shape combination means. Keep it compact — 2 columns max.

---

## Quality Checklist

Before considering a diagram complete:

**Structure**
- [ ] Every planning node has `meta.nodeType` and `meta.phase`
- [ ] Every conditional arrow has a label
- [ ] Every rejection/loop-back arrow has a label
- [ ] Start/end nodes present when the flow has clear entry/exit
- [ ] `validate.ts` passes with no errors

**Visual**
- [ ] Node colors follow the semantic color map above
- [ ] Arrow styles follow the convention table above
- [ ] Frames used for team grouping (not ad-hoc rectangles)
- [ ] No overlapping nodes or arrows crossing through unrelated nodes

**Content**
- [ ] Diagram name (in document record) describes the actual system
- [ ] Node labels are meaningful, not placeholder text
- [ ] Agent names and tool lists are accurate if populated
- [ ] Description fields explain what each node does, not just its label

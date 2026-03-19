---
name: visual-planner
version: 0.2.4
description: This skill should be used when the user asks to "plan a workflow", "diagram an agent system", "visualize an architecture", "map out a pipeline", "create a flow diagram", "draw agent connections", "design a multi-agent system", "show how agents interact", "make a system diagram", "visualize a data pipeline", "map out a process", "diagram my workflow", "create an architecture diagram", "plan agent orchestration", "brainstorm a system design", "show the flow between components", "interactive workflow diagram", "workflow canvas", "visual-planner", "open in tldraw", or "plan this project visually". Produces tldraw .tldr diagrams natively — the standard infinite canvas format. Includes a thin playground wrapper with planning-specific UI (phase controls, agent assignment, KPI bar, agent callback bridge) and an "Open in tldraw" button for standalone editing.
---

# Visual Planner

Create visual workflow diagrams using tldraw's `.tldr` format. Covers agent orchestration, data pipelines, system architecture, and any multi-step process. Diagrams open in a playground app built on the tldraw React component — no iframe, no external service.

## Architecture

The visual planner generates `.tldr` files directly. tldraw is embedded as an npm package (`bun add tldraw`) in our playground app — a React component with full programmatic API access.

```
visual-planner/
├── SKILL.md                          # This file
├── assets/
│   ├── supervisor.tldr               # Template diagrams
│   ├── hierarchical.tldr
│   └── pipeline.tldr
├── scripts/
│   ├── create_diagram.ts             # Headless: generate .tldr from description
│   ├── render_svg.ts                 # .tldr → polished SVG export
│   ├── validate.ts                   # Validate planning shapes in .tldr
│   ├── stats.ts                      # KPI summary from .tldr
│   └── playground_server.ts          # Launch playground (tldraw + planning UI)
├── playground/                       # tldraw-based canvas app
│   ├── package.json                  # tldraw + minimal deps
│   └── src/
│       ├── shapes/PlannerNodeShape.ts # Custom shape with phase/agent/tools
│       └── components/               # KPIBar, PlanningPanel, AgentBridge
└── references/
    ├── tldraw-format.md              # Complete .tldr schema reference
    ├── tldraw-mcp.md                 # MCP internals, focused shape format
    ├── workflow-patterns.md          # Agent orchestration patterns
    └── design-system.md              # Planning visual conventions
```

## When to Use

- Designing or documenting a multi-agent system
- Mapping a data pipeline with branching and parallel stages
- Planning system architecture before implementation
- Running a Plan-Code Loop: tracking which nodes are planned, in progress, implemented, or need revision
- Any time a workflow needs to be communicated visually

## Phase 1: Discovery & Diagram Design

**Read `references/diagram-thinking.md` before starting.** The biggest source of bad diagrams is skipping the design reasoning and jumping straight to shapes.

### Step 1a: Define the Diagram's Question

Before gathering any nodes/edges, define the **single question** this diagram answers. If the question contains "and", you need multiple diagrams.

Examples:
- "How do requests flow from a visitor to the right bot?" (good — one question)
- "Show the whole system architecture and the data flow" (bad — two questions, two diagrams)

### Step 1b: Choose Abstraction Level

Pick one C4 level per diagram:
- **Context** (L1): The system as one box + its external world. 4-6 nodes.
- **Container** (L2): Deployable units (bots, APIs, databases). 8-15 nodes. **Default for agent systems.**
- **Component** (L3): Internals of one container. 6-10 nodes.

### Step 1c: Gather the Graph

Ask (one round, then generate):

1. **Purpose** — What does this system do? Who is the audience for this diagram?
2. **Nodes** — What are the main components at the chosen abstraction level? For each: name, responsibility, type (supervisor, worker, human checkpoint, tool, external system).
3. **Edges** — How do nodes connect? Choose one arrow semantic: data flow, control flow, or dependency. What's the happy path spine?
4. **Groupings** — What nodes belong together? Use frames for teams, deployment zones, or domain boundaries.
5. **Fan trap check** — Does any node connect to 5+ others? If so, add intermediate groupings.
6. **Phase tracking** — Is this for active development? Assign phases: `planned`, `in_progress`, `implemented`, `needs_revision`.

### Step 1d: Plan Visual Design

Before writing shapes JSON:
- **Estimate node count.** Target 7-12. If 13+, plan frame groupings. If 20+, split into multiple diagrams.
- **Identify the happy path.** This should form a clear top-to-bottom or left-to-right spine.
- **Plan the legend.** What do your colors, shapes, and line styles mean?
- **Use arrow styling hierarchy.** Solid for primary flow, dashed for conditional, dotted for return/monitoring. See `references/design-system.md`.
- **Plan sticky notes.** Use `note` shapes for context like "30-min TTL", "Uses Claude Sonnet 4.6", "Needs retry logic" — don't cram everything into node labels.

For agent systems, check if nodes map to the bopen-tools roster. Assign the `agent` field when there is a clear match.

See `references/workflow-patterns.md` for common topologies and `references/diagram-thinking.md` for the full design reasoning guide.

## Phase 2: Generate .tldr

Translate the discovery conversation into a `.tldr` file using the `create_diagram.ts` script. Place the file in the project: `<project-dir>/docs/architecture/workflow.tldr`.

The script handles all the hard parts: arrow bindings, richText wrapping, fractional indices from `@tldraw/utils`, and auto-layout via dagre. You describe nodes and edges — the tooling produces a correct diagram.

### Step 2a: Define the Graph Structure

Write a focused shapes JSON array with nodes and edges. You can omit `x`/`y` when using `--layout auto`:

```json
[
  { "_type": "rectangle", "shapeId": "supervisor", "w": 200, "h": 80, "color": "violet", "fill": "solid", "text": "Supervisor" },
  { "_type": "rectangle", "shapeId": "worker_a", "w": 200, "h": 80, "color": "blue", "fill": "solid", "text": "Code Writer" },
  { "_type": "rectangle", "shapeId": "worker_b", "w": 200, "h": 80, "color": "blue", "fill": "solid", "text": "Reviewer" },
  { "_type": "arrow", "shapeId": "a1", "fromId": "supervisor", "toId": "worker_a", "color": "black", "text": "delegate" },
  { "_type": "arrow", "shapeId": "a2", "fromId": "supervisor", "toId": "worker_b", "color": "black", "text": "review" }
]
```

Save as `shapes.json`.

### Step 2b: Generate with Auto-Layout

```bash
bun run ${SKILL_DIR}/scripts/create_diagram.ts \
  --input shapes.json \
  --output <project-dir>/docs/architecture/workflow.tldr \
  --layout auto \
  --name "My Workflow"
```

The `--layout auto` flag runs dagre (top-to-bottom DAG layout) and computes all node positions automatically. Use this whenever the diagram has more than 2-3 nodes or you don't want to compute coordinates manually.

The script **auto-validates** the output after writing. Validation results are printed to stderr. The script exits with code 1 if there are errors — fix them before opening the playground. Pass `--no-validate` to skip validation.

To skip the separate playground launch step, add `--open`:

```bash
bun run ${SKILL_DIR}/scripts/create_diagram.ts \
  --input shapes.json \
  --output <project-dir>/docs/architecture/workflow.tldr \
  --layout auto \
  --open
```

This generates the diagram, validates it, and launches the playground in one step.

### Manual Layout (Precise Positioning)

When you need exact control over positions, provide `x`/`y` for every shape and use `--layout manual` (the default):

```bash
bun run ${SKILL_DIR}/scripts/create_diagram.ts \
  --input shapes.json \
  --output workflow.tldr
```

Spacing constants for manual layouts:

| Element | Size |
|---------|------|
| Node width | 200 px |
| Node height | 80 px |
| Horizontal gap | 150 px |
| Vertical gap | 120 px |
| Frame padding | 40 px |

Prefer `kind: "arc"` arrows (the default). Only use `kind: "elbow"` when nodes have at least 80 px of gap for routing headroom.

### Node Mapping

| Node concept | _type | color | fill | size |
|-------------|-------|-------|------|------|
| Supervisor / Primary | `rectangle` | `violet` | `solid` | 220x80 |
| Worker | `rectangle` | `blue` | `solid` | 200x80 |
| Human-in-loop | `diamond` | `yellow` | `solid` | 160x100 |
| Tool/API/External | `cloud` | `light-blue` | `solid` | 200x80 |
| Decision | `diamond` | `orange` | `solid` | 160x100 |
| Start | `ellipse` | `green` | `solid` | 60x60 |
| End | `ellipse` | `red` | `solid` | 60x60 |
| Annotation | `note` | `yellow` | — | auto-sized |
| Standalone label | `text` | `black` | — | auto-sized |
| External system (out of scope) | `rectangle` | `grey` | `semi` | 160x60 |

### Arrow Styling

Use dash patterns and colors to create visual hierarchy:

| Relationship | dash | color | When to use |
|-------------|------|-------|-------------|
| Primary flow | `solid` | `black` | Happy path, main request flow |
| Conditional dispatch | `dashed` | `black` | Supervisor routing to workers |
| Return / response | `dotted` | `grey` | Worker reporting results back |
| Error / rejection | `dashed` | `orange` | Failed validation, loop-back |
| Async / event-driven | `dashed` | `blue` | Message queue, webhooks |
| Monitoring / heartbeat | `dotted` | `light-blue` | Health checks, metrics, crons |

### Phase Colors

| Phase | color |
|-------|-------|
| Planned | `grey` |
| In Progress | `blue` |
| Implemented | `green` |
| Needs Revision | `orange` |

### Planning Metadata in `note` / `meta`

Pass planning-specific data via the `note` field (stored in `meta.note`) or directly embed `meta` keys using raw `.tldr`. The `note` field is the simplest way to annotate shapes in focused format:

```json
{ "_type": "rectangle", "shapeId": "supervisor", "w": 200, "h": 80, "color": "violet", "fill": "solid", "text": "Supervisor",
  "note": "phase:in_progress | agent:orchestrator | model:claude-sonnet-4" }
```

### Using Frames for Organization

Group related nodes into frames. List child shape IDs in the `children` array. With `--layout auto`, the frame is sized automatically to contain its children:

```json
[
  { "_type": "frame", "shapeId": "phase1", "name": "Phase 1: Setup", "children": ["setup_a", "setup_b"] },
  { "_type": "rectangle", "shapeId": "setup_a", "w": 200, "h": 80, "color": "blue", "fill": "solid", "text": "Task A" },
  { "_type": "rectangle", "shapeId": "setup_b", "w": 200, "h": 80, "color": "blue", "fill": "solid", "text": "Task B" }
]
```

See `references/tldraw-best-practices.md` for arrow binding internals, valid style values, fractional indexing details, and raw `.tldr` pitfalls (only relevant if you write `.tldr` JSON directly instead of using focused shapes).

## Phase 3: Open in Playground (REQUIRED)

**IMPORTANT: The playground is the primary output of this skill. ALWAYS launch the playground after generating a .tldr file. Do NOT fall back to rendering an SVG — the whole point is the interactive tldraw canvas.**

If you used `--open` with `create_diagram.ts`, the playground is already launching. Otherwise, start it manually:

```bash
bun run ${SKILL_DIR}/scripts/playground_server.ts --file <project-dir>/docs/architecture/workflow.tldr
```

Dependencies are auto-installed on first run. The playground opens in the browser automatically. If port 3458 is already in use, the server will attempt to free it or pick the next available port.

The playground provides:
- Full tldraw canvas (drag, zoom, draw, edit shapes)
- Planning panel: phase selector, agent assignment, model/tools config
- KPI bar: node counts by phase, completion percentage
- **Save button** (normal mode): writes diagram state back to the `.tldr` file; user then tells the agent about changes
- **Send to Agent button** (async mode, `--wait-signal`): returns diagram state inline to the waiting agent
- "Open in tldraw" button: opens the `.tldr` file in standalone tldraw for full editing
- MCP connectivity indicator: shows whether tldraw MCP server is available (optional, not required)

### Playground Interaction Modes

The playground shows a different action button depending on how it was launched:

**Normal mode** (default — no `--wait-signal`):

The bottom-right button says **"Save"**. Clicking it writes the current diagram state back to the `.tldr` file. A brief "Saved to file" confirmation appears. After saving, the user can simply tell the agent: "I saved my changes" or "it looks correct to me", and the agent can re-read the `.tldr` file to pick up the updates.

**Async mode** (`--wait-signal` — agent awaiting callback):

The bottom-right button says **"Send to Agent"**. Clicking it POSTs the updated state to `/api/signal`, which triggers the `playground_server.ts` watcher to read the `.tldr` file and return its contents to the waiting agent inline. The server then exits. This is the agent callback bridge for plan-edit-continue loops.

The mode is detected via the `NEXT_PUBLIC_WAIT_SIGNAL` env var set by `playground_server.ts` when launched with `--wait-signal`.

### Export (Optional, Secondary)

SVG export is available but is NOT the primary output. Only use for sharing static snapshots:

```bash
# Export to SVG (optional — for static sharing only)
bun run ${SKILL_DIR}/scripts/render_svg.ts --input workflow.tldr --output workflow.svg

# Get KPI summary
bun run ${SKILL_DIR}/scripts/stats.ts --input workflow.tldr
```

## Plan-Code Loop

As implementation progresses, update node phases by editing the `.tldr` file or using the playground. Phase changes are the primary feedback mechanism between design and implementation.

1. Agent reads `workflow.tldr`, identifies `planned` nodes
2. Agent implements the node's functionality
3. Agent updates the node's `meta.phase` to `implemented` and changes `color` to `green`
4. Re-open playground to review progress

## Project Artifact Structure

```
<project-dir>/docs/architecture/
├── workflow.tldr             # Source of truth (.tldr format)
├── workflow.svg              # Exported SVG (optional)
└── background.png            # Gemini-generated background (optional)
```

The `.tldr` file is the source of truth. The playground reads from it and writes back to it.

## Focused Shape Format (Simplified API)

For programmatic diagram creation, use the focused shape format — a simplified JSON that's much easier to generate than raw `.tldr` records. The `create_diagram.ts` script accepts focused shapes and handles all the conversion (bindings, rich text wrapping, ID prefixing) automatically.

This is the same format used by the official tldraw MCP. See `references/tldraw-mcp.md` for the complete focused shape spec.

### Quick Example

With auto-layout — no coordinates needed:

```json
[
  { "_type": "rectangle", "shapeId": "supervisor", "w": 220, "h": 80, "color": "violet", "fill": "tint", "text": "Supervisor", "note": "Routes tasks to workers" },
  { "_type": "rectangle", "shapeId": "worker", "w": 200, "h": 80, "color": "blue", "fill": "tint", "text": "Worker" },
  { "_type": "arrow", "shapeId": "a1", "fromId": "supervisor", "toId": "worker", "color": "black", "text": "delegate" }
]
```

```bash
bun run ${SKILL_DIR}/scripts/create_diagram.ts --input shapes.json --output workflow.tldr --layout auto
```

Key simplifications vs raw `.tldr`:
- Arrows use `fromId`/`toId` — bindings are auto-created (correct format, correct binding records)
- Bound arrows don't need `x1,y1,x2,y2` — tldraw computes position from bindings
- Text is a plain string — no richText wrapper needed
- Shape IDs don't need the `shape:` prefix
- With `--layout auto`, `x`/`y` are ignored — dagre positions everything
- Frames auto-parent children via `children` array (or containment detection in manual mode)

## Reference Files

- **`references/diagram-thinking.md`** — **Read first.** How to reason about what to draw: abstraction levels, entity selection, visual hierarchy, information density, legends. The design primer.
- **`references/tldraw-best-practices.md`** — Arrow binding internals, dagre layout usage, valid style values, fractional indexing, richText format. Read this before generating diagrams programmatically.
- **`references/tldraw-format.md`** — Complete .tldr schema: every shape type, bindings, rich text, style enums, layout patterns, and a working example
- **`references/tldraw-mcp.md`** — How the official tldraw MCP works, focused shape format spec, fill/color/geo mappings. Our skill provides equivalent functionality without requiring the MCP server
- **`references/workflow-patterns.md`** — Supervisor, hierarchical, pipeline, peer-to-peer, and human-in-loop patterns with layout recommendations
- **`references/design-system.md`** — Planning visual conventions, phase indicators, color system

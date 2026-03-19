# Rendering Guide

Technical reference for scripts, the playground server, and exporting assets. All tools work with tldraw's `.tldr` format.

---

## Scripts Overview

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `create_diagram.ts` | Focused-shape JSON to .tldr | JSON (stdin or file) | `.tldr` file |
| `render_svg.ts` | .tldr to SVG export | `.tldr` file | `.svg` file |
| `validate.ts` | Check planning metadata | `.tldr` file | Issue report |
| `stats.ts` | KPI summary | `.tldr` file | Stats (text or JSON) |
| `playground_server.ts` | Launch tldraw playground | `.tldr` file | Dev server |

---

## create_diagram.ts — CLI Reference

Converts focused-shape JSON (the simplified format from tldraw MCP) into valid `.tldr` files. Handles arrow bindings, rich text wrapping, ID prefixing, color normalization, fill mapping, and frame containment.

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/skills/visual-planner/scripts/create_diagram.ts [options]
```

### Input

Accepts focused-shape JSON via `--input <file>` or stdin pipe. The focused-shape format is documented in `references/tldraw-mcp.md`.

### Options

| Flag | Description |
|------|-------------|
| `--input <path>` | Path to focused-shape JSON file |
| `--output <path>` | Output .tldr file path |
| `--name <string>` | Diagram name (stored in document record) |
| `--template <name>` | Copy a template from assets/ instead of converting (supervisor, pipeline, hierarchical) |

### Examples

```bash
# Pipe focused shapes from stdin
echo '[{"_type":"rectangle","shapeId":"a","x":0,"y":0,"w":200,"h":80,"color":"blue","text":"Node"}]' \
  | bun run scripts/create_diagram.ts --output diagram.tldr

# Convert from file
bun run scripts/create_diagram.ts --input shapes.json --output diagram.tldr --name "My System"

# Start from a template
bun run scripts/create_diagram.ts --template supervisor --output project/docs/architecture/workflow.tldr
```

---

## render_svg.ts — CLI Reference

Exports a `.tldr` diagram to clean SVG. Renders geo shapes (rectangles, ellipses, diamonds, clouds), arrows with markers, frames, notes, and phase indicator dots.

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/skills/visual-planner/scripts/render_svg.ts --input <file.tldr> [--output <file.svg>]
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--input <path>` | required | Input .tldr file |
| `--output <path>` | same name with .svg | Output .svg file |

### Example

```bash
bun run scripts/render_svg.ts --input project/docs/architecture/workflow.tldr
# Produces project/docs/architecture/workflow.svg
```

The SVG is standalone — suitable for GitHub READMEs, documentation, or Figma import.

---

## validate.ts — CLI Reference

Validates planning metadata in `.tldr` files. Checks nodeType values, phase values, phase/color consistency, arrow bindings, and label presence.

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/skills/visual-planner/scripts/validate.ts <file.tldr> [--strict] [--json]
```

### Options

| Flag | Description |
|------|-------------|
| `--strict` | Treat warnings as errors (exit 1 on any issue) |
| `--json` | Output results as JSON |

### Exit Codes

- `0` — No errors (warnings may be present)
- `1` — Errors found (or any issues with `--strict`)

### What It Checks

- `document:document` and page records exist
- Geo shapes have `meta.nodeType` (warning if missing)
- `meta.nodeType` is one of: `supervisor`, `worker`, `human_checkpoint`, `tool`, `decision`, `start`, `end`
- `meta.phase` is one of: `planned`, `in_progress`, `implemented`, `needs_revision`
- Phase/color consistency for worker and decision nodes (supervisor, start, end, human_checkpoint, and tool nodes use role-based colors that override phase colors)
- Arrow shapes have both start and end bindings
- Shapes have label text

---

## stats.ts — CLI Reference

Extracts KPI summary from a `.tldr` workflow diagram.

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/skills/visual-planner/scripts/stats.ts <file.tldr> [--json]
```

### Output

```
Diagram: Supervisor Pattern
Shapes: 18 total (7 planning nodes, 10 arrows, 0 frames)

By Phase:
  implemented      ## 2
  in_progress      # 1
  planned          #### 4

By Node Type:
  end                  1
  human_checkpoint     1
  start                1
  supervisor           1
  worker               3

Completion: 29%
Agents: Flow, Parker, Sachmo, Theo
```

With `--json`, outputs a structured object with `name`, `totalShapes`, `planningNodes`, `arrows`, `frames`, `byPhase`, `byNodeType`, `completion`, and `agents` fields.

---

## Playground Server

The playground launches a tldraw-based infinite canvas for interactive editing of `.tldr` files.

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/skills/visual-planner/scripts/playground_server.ts --file <path.tldr> [--port=3458] [--no-open]
```

Default port: `3458`. Opens the browser automatically unless `--no-open` is passed.

### Architecture

- **Canvas**: tldraw React component with full editing (drag, zoom, draw, edit shapes, add arrows, etc.)
- **Planning Overlay**: Floating glass panel on top of tldraw with:
  - Diagram name (top-left)
  - KPI phase chips with completion % (top-right)
  - "Send to Agent" button (bottom-right)
- **API routes**:
  - `GET /api/workflow` — Returns the .tldr JSON
  - `POST /api/workflow` — Saves .tldr JSON back to file
  - `POST /api/signal` — Agent callback bridge (saves snapshot, returns `{ ok: true }`)

### Agent Callback Bridge

The "Send to Agent" button POSTs the current editor snapshot to `/api/signal`, which writes it back to the `TLDR_FILE`. The calling agent script can then read the updated file to get the user's edits.

### Capabilities

tldraw provides all canvas interaction out of the box:
- Pan, zoom, select, multi-select
- Draw shapes, arrows, text, notes, frames
- Move, resize, rotate, group
- Undo/redo, copy/paste
- Built-in keyboard shortcuts (see tldraw docs)

---

## Artifact Contract

The playground and server code live in the plugin. The user project owns only the data file.

Recommended project-owned artifacts:

- `workflow.tldr` — Editable source of truth (tldraw format)
- `workflow.svg` — Committed diagram artifact (generated by `render_svg.ts`)

---

## Troubleshooting

**Playground port already in use**
Pass `--port <number>` to use a different port.

**File not found on playground start**
The `--file` path must point to an existing `.tldr` file. Use `create_diagram.ts --template <name>` to bootstrap one.

**Validation errors on old files**
Old node types `tool_node` and `human_in_loop` were renamed to `tool` and `human_checkpoint`. Update the `meta.nodeType` values in the .tldr file.

**SVG looks wrong**
The SVG renderer is a simplified export. For full-fidelity rendering, use the playground. The SVG is intended for documentation embedding, not pixel-perfect reproduction.

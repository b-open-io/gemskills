# Workflow Patterns

Reference for common agent orchestration topologies. Each pattern includes when to use it, layout recommendation, and a focused-shape example that can be piped directly to `create_diagram.ts`.

---

## 1. Supervisor Pattern

### When to Use

A single coordinator agent receives all input and routes tasks to specialized workers. Workers report back to the supervisor; the supervisor decides what to do next.

Use when:
- There is one logical entry point for all requests
- Routing logic belongs in one place
- Workers are specialized and not aware of each other

### Layout

Supervisor at top center, workers fanned out below. Arrows flow down (assignment) and back up (result). Use dashed arrows for dispatch, dotted for returns.

### Focused-Shape Example

```json
[
  { "_type": "ellipse", "shapeId": "start", "x": 350, "y": 0, "w": 60, "h": 60, "color": "green", "fill": "tint", "text": "Start", "meta": { "nodeType": "start", "phase": "implemented" } },
  { "_type": "rectangle", "shapeId": "supervisor", "x": 280, "y": 120, "w": 220, "h": 80, "color": "violet", "fill": "tint", "text": "Supervisor", "meta": { "nodeType": "supervisor", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "researcher", "x": 50, "y": 300, "w": 200, "h": 80, "color": "grey", "fill": "tint", "text": "Researcher", "meta": { "nodeType": "worker", "phase": "planned", "agent": "Parker" } },
  { "_type": "rectangle", "shapeId": "writer", "x": 300, "y": 300, "w": 200, "h": 80, "color": "grey", "fill": "tint", "text": "Writer", "meta": { "nodeType": "worker", "phase": "planned", "agent": "Flow" } },
  { "_type": "rectangle", "shapeId": "coder", "x": 550, "y": 300, "w": 200, "h": 80, "color": "grey", "fill": "tint", "text": "Coder", "meta": { "nodeType": "worker", "phase": "planned", "agent": "Theo" } },
  { "_type": "arrow", "shapeId": "a1", "fromId": "start", "toId": "supervisor" },
  { "_type": "arrow", "shapeId": "a2", "fromId": "supervisor", "toId": "researcher", "text": "Research", "dash": "dashed" },
  { "_type": "arrow", "shapeId": "a3", "fromId": "supervisor", "toId": "writer", "text": "Write", "dash": "dashed" },
  { "_type": "arrow", "shapeId": "a4", "fromId": "supervisor", "toId": "coder", "text": "Code", "dash": "dashed" },
  { "_type": "arrow", "shapeId": "a5", "fromId": "researcher", "toId": "supervisor", "text": "results", "color": "grey", "dash": "dotted" },
  { "_type": "arrow", "shapeId": "a6", "fromId": "writer", "toId": "supervisor", "text": "draft", "color": "grey", "dash": "dotted" },
  { "_type": "arrow", "shapeId": "a7", "fromId": "coder", "toId": "supervisor", "text": "output", "color": "grey", "dash": "dotted" }
]
```

### Notes

- Dispatch arrows use `dashed` to signal conditional routing
- Return arrows use `dotted` and grey to visually recede behind the forward flow
- Add a `tool` node (cloud shape) for any external API the supervisor calls before routing (e.g., classifier model)

See `assets/supervisor.tldr` for the full .tldr version with human review gate.

---

## 2. Hierarchical Teams Pattern

### When to Use

Multiple supervisors, each managing their own team. A top-level orchestrator coordinates between teams. Teams are represented as tldraw frames.

Use when:
- The system has two or more distinct domains (e.g., research team, writing team)
- Each domain has its own routing logic
- A top-level agent assigns work to teams, not individual workers

### Layout

Top-level orchestrator at top. Frame containers for each team below. Team leads and workers inside their respective frames.

### Focused-Shape Example

```json
[
  { "_type": "rectangle", "shapeId": "orchestrator", "x": 300, "y": 0, "w": 220, "h": 80, "color": "violet", "fill": "tint", "text": "Orchestrator", "meta": { "nodeType": "supervisor", "phase": "planned" } },
  { "_type": "frame", "shapeId": "research-team", "x": 20, "y": 150, "w": 400, "h": 250, "name": "Research Team" },
  { "_type": "rectangle", "shapeId": "research-lead", "x": 40, "y": 180, "w": 180, "h": 70, "color": "violet", "fill": "tint", "text": "Research Lead", "meta": { "nodeType": "supervisor", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "searcher", "x": 40, "y": 290, "w": 160, "h": 70, "color": "grey", "fill": "tint", "text": "Web Searcher", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "reader", "x": 240, "y": 290, "w": 160, "h": 70, "color": "grey", "fill": "tint", "text": "Doc Reader", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "frame", "shapeId": "writing-team", "x": 460, "y": 150, "w": 400, "h": 250, "name": "Writing Team" },
  { "_type": "rectangle", "shapeId": "writing-lead", "x": 480, "y": 180, "w": 180, "h": 70, "color": "violet", "fill": "tint", "text": "Writing Lead", "meta": { "nodeType": "supervisor", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "drafter", "x": 480, "y": 290, "w": 160, "h": 70, "color": "grey", "fill": "tint", "text": "Drafter", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "editor", "x": 680, "y": 290, "w": 160, "h": 70, "color": "grey", "fill": "tint", "text": "Editor", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "arrow", "shapeId": "a1", "fromId": "orchestrator", "toId": "research-lead", "text": "research brief", "dash": "dashed" },
  { "_type": "arrow", "shapeId": "a2", "fromId": "orchestrator", "toId": "writing-lead", "text": "write brief", "dash": "dashed" },
  { "_type": "arrow", "shapeId": "a3", "fromId": "research-lead", "toId": "orchestrator", "text": "report", "color": "grey", "dash": "dotted" },
  { "_type": "arrow", "shapeId": "a4", "fromId": "writing-lead", "toId": "orchestrator", "text": "draft", "color": "grey", "dash": "dotted" }
]
```

### Notes

- Teams are represented as tldraw frames — shapes whose center falls within the frame bounds are automatically parented to the frame
- Inter-team edges connect team leads, not opaque team blocks — this shows actual control flow
- See `assets/hierarchical.tldr` for the full version

---

## 3. Peer-to-Peer Pattern

### When to Use

Agents pass control directly to each other without a central coordinator. Each agent knows which agent to call next.

Use when:
- The sequence is mostly deterministic
- Adding a supervisor would be unnecessary overhead
- Agents are designed as a chain, each transforming the payload

### Layout

Left-to-right or top-to-bottom chain. Conditional branches shown as forking arrows.

### Focused-Shape Example

```json
[
  { "_type": "rectangle", "shapeId": "intake", "x": 0, "y": 0, "w": 180, "h": 70, "color": "grey", "fill": "tint", "text": "Intake Agent", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "classifier", "x": 250, "y": 0, "w": 180, "h": 70, "color": "grey", "fill": "tint", "text": "Classifier", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "enricher", "x": 500, "y": 0, "w": 180, "h": 70, "color": "grey", "fill": "tint", "text": "Enricher", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "responder", "x": 500, "y": 120, "w": 180, "h": 70, "color": "grey", "fill": "tint", "text": "Responder", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "arrow", "shapeId": "a1", "fromId": "intake", "toId": "classifier" },
  { "_type": "arrow", "shapeId": "a2", "fromId": "classifier", "toId": "enricher" },
  { "_type": "arrow", "shapeId": "a3", "fromId": "classifier", "toId": "responder", "text": "simple query", "dash": "dashed", "color": "yellow" },
  { "_type": "arrow", "shapeId": "a4", "fromId": "enricher", "toId": "responder" }
]
```

### Notes

- Use solid arrows for the primary path, dashed for conditional short-circuits
- Show the happy path with key deviations — don't diagram every permutation

---

## 4. Pipeline Pattern

### When to Use

A linear sequence of processing stages. Analogous to Unix pipes or ETL pipelines.

Use when:
- Data flows in one direction with minimal branching
- Each stage has a single responsibility
- Order of operations matters

### Layout

Top-to-bottom vertical flow. Cloud shapes for external data sources/sinks. Diamond for validation gates.

### Focused-Shape Example

```json
[
  { "_type": "ellipse", "shapeId": "start", "x": 300, "y": 0, "w": 60, "h": 60, "color": "green", "fill": "tint", "text": "Start", "meta": { "nodeType": "start", "phase": "planned" } },
  { "_type": "cloud", "shapeId": "ingestion", "x": 230, "y": 120, "w": 200, "h": 100, "color": "light-blue", "fill": "tint", "text": "Data Ingestion", "meta": { "nodeType": "tool", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "processing", "x": 230, "y": 280, "w": 200, "h": 80, "color": "grey", "fill": "tint", "text": "Processor", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "diamond", "shapeId": "validation", "x": 230, "y": 430, "w": 200, "h": 120, "color": "yellow", "fill": "tint", "text": "Validate", "meta": { "nodeType": "human_checkpoint", "phase": "planned" } },
  { "_type": "cloud", "shapeId": "output", "x": 230, "y": 610, "w": 200, "h": 100, "color": "light-blue", "fill": "tint", "text": "Output", "meta": { "nodeType": "tool", "phase": "planned" } },
  { "_type": "ellipse", "shapeId": "end", "x": 300, "y": 770, "w": 60, "h": 60, "color": "red", "fill": "tint", "text": "End", "meta": { "nodeType": "end", "phase": "planned" } },
  { "_type": "arrow", "shapeId": "a1", "fromId": "start", "toId": "ingestion" },
  { "_type": "arrow", "shapeId": "a2", "fromId": "ingestion", "toId": "processing", "text": "Raw data" },
  { "_type": "arrow", "shapeId": "a3", "fromId": "processing", "toId": "validation", "text": "Processed" },
  { "_type": "arrow", "shapeId": "a4", "fromId": "validation", "toId": "output", "text": "Approved" },
  { "_type": "arrow", "shapeId": "a5", "fromId": "output", "toId": "end" },
  { "_type": "arrow", "shapeId": "a6", "fromId": "validation", "toId": "processing", "text": "Rejected", "color": "orange", "dash": "dashed" }
]
```

### Notes

- `tool` nodes (cloud shape) for external systems — distinguishes infrastructure from logic
- Rejection loops use dashed orange arrows to visually separate them from the forward path
- See `assets/pipeline.tldr` for the full version

---

## 5. Human-in-Loop Pattern

### When to Use

A human reviewer or approver is part of the workflow. The system pauses at checkpoints for human judgment.

Use when:
- High-stakes decisions require sign-off
- Output quality needs human verification
- Compliance or legal reasons require human approval
- The system is semi-autonomous

### Layout

Diamond shape for human checkpoints (visually distinct from rectangular agent nodes). Two outgoing arrows: approved (forward) and rejected (loop-back).

### Focused-Shape Example

```json
[
  { "_type": "rectangle", "shapeId": "agent", "x": 0, "y": 0, "w": 200, "h": 80, "color": "grey", "fill": "tint", "text": "Drafting Agent", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "diamond", "shapeId": "review", "x": 0, "y": 150, "w": 200, "h": 120, "color": "yellow", "fill": "tint", "text": "Human Review", "meta": { "nodeType": "human_checkpoint", "phase": "planned", "description": "Reviewer checks draft before publishing" } },
  { "_type": "rectangle", "shapeId": "publisher", "x": 0, "y": 340, "w": 200, "h": 80, "color": "green", "fill": "tint", "text": "Publisher", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "arrow", "shapeId": "a1", "fromId": "agent", "toId": "review", "text": "submit for review" },
  { "_type": "arrow", "shapeId": "a2", "fromId": "review", "toId": "publisher", "text": "approved" },
  { "_type": "arrow", "shapeId": "a3", "fromId": "review", "toId": "agent", "text": "revision requested", "color": "orange", "dash": "dashed" }
]
```

### Notes

- Every human checkpoint should have a `description` in meta explaining what the human reviews
- Always show both outgoing paths (approved and rejected) — omitting rejection misrepresents the flow
- Use `human_checkpoint` nodeType with diamond geo and yellow color
- Add sticky notes for SLA or turnaround time expectations

---

## 6. Parallel Execution Pattern

### When to Use

Multiple agents run concurrently. A merge step collects results. Analogous to `Promise.all`.

Use when:
- Independent subtasks can run simultaneously
- Latency matters and sequential execution would be wasteful
- Fan-out/fan-in pattern is needed

### Layout

Dispatcher at top, parallel workers in a row, merger below. Use a tldraw frame to visually group the parallel workers.

### Focused-Shape Example

```json
[
  { "_type": "rectangle", "shapeId": "dispatcher", "x": 250, "y": 0, "w": 200, "h": 80, "color": "violet", "fill": "tint", "text": "Dispatcher", "meta": { "nodeType": "supervisor", "phase": "planned" } },
  { "_type": "frame", "shapeId": "parallel", "x": 20, "y": 130, "w": 660, "h": 130, "name": "Parallel Workers" },
  { "_type": "rectangle", "shapeId": "web", "x": 40, "y": 160, "w": 180, "h": 70, "color": "grey", "fill": "tint", "text": "Web Search", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "db", "x": 260, "y": 160, "w": 180, "h": 70, "color": "grey", "fill": "tint", "text": "DB Lookup", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "doc", "x": 480, "y": 160, "w": 180, "h": 70, "color": "grey", "fill": "tint", "text": "Doc Scan", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "rectangle", "shapeId": "merger", "x": 250, "y": 310, "w": 200, "h": 80, "color": "grey", "fill": "tint", "text": "Merger", "meta": { "nodeType": "worker", "phase": "planned" } },
  { "_type": "arrow", "shapeId": "a1", "fromId": "dispatcher", "toId": "web" },
  { "_type": "arrow", "shapeId": "a2", "fromId": "dispatcher", "toId": "db" },
  { "_type": "arrow", "shapeId": "a3", "fromId": "dispatcher", "toId": "doc" },
  { "_type": "arrow", "shapeId": "a4", "fromId": "web", "toId": "merger" },
  { "_type": "arrow", "shapeId": "a5", "fromId": "db", "toId": "merger" },
  { "_type": "arrow", "shapeId": "a6", "fromId": "doc", "toId": "merger" }
]
```

### Notes

- Parallel workers are grouped inside a tldraw frame for visual clarity
- Show every fan-out and fan-in edge explicitly
- A merge step is always required — never let parallel branches end without convergence
- If some branches are conditional, use dashed arrows from dispatcher to those workers

---

## Choosing a Pattern

| Situation | Recommended Pattern |
|-----------|---------------------|
| One routing agent + specialists | Supervisor |
| Multiple teams with their own leads | Hierarchical Teams |
| Sequential handoffs, minimal routing | Peer-to-Peer |
| Data transformation stages | Pipeline |
| Sign-off or review required | Human-in-Loop |
| Independent concurrent tasks | Parallel Execution |
| Complex real system | Combine patterns — frames nest any pattern inside another |

Patterns can nest. A hierarchical team diagram can have a pipeline inside one of its frames. A supervisor pattern can dispatch to a parallel group. Represent the actual system — do not force it into one topology.

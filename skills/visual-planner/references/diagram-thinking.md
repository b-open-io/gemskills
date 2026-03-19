# Diagram Thinking

How to reason about what to draw before placing a single shape. This is the most important reference in the visual planner — a diagram that shows the wrong things beautifully is worse than an ugly diagram that shows the right things.

---

## The First Question

Before generating any shapes, answer: **What single question does this diagram answer?**

Examples of good diagram questions:
- "How do requests flow from a visitor to the right bot?"
- "What are the deployment units and how do they communicate?"
- "What happens when a sandbox bot dies?"

Examples of bad diagram questions:
- "Show the whole system" (too vague — which aspect?)
- "Show the architecture and the data flow and the deployment" (three diagrams, not one)

If the question requires the word "and", you need multiple diagrams.

---

## Abstraction Level

Every element on a diagram must exist at the same conceptual altitude. Mixing levels is the #1 cause of confusing diagrams.

### The C4 Zoom Levels

| Level | Shows | Example elements | Don't show |
|-------|-------|-----------------|------------|
| **Context** | System + its world | "ClawNet Fleet", "Visitor", "Vercel Platform" | Internal services, databases, APIs |
| **Container** | Deployable units | "Johnny (Vercel Function)", "Martha (Sandbox)", "ClawNet Registry (API)" | Internal modules, code structure |
| **Component** | Modules inside one container | "Chat Handler", "P2P Message Router", "Health Check Cron" | Other containers' internals |

**Rule**: Pick one level per diagram. If you catch yourself showing both "Martha (a deployable bot)" and "Martha's chat handler (an internal module)", you're mixing levels.

### Choosing the Right Level

- **Planning a system from scratch?** Start at Context level. Show the system as one box and its relationships to the outside world.
- **Deciding what to build?** Container level. Show what gets deployed where.
- **Debugging or implementing?** Component level. Show the internals of one container.

For the visual planner skill, **Container level is the default** — it's the most useful for planning agent systems.

---

## What to Draw (Entity Selection)

### Include

- **Actors**: Who/what initiates actions? (Users, cron jobs, external systems)
- **Primary services**: What does the actual work? (Bots, APIs, workers)
- **Key infrastructure**: What enables communication? (Message queues, registries, databases) — but only if architecturally significant
- **Decision points**: Where does the flow branch? (Routing logic, approval gates)

### Exclude

- **Implementation details** at a higher abstraction level (don't show HTTP handlers on a system diagram)
- **Obvious infrastructure** (load balancers, DNS) unless they're the diagram's subject
- **Every possible error path** — show the primary error recovery, not all 47 failure modes
- **Generic middleware** (auth, logging, monitoring) unless it's the diagram's focus

### The Litmus Test

For each node, ask: "If I remove this, does the diagram's question become unanswerable?" If the answer is no, the node is noise.

---

## How to Show Connections

### Arrow Semantics — Pick One Type Per Diagram

| Type | Arrow direction means | Best for |
|------|----------------------|----------|
| **Data flow** | Direction data travels | ETL pipelines, event systems |
| **Control flow** | Who initiates the action | Request/response APIs, agent orchestration |
| **Dependency** | Who depends on whom | Service architecture, build systems |

**Never mix types on the same diagram** without a legend that explicitly differentiates them.

### Arrow Styling Hierarchy

Use dash patterns and colors to create visual hierarchy between different kinds of relationships:

| Relationship | Style | Color | Example |
|-------------|-------|-------|---------|
| Primary / happy path | `solid` | `black` | Main request flow |
| Conditional dispatch | `dashed` | `black` | Supervisor routing to workers |
| Return / response | `dotted` | `grey` | Worker reporting results back |
| Error / rejection | `dashed` | `orange` | Failed validation loop-back |
| Async / event-driven | `dashed` | `blue` | Message queue consumption |
| Monitoring / heartbeat | `dotted` | `light-blue` | Health checks, metrics |

### Label Every Arrow

An unlabeled arrow says "these are somehow related." That is never sufficient.

- **Minimum**: a verb ("sends", "reads", "wakes")
- **Better**: verb + data type ("sends OrderEvent", "reads customer record")
- **Best**: verb + data type + protocol ("POST /api/wake via HTTPS")

**When to omit labels**: Only when ALL arrows on the diagram have the same semantic type AND the diagram title makes this obvious (e.g., "Data Flow Diagram" where every arrow is a data pipe).

### Arrowhead Choices

tldraw supports: `none`, `arrow`, `triangle`, `square`, `dot`, `pipe`, `diamond`, `inverted`, `bar`

Recommended conventions:
- `arrow` (default): standard directional flow
- `triangle`: strong/filled directional (use for primary paths)
- `diamond`: dependency relationship
- `dot`: broadcast/multicast (one-to-many)
- `none` on start, `arrow` on end: unidirectional (most common)

---

## Visual Hierarchy

The eye reads a diagram in a predictable order. Use this to guide attention.

### Size = Importance

- Primary actors: larger nodes (220x80+)
- Supporting infrastructure: standard size (200x80)
- External/out-of-scope systems: smaller (160x60)

### Color = Category, Not Decoration

Every color must mean something. Max 5-6 colors per diagram.

- High-saturation fills for primary actors
- Desaturated/light fills for supporting infrastructure
- Grey for external systems outside your control
- Red/orange ONLY for error states — never decoratively

### Position = Flow Direction

- **Top-to-bottom**: time or dependency flows downward
- **Left-to-right**: process stages flow rightward
- Never both in the same diagram
- The most important element goes at the visual center or upper-left

### The Happy Path Spine

The primary flow through the system should form a clear, uninterrupted visual line through the diagram. Everything else branches off this spine. The reader should be able to trace the happy path without lifting their eyes.

---

## Information Density

### Target Node Count

| Nodes | Verdict | Action |
|-------|---------|--------|
| 1-3 | Too sparse | Could this be a sentence instead? |
| 4-6 | Minimal | Fine for focused component diagrams |
| **7-12** | **Sweet spot** | Readable at a glance |
| 13-20 | Dense but manageable | Must use frames/groups to cluster into 3-5 visual units |
| 20+ | Too many | Split into multiple diagrams at different abstraction levels |

### The Fan Trap

When one node connects to 5+ others, the diagram becomes unreadable. Solutions:

1. **Add intermediate nodes**: Instead of "Supervisor -> 8 workers", show "Supervisor -> Research Team -> [2 workers]" and "Supervisor -> Writing Team -> [3 workers]"
2. **Use frames**: Group related nodes so the fan-out goes to frames, not individual nodes
3. **Split diagrams**: One diagram per team/domain

### De-cluttering Techniques

- **Use `note` shapes** (sticky notes) for context that doesn't belong in node labels. "Uses Claude Sonnet 4.6", "30-min sandbox TTL", "Needs retry logic"
- **Use `text` shapes** for standalone annotations near arrow midpoints instead of cramming everything into arrow labels
- **Use frames** to create visual groupings that reduce perceived complexity — 4 frames with 3 nodes each reads easier than 12 ungrouped nodes
- **Use visual weight** to push secondary elements into the background — lighter colors, smaller sizes, dotted borders
- **Omit obvious connections** — if every node connects to a shared database, show the database once with a single labeled arrow and a note "all services", don't draw 8 arrows

---

## The Legend

**Every diagram gets a legend.** No exceptions.

### What to Include

- Every distinct shape type and its meaning
- Every distinct color and its meaning
- Every distinct line style and its meaning
- Placed in the bottom-left or bottom-right corner
- Compact: 2-column layout

### Implementation in tldraw

Use a frame named "Legend" positioned below the main diagram, containing small example shapes with text labels:

```json
{ "_type": "frame", "shapeId": "legend", "name": "Legend", "children": [...] }
```

Inside the legend frame, place miniature versions of each shape type with labels.

---

## Diagram Types for Agent Systems

### System Context (Level 1)
**When**: First diagram for any new system. Shows the 30,000-foot view.
- The agent system as a single box
- Users, external APIs, other systems it interacts with
- 4-6 nodes total
- No internal details

### Fleet Overview (Level 2)
**When**: Planning which bots/agents exist and how they communicate.
- Each bot/agent as a node with its deployment type (sandbox, persistent, local)
- Communication channels (P2P, HTTP, message queue)
- Shared infrastructure (registry, identity, storage)
- Frames for logical groupings (ephemeral vs persistent, by team)
- 8-15 nodes

### Agent Internals (Level 3)
**When**: Planning what one specific agent does internally.
- Endpoints, handlers, skills
- Internal routing logic
- State management
- 6-10 nodes, focused on one agent

### Workflow / Process (Dynamic)
**When**: Showing what happens at runtime — a specific scenario.
- Sequence of actions across multiple agents
- Decision points with labeled branches
- Use numbered arrows to show order
- Keep to one scenario per diagram — "happy path" or "error recovery", not both

---

## Pre-Generation Checklist

Before writing any shapes JSON, verify:

1. [ ] **Single question defined** — the diagram answers exactly one question
2. [ ] **Abstraction level chosen** — Context, Container, or Component
3. [ ] **Arrow semantic type chosen** — Data flow, Control flow, or Dependency
4. [ ] **Node count estimated** — target 7-12, plan grouping if 13+
5. [ ] **Fan traps identified** — no node should connect to 5+ others without grouping
6. [ ] **Happy path identified** — the primary flow that forms the visual spine
7. [ ] **Legend planned** — shapes, colors, and line styles all have documented meanings
8. [ ] **Entity selection justified** — every node passes the "remove it" litmus test

#!/usr/bin/env bun
/**
 * Create a .tldr diagram from focused-shape JSON.
 *
 * Accepts the simplified focused-shape format (same as tldraw MCP)
 * and outputs a valid .tldr file with all conversions handled:
 * - Arrow fromId/toId → binding records
 * - Plain text → richText wrappers
 * - Shape IDs → shape: prefix
 * - Frame children → parentId relationships
 * - Auto-layout via dagre when --layout auto is passed
 *
 * Usage:
 *   bun run scripts/create_diagram.ts --input shapes.json --output diagram.tldr
 *   bun run scripts/create_diagram.ts --input shapes.json --output diagram.tldr --layout auto
 *   bun run scripts/create_diagram.ts --template supervisor --output diagram.tldr
 *   bun run scripts/create_diagram.ts --input shapes.json --name "My Workflow" --output diagram.tldr
 *   echo '[...]' | bun run scripts/create_diagram.ts --output diagram.tldr
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../assets");
const PLAYGROUND_DIR = resolve(__dirname, "../playground");

// ── Load playground deps (tldraw schema + utils + dagre) ─────────────

// Ensure playground node_modules are installed
const nodeModulesPath = resolve(PLAYGROUND_DIR, "node_modules");
if (!existsSync(nodeModulesPath)) {
  console.error("Installing playground dependencies...");
  Bun.spawnSync(["bun", "install"], { cwd: PLAYGROUND_DIR, stdio: ["inherit", "inherit", "inherit"] });
}

// Resolve @tldraw/tlschema for the serialized schema
let getSerializedSchema: () => { schemaVersion: 2; sequences: Record<string, number> };
try {
  const tlschemaPath = resolve(PLAYGROUND_DIR, "node_modules/@tldraw/tlschema");
  const { createTLSchema } = await import(tlschemaPath);
  const schema = createTLSchema();
  const serialized = schema.serialize();
  getSerializedSchema = () => serialized;
} catch (err) {
  console.error("Error: Could not load @tldraw/tlschema from playground:", err);
  process.exit(1);
}

// Resolve @tldraw/utils for fractional indexing
let getIndices: (n: number) => string[];
try {
  const tlutilsPath = resolve(PLAYGROUND_DIR, "node_modules/@tldraw/utils");
  const tlutils = await import(tlutilsPath);
  getIndices = tlutils.getIndices;
} catch (err) {
  console.error("Error: Could not load @tldraw/utils from playground:", err);
  process.exit(1);
}

// Resolve @dagrejs/dagre for auto-layout
let dagre: typeof import("@dagrejs/dagre");
try {
  const dagrePath = resolve(PLAYGROUND_DIR, "node_modules/@dagrejs/dagre");
  dagre = await import(dagrePath);
} catch (err) {
  console.error("Error: Could not load @dagrejs/dagre from playground:", err);
  process.exit(1);
}

// ── Types ────────────────────────────────────────────────────────────

interface FocusedGeoShape {
  _type: string;
  shapeId: string;
  x?: number;
  y?: number;
  w: number;
  h: number;
  color: string;
  fill?: string;
  dash?: string;
  size?: string;
  font?: string;
  text?: string;
  textAlign?: string;
  note?: string;
}

interface FocusedArrowShape {
  _type: "arrow";
  shapeId: string;
  // Unbound arrows use x1,y1,x2,y2 for explicit coordinates
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color: string;
  dash?: string;
  size?: string;
  fromId?: string | null;
  toId?: string | null;
  text?: string;
  bend?: number;
  kind?: "arc" | "elbow";
  arrowheadStart?: string;
  arrowheadEnd?: string;
  note?: string;
}

interface FocusedTextShape {
  _type: "text";
  shapeId: string;
  x?: number;
  y?: number;
  text: string;
  color: string;
  anchor?: string;
  font?: string;
  size?: string;
  maxWidth?: number | null;
  note?: string;
}

interface FocusedNoteShape {
  _type: "note";
  shapeId: string;
  x?: number;
  y?: number;
  color: string;
  text?: string;
  font?: string;
  size?: string;
  note?: string;
}

interface FocusedLineShape {
  _type: "line";
  shapeId: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  color: string;
  dash?: string;
  size?: string;
  note?: string;
}

interface FocusedFrameShape {
  _type: "frame";
  shapeId: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  name?: string;
  children?: string[];
  note?: string;
}

type FocusedShape =
  | FocusedGeoShape
  | FocusedArrowShape
  | FocusedTextShape
  | FocusedNoteShape
  | FocusedLineShape
  | FocusedFrameShape;

// ── Mappings ─────────────────────────────────────────────────────────

const FOCUSED_TO_GEO: Record<string, string> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  triangle: "triangle",
  diamond: "diamond",
  hexagon: "hexagon",
  pill: "oval",
  cloud: "cloud",
  "x-box": "x-box",
  "check-box": "check-box",
  heart: "heart",
  pentagon: "pentagon",
  octagon: "octagon",
  star: "star",
  "parallelogram-right": "rhombus",
  "parallelogram-left": "rhombus-2",
  trapezoid: "trapezoid",
  "fat-arrow-right": "arrow-right",
  "fat-arrow-left": "arrow-left",
  "fat-arrow-up": "arrow-up",
  "fat-arrow-down": "arrow-down",
  oval: "oval",
  rhombus: "rhombus",
};

const FILL_MAP: Record<string, string> = {
  none: "none",
  solid: "lined-fill",
  background: "semi",
  tint: "solid",
  pattern: "pattern",
};

const COLOR_ALIASES: Record<string, string> = {
  purple: "violet",
  pink: "light-violet",
  "light-pink": "light-violet",
  "light-orange": "yellow",
  brown: "orange",
};

const VALID_COLORS = new Set([
  "black", "grey", "light-violet", "violet", "blue", "light-blue",
  "yellow", "orange", "green", "light-green", "light-red", "red", "white",
]);

function normalizeColor(c: string | undefined): string {
  if (!c) return "black";
  const lower = c.trim().toLowerCase();
  if (COLOR_ALIASES[lower]) return COLOR_ALIASES[lower];
  if (VALID_COLORS.has(lower)) return lower;
  return "black";
}

// ── Rich Text ────────────────────────────────────────────────────────

function toRichText(text: string) {
  if (!text) return { type: "doc", content: [{ type: "paragraph" }] };
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line
        ? { type: "paragraph", content: [{ type: "text", text: line }] }
        : { type: "paragraph" }
    ),
  };
}

// ── ID helpers ───────────────────────────────────────────────────────

function toShapeId(id: string): string {
  return id.startsWith("shape:") ? id : `shape:${id}`;
}

function toBindingId(id: string): string {
  return id.startsWith("binding:") ? id : `binding:${id}`;
}

// ── Auto-height for text content ─────────────────────────────────

const LINE_HEIGHT = 24; // approximate px per line at size "m"
const MIN_PADDING = 32; // vertical padding inside shape

/**
 * Compute minimum height for a shape based on its text content.
 * Returns the larger of the explicit height and the text-derived height.
 */
function autoHeight(explicitH: number, text?: string): number {
  if (!text) return explicitH;
  const lines = text.split("\n").length;
  const textHeight = lines * LINE_HEIGHT + MIN_PADDING;
  return Math.max(explicitH, textHeight);
}

// ── Dagre layout ─────────────────────────────────────────────────────

interface LayoutResult {
  x: number;
  y: number;
}

/**
 * Run dagre layout on non-frame, non-arrow shapes and return computed positions.
 * Arrows are edges in the dagre graph; frames are sized after layout.
 * Returns a map of shapeId → { x, y } (top-left corner, not center).
 */
function runDagreLayout(shapes: FocusedShape[]): Map<string, LayoutResult> {
  // Build a map of child → frame parent
  const childToFrame = new Map<string, string>();
  for (const shape of shapes) {
    if (shape._type === "frame") {
      const frame = shape as FocusedFrameShape;
      for (const childId of frame.children ?? []) {
        childToFrame.set(childId, frame.shapeId);
      }
    }
  }

  // Use compound graph so frames act as subgraph clusters
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 150,
    ranksep: 120,
    marginx: 50,
    marginy: 50,
  });

  // Add frames as cluster nodes (dagre compound parent)
  for (const shape of shapes) {
    if (shape._type === "frame") {
      g.setNode(shape.shapeId, { label: shape.shapeId, clusterLabelPos: "top" });
    }
  }

  // Exclude arrows, lines, frames, notes, and text from dagre layout.
  // Notes and text are annotations — they should be positioned after layout
  // near their relevant context, not treated as graph nodes.
  const DAGRE_EXCLUDE = new Set(["arrow", "line", "frame", "note", "text"]);
  const nodeShapes = shapes.filter((s) => !DAGRE_EXCLUDE.has(s._type));

  // Add graph nodes
  for (const shape of nodeShapes) {
    let w = 200;
    let h = 80;
    if ("w" in shape && typeof shape.w === "number") w = Math.abs(shape.w);
    if ("h" in shape && typeof shape.h === "number") h = Math.abs(shape.h);
    // Auto-grow height based on text content
    const shapeText = "text" in shape && typeof shape.text === "string" ? shape.text : undefined;
    h = autoHeight(h, shapeText);
    g.setNode(shape.shapeId, { width: w, height: h, label: shape.shapeId });

    // If this node belongs to a frame, set its parent in the compound graph
    const parentFrame = childToFrame.get(shape.shapeId);
    if (parentFrame) {
      g.setParent(shape.shapeId, parentFrame);
    }
  }

  // Add arrows as dagre edges
  for (const shape of shapes) {
    if (shape._type === "arrow") {
      const arrow = shape as FocusedArrowShape;
      if (arrow.fromId && arrow.toId) {
        // Only add edge if both endpoints are dagre nodes
        if (g.hasNode(arrow.fromId) && g.hasNode(arrow.toId)) {
          g.setEdge(arrow.fromId, arrow.toId);
        }
      }
    }
  }

  dagre.layout(g);

  const positions = new Map<string, LayoutResult>();
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId);
    if (node && node.width && node.height) {
      // dagre gives center coordinates — convert to top-left
      positions.set(nodeId, {
        x: node.x - node.width / 2,
        y: node.y - node.height / 2,
      });
    }
  }
  return positions;
}

// ── Converter ────────────────────────────────────────────────────────

interface TldrStore {
  [key: string]: Record<string, unknown>;
}

function convertShapes(
  shapes: FocusedShape[],
  docName: string,
  layoutMode: "auto" | "manual"
): { store: TldrStore } {
  const store: TldrStore = {};

  // Annotations (notes, text) deferred for post-layout positioning
  const deferredAnnotations: { shape: FocusedShape; sid: string; base: Record<string, unknown> }[] = [];

  // Document and page
  store["document:document"] = {
    gridSize: 10,
    name: docName,
    meta: {},
    id: "document:document",
    typeName: "document",
  };
  store["page:page"] = {
    meta: {},
    id: "page:page",
    name: "Page 1",
    index: "a1",
    typeName: "page",
  };

  // Run dagre layout if requested
  let dagrePositions: Map<string, LayoutResult> | null = null;
  if (layoutMode === "auto") {
    dagrePositions = runDagreLayout(shapes);
  }

  // Count total shapes + bindings for index generation
  // Nodes first, then arrows — arrows render on top
  const nodeShapes = shapes.filter((s) => s._type !== "arrow");
  const arrowShapes = shapes.filter((s) => s._type === "arrow");
  const orderedShapes = [...nodeShapes, ...arrowShapes];

  // Count bindings: each bound arrow endpoint = one binding
  let bindingCount = 0;
  for (const shape of shapes) {
    if (shape._type === "arrow") {
      const arrow = shape as FocusedArrowShape;
      if (arrow.fromId) bindingCount++;
      if (arrow.toId) bindingCount++;
    }
  }

  // Generate all indices up front using @tldraw/utils
  const totalShapeCount = orderedShapes.length;
  const shapeIndices = totalShapeCount > 0 ? getIndices(totalShapeCount) : [];
  // Bindings don't need fractional indices — they use their own counter
  let shapeIndexCursor = 0;

  const getNextShapeIndex = (): string => {
    if (shapeIndexCursor < shapeIndices.length) {
      return shapeIndices[shapeIndexCursor++];
    }
    // Fallback for overflow (shouldn't happen if count is correct)
    return `a${shapeIndexCursor++}`;
  };

  // Track frame children for parenting
  const frameChildren = new Map<string, string[]>();
  for (const shape of shapes) {
    if (shape._type === "frame" && (shape as FocusedFrameShape).children?.length) {
      frameChildren.set(shape.shapeId, (shape as FocusedFrameShape).children!);
    }
  }

  // Build reverse map: childId → frameId
  const childToFrame = new Map<string, string>();
  for (const [frameId, children] of frameChildren) {
    for (const childId of children) {
      childToFrame.set(childId, frameId);
    }
  }

  // Process shapes in order (nodes first so they get lower indices, arrows last)
  for (const shape of orderedShapes) {
    const sid = toShapeId(shape.shapeId);
    const parentId = childToFrame.has(shape.shapeId)
      ? toShapeId(childToFrame.get(shape.shapeId)!)
      : "page:page";

    const base = {
      id: sid,
      typeName: "shape",
      rotation: 0,
      index: getNextShapeIndex(),
      parentId,
      isLocked: false,
      opacity: 1,
      meta: (shape as FocusedGeoShape).note ? { note: (shape as FocusedGeoShape).note } : {},
    };

    if (shape._type === "arrow") {
      const arrow = shape as FocusedArrowShape;
      const hasBoundStart = !!arrow.fromId;
      const hasBoundEnd = !!arrow.toId;
      const arrowKind = arrow.kind ?? "arc";

      // When bound, tldraw recalculates x,y,start,end — set all to zero
      // When unbound, use explicit coordinates
      let arrowX = 0;
      let arrowY = 0;
      let arrowEnd = { x: 0, y: 0 };

      if (!hasBoundStart && !hasBoundEnd) {
        const x1 = arrow.x1 ?? 0;
        const y1 = arrow.y1 ?? 0;
        const x2 = arrow.x2 ?? 200;
        const y2 = arrow.y2 ?? 0;
        arrowX = x1;
        arrowY = y1;
        arrowEnd = { x: x2 - x1, y: y2 - y1 };
      }

      store[sid] = {
        ...base,
        type: "arrow",
        x: arrowX,
        y: arrowY,
        props: {
          kind: arrowKind,
          color: normalizeColor(arrow.color),
          fill: "none",
          dash: arrow.dash || "solid",
          size: arrow.size || "m",
          font: "sans",
          labelColor: "black",
          arrowheadStart: arrow.arrowheadStart || "none",
          arrowheadEnd: arrow.arrowheadEnd || "triangle",
          start: { x: 0, y: 0 },
          end: hasBoundStart && hasBoundEnd ? { x: 0, y: 0 } : arrowEnd,
          bend: (arrow.bend || 0) * -1,
          richText: toRichText(arrow.text || ""),
          labelPosition: 0.5,
          scale: 1,
          elbowMidPoint: 0.5,
        },
      };

      // Create binding records
      if (arrow.fromId) {
        const bindId = toBindingId(`${arrow.shapeId}_start`);
        store[bindId] = {
          id: bindId,
          typeName: "binding",
          type: "arrow",
          fromId: sid,
          toId: toShapeId(arrow.fromId),
          props: {
            terminal: "start",
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
            snap: "none",
          },
          meta: {},
        };
      }

      if (arrow.toId) {
        const bindId = toBindingId(`${arrow.shapeId}_end`);
        store[bindId] = {
          id: bindId,
          typeName: "binding",
          type: "arrow",
          fromId: sid,
          toId: toShapeId(arrow.toId),
          props: {
            terminal: "end",
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
            snap: "none",
          },
          meta: {},
        };
      }
    } else if (shape._type === "text") {
      const text = shape as FocusedTextShape;
      let textAlign: string = "start";
      if (text.anchor?.includes("center")) textAlign = "middle";
      if (text.anchor?.includes("right")) textAlign = "end";

      // Text shapes are excluded from dagre — use explicit position or defer
      deferredAnnotations.push({ shape, sid, base });
      store[sid] = {
        ...base,
        type: "text",
        x: text.x ?? 0,
        y: text.y ?? 0,
        props: {
          color: normalizeColor(text.color),
          size: text.size || "m",
          font: text.font || "sans",
          textAlign,
          w: text.maxWidth || 200,
          richText: toRichText(text.text),
          scale: 1,
          autoSize: text.maxWidth == null,
        },
      };
    } else if (shape._type === "note") {
      const note = shape as FocusedNoteShape;

      // Note shapes are excluded from dagre — use explicit position or defer
      deferredAnnotations.push({ shape, sid, base });
      store[sid] = {
        ...base,
        type: "note",
        x: note.x ?? 0,
        y: note.y ?? 0,
        props: {
          color: normalizeColor(note.color),
          labelColor: "black",
          size: note.size || "m",
          font: note.font || "sans",
          fontSizeAdjustment: 0,
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          richText: toRichText(note.text || ""),
          scale: 1,
        },
      };
    } else if (shape._type === "line") {
      const line = shape as FocusedLineShape;
      const x1 = line.x1 ?? 0;
      const y1 = line.y1 ?? 0;
      const x2 = line.x2 ?? 200;
      const y2 = line.y2 ?? 0;
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);

      store[sid] = {
        ...base,
        type: "line",
        x: minX,
        y: minY,
        props: {
          color: normalizeColor(line.color),
          dash: line.dash || "solid",
          size: line.size || "m",
          spline: "line",
          points: {
            a1: { id: "a1", index: "a1", x: x1 - minX, y: y1 - minY },
            a2: { id: "a2", index: "a2", x: x2 - minX, y: y2 - minY },
          },
          scale: 1,
        },
      };
    } else if (shape._type === "frame") {
      // Frames are handled in a second pass after dagre positions are known
      // Skip here — placeholder will be filled below
    } else {
      // Geo shape (rectangle, ellipse, diamond, cloud, etc.)
      const geo = shape as FocusedGeoShape;
      const geoType = FOCUSED_TO_GEO[geo._type] || "rectangle";
      const w = Math.max(Math.abs(geo.w ?? 200), 1);
      const h = autoHeight(Math.max(Math.abs(geo.h ?? 80), 1), geo.text);

      const pos = dagrePositions?.get(shape.shapeId);
      let x: number;
      let y: number;
      if (pos) {
        x = pos.x;
        y = pos.y;
      } else {
        x = (geo.w ?? 0) < 0 ? (geo.x ?? 0) + (geo.w ?? 0) : (geo.x ?? 0);
        y = (geo.h ?? 0) < 0 ? (geo.y ?? 0) + (geo.h ?? 0) : (geo.y ?? 0);
      }

      store[sid] = {
        ...base,
        type: "geo",
        x,
        y,
        props: {
          geo: geoType,
          w,
          h,
          color: normalizeColor(geo.color),
          fill: FILL_MAP[geo.fill || "none"] || "none",
          dash: geo.dash || "solid",
          size: geo.size || "m",
          font: geo.font || "sans",
          align: geo.textAlign || "middle",
          verticalAlign: "middle",
          labelColor: "black",
          richText: toRichText(geo.text || ""),
          url: "",
          growY: 0,
          scale: 1,
        },
      };
    }
  }

  // ── Frame pass: size frames to contain their children ────────────────
  // In auto-layout mode, frames are sized from dagre-positioned children.
  // In manual mode, frames use explicit w,h.
  const FRAME_PADDING = 60;
  const FRAME_LABEL_HEIGHT = 32; // Extra top padding for frame label text

  for (const shape of shapes) {
    if (shape._type !== "frame") continue;
    const frame = shape as FocusedFrameShape;
    const sid = toShapeId(frame.shapeId);

    if (layoutMode === "auto" && dagrePositions) {
      // Collect all children IDs for this frame
      const childIds = frameChildren.get(frame.shapeId) ?? [];

      // Also detect containment if no explicit children list
      // (we'll do explicit only for auto-layout frames)
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const childId of childIds) {
        const pos = dagrePositions.get(childId);
        if (!pos) continue;
        const childShape = shapes.find((s) => s.shapeId === childId);
        if (!childShape) continue;
        const w = "w" in childShape && typeof childShape.w === "number" ? Math.abs(childShape.w) : 200;
        const h = "h" in childShape && typeof childShape.h === "number" ? Math.abs(childShape.h) : 80;
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + w);
        maxY = Math.max(maxY, pos.y + h);
      }

      let frameX: number;
      let frameY: number;
      let frameW: number;
      let frameH: number;

      if (minX === Infinity) {
        // No children found — use defaults or explicit values
        frameX = frame.x ?? 0;
        frameY = frame.y ?? 0;
        frameW = frame.w ?? 400;
        frameH = frame.h ?? 300;
      } else {
        frameX = minX - FRAME_PADDING;
        frameY = minY - FRAME_PADDING - FRAME_LABEL_HEIGHT;
        frameW = (maxX - minX) + FRAME_PADDING * 2;
        frameH = (maxY - minY) + FRAME_PADDING * 2 + FRAME_LABEL_HEIGHT;
      }

      // Add frame to store
      const frameIndex = shapeIndices[0] ?? "a1"; // frames get first index conceptually
      store[sid] = {
        id: sid,
        typeName: "shape",
        rotation: 0,
        index: frameIndex,
        parentId: "page:page",
        isLocked: false,
        opacity: 1,
        meta: frame.note ? { note: frame.note } : {},
        type: "frame",
        x: frameX,
        y: frameY,
        props: {
          w: Math.max(frameW, 1),
          h: Math.max(frameH, 1),
          name: frame.name || "",
          color: "black",
        },
      };

      // Adjust child coordinates to be relative to frame
      for (const childId of childIds) {
        const childSid = toShapeId(childId);
        const rec = store[childSid] as any;
        if (rec) {
          rec.x -= frameX;
          rec.y -= frameY;
          rec.parentId = sid;
        }
      }
    } else {
      // Manual mode: use explicit dimensions
      const w = Math.max(Math.abs(frame.w ?? 400), 1);
      const h = Math.max(Math.abs(frame.h ?? 300), 1);

      store[sid] = {
        id: sid,
        typeName: "shape",
        rotation: 0,
        index: getNextShapeIndex(),
        parentId: "page:page",
        isLocked: false,
        opacity: 1,
        meta: frame.note ? { note: frame.note } : {},
        type: "frame",
        x: (frame.w ?? 0) < 0 ? (frame.x ?? 0) + (frame.w ?? 0) : (frame.x ?? 0),
        y: (frame.h ?? 0) < 0 ? (frame.y ?? 0) + (frame.h ?? 0) : (frame.y ?? 0),
        props: {
          w,
          h,
          name: frame.name || "",
          color: "black",
        },
      };
    }
  }

  // ── Auto-parent shapes inside frames (manual mode, no explicit children) ──
  // Only run in manual mode; in auto mode, explicit children lists are used.
  if (layoutMode === "manual") {
    for (const shape of shapes) {
      if (shape._type !== "frame") continue;
      const frame = shape as FocusedFrameShape;
      if (frame.children?.length) continue; // already handled by childToFrame map

      const frameId = toShapeId(frame.shapeId);
      const frameRecord = store[frameId] as any;
      if (!frameRecord) continue;
      const fw = frameRecord.props.w;
      const fh = frameRecord.props.h;
      const fx = frameRecord.x;
      const fy = frameRecord.y;

      for (const key of Object.keys(store)) {
        if (!key.startsWith("shape:")) continue;
        const rec = store[key] as any;
        if (rec.id === frameId) continue;
        if (rec.parentId !== "page:page") continue;
        if (rec.type === "arrow" || rec.type === "line") continue;

        const sw = rec.props?.w || 0;
        const sh = rec.props?.h || 0;
        const cx = rec.x + sw / 2;
        const cy = rec.y + sh / 2;

        if (cx >= fx && cy >= fy && cx <= fx + fw && cy <= fy + fh) {
          rec.parentId = frameId;
          rec.x -= fx;
          rec.y -= fy;
        }
      }
    }
  }

  // ── Position deferred annotations (notes, text) ──────────────────────
  // In auto-layout mode, notes/text without explicit x,y are placed to the
  // right of the main diagram content, stacked vertically.
  if (layoutMode === "auto" && deferredAnnotations.length > 0) {
    // Find the rightmost edge of all positioned shapes
    let maxRight = 0;
    let topY = 0;
    let foundAny = false;
    for (const key of Object.keys(store)) {
      if (!key.startsWith("shape:")) continue;
      const rec = store[key] as any;
      if (rec.type === "arrow" || rec.type === "line" || rec.type === "note" || rec.type === "text") continue;
      const x = rec.x ?? 0;
      const w = rec.props?.w ?? 200;
      const y = rec.y ?? 0;
      if (!foundAny || x + w > maxRight) {
        maxRight = x + w;
      }
      if (!foundAny || y < topY) {
        topY = y;
      }
      foundAny = true;
    }

    const annotationX = maxRight + 80; // 80px gap from diagram content
    let annotationY = topY;
    const NOTE_HEIGHT = 120; // approximate height + gap for stacking

    for (const { sid, shape } of deferredAnnotations) {
      const rec = store[sid] as any;
      if (rec) {
        // Only reposition if no explicit coordinates were given
        const hasExplicitPos = ("x" in shape && shape.x != null) || ("y" in shape && shape.y != null);
        if (!hasExplicitPos) {
          rec.x = annotationX;
          rec.y = annotationY;
          annotationY += NOTE_HEIGHT;
        }
      }
    }
  }

  return {
    schema: getSerializedSchema(),
    store,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  return undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

if (hasFlag("help") || hasFlag("h")) {
  console.log(`
create_diagram.ts — Generate a .tldr file from focused-shape JSON

Usage:
  bun run scripts/create_diagram.ts --input shapes.json --output diagram.tldr
  bun run scripts/create_diagram.ts --input shapes.json --output diagram.tldr --layout auto
  bun run scripts/create_diagram.ts --input shapes.json --output diagram.tldr --layout auto --open
  bun run scripts/create_diagram.ts --template supervisor --output diagram.tldr
  echo '[...]' | bun run scripts/create_diagram.ts --output diagram.tldr

Options:
  --input <path>      Input JSON file (focused shapes array). Reads stdin if omitted.
  --output <path>     Output .tldr file path (required).
  --name <string>     Document name (default: "Workflow").
  --template <name>   Use a built-in template: supervisor, pipeline, hierarchical.
  --layout <mode>     Layout mode: "auto" (dagre) or "manual" (default).
                      auto: ignores x,y from input, computes positions via dagre.
                      manual: uses x,y from input as-is.
  --open              After successful generation+validation, launch the playground.
  --no-validate       Skip validation after generation.
  --help              Show this help.

Focused Shape Format:
  Geo shapes:  { "_type": "rectangle", "shapeId": "id", "w": 200, "h": 80, "color": "blue", "fill": "tint", "text": "Label" }
  Arrows:      { "_type": "arrow", "shapeId": "a1", "fromId": "nodeA", "toId": "nodeB", "text": "label" }
  Text:        { "_type": "text", "shapeId": "t1", "x": 0, "y": 0, "text": "Title", "color": "black" }
  Notes:       { "_type": "note", "shapeId": "n1", "x": 0, "y": 0, "color": "yellow", "text": "Note" }
  Frames:      { "_type": "frame", "shapeId": "f1", "name": "Phase 1", "children": ["nodeA", "nodeB"] }

With --layout auto, x and y fields on geo/text/note shapes are ignored.
With --layout manual (default), x and y are required for correct positioning.
`);
  process.exit(0);
}

const inputFile = getArg("input");
const outputFile = getArg("output");
const templateName = getArg("template");
const docName = getArg("name") || "Workflow";
const layoutArg = getArg("layout") ?? "manual";
const shouldOpen = hasFlag("open");
const skipValidate = hasFlag("no-validate");

if (layoutArg !== "auto" && layoutArg !== "manual") {
  console.error(`Error: --layout must be "auto" or "manual", got: "${layoutArg}"`);
  process.exit(1);
}
const layoutMode: "auto" | "manual" = layoutArg as "auto" | "manual";

if (!outputFile) {
  console.error("Error: --output <path.tldr> is required");
  console.error('Run with --help for usage.');
  process.exit(1);
}

let shapes: FocusedShape[];

if (templateName) {
  const templatePath = resolve(ASSETS_DIR, `${templateName}.tldr`);
  if (!existsSync(templatePath)) {
    console.error(`Error: Template "${templateName}" not found at ${templatePath}`);
    console.error("Available: supervisor, pipeline, hierarchical");
    process.exit(1);
  }
  // Templates are already .tldr — just copy
  const content = readFileSync(templatePath, "utf-8");
  const tldr = JSON.parse(content);
  if (docName !== "Workflow") {
    tldr.store["document:document"].name = docName;
  }
  const templateOutPath = resolve(outputFile);
  writeFileSync(templateOutPath, JSON.stringify(tldr, null, 2));
  console.log(templateOutPath);
  if (shouldOpen) {
    const playgroundScript = resolve(__dirname, "playground_server.ts");
    const child = Bun.spawn(["bun", "run", playgroundScript, "--file", templateOutPath], {
      stdio: ["inherit", "inherit", "inherit"],
      detached: true,
    });
    child.unref();
  }
  process.exit(0);
}

if (inputFile) {
  const content = readFileSync(resolve(inputFile), "utf-8");
  shapes = JSON.parse(content);
} else {
  // Read from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  const content = Buffer.concat(chunks).toString("utf-8");
  if (!content.trim()) {
    console.error("Error: No input provided. Use --input or pipe JSON to stdin.");
    console.error("Run with --help for usage.");
    process.exit(1);
  }
  shapes = JSON.parse(content);
}

if (!Array.isArray(shapes)) {
  console.error("Error: Input must be a JSON array of focused shapes");
  process.exit(1);
}

const tldr = convertShapes(shapes, docName, layoutMode);
const outPath = resolve(outputFile);
writeFileSync(outPath, JSON.stringify(tldr, null, 2));
console.log(outPath);

// ── Auto-validation ───────────────────────────────────────────────────
if (!skipValidate) {
  const validateScript = resolve(__dirname, "validate.ts");
  const result = spawnSync("bun", ["run", validateScript, outPath], {
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf-8",
  });

  const stdout = (result.stdout as string) || "";
  const stderr = (result.stderr as string) || "";
  const combined = (stdout + stderr).trim();

  if (combined) {
    process.stderr.write(combined + "\n");
  }

  if (result.status !== 0) {
    process.stderr.write("Validation failed. Fix errors before opening the playground.\n");
    process.exit(1);
  }
}

// ── Auto-open playground ──────────────────────────────────────────────
if (shouldOpen) {
  const playgroundScript = resolve(__dirname, "playground_server.ts");
  // Detach so the playground server outlives this process
  const child = Bun.spawn(["bun", "run", playgroundScript, "--file", outPath], {
    stdio: ["inherit", "inherit", "inherit"],
    detached: true,
  });
  // Don't wait — let the server run independently
  child.unref();
}

#!/usr/bin/env bun
/**
 * Validate planning metadata in .tldr files.
 * Checks that shapes have proper meta fields for workflow planning.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const VALID_COLORS = [
  "black", "grey", "light-violet", "violet", "blue", "light-blue",
  "yellow", "orange", "green", "light-green", "light-red", "red", "white",
] as const;

// Fractional index: must start with 'a', must not end with '0'
const INDEX_RE = /^a[0-9a-zA-Z]*[1-9a-zA-Z]$/;

const VALID_NODE_TYPES = [
  "supervisor",
  "worker",
  "human_checkpoint",
  "tool",
  "decision",
  "start",
  "end",
] as const;

const VALID_PHASES = [
  "planned",
  "in_progress",
  "implemented",
  "needs_revision",
] as const;

const NODE_TYPE_GEO_MAP: Record<string, string[]> = {
  supervisor: ["rectangle"],
  worker: ["rectangle"],
  human_checkpoint: ["diamond"],
  tool: ["cloud"],
  decision: ["diamond"],
  start: ["ellipse"],
  end: ["ellipse"],
};

const PHASE_COLOR_MAP: Record<string, string> = {
  planned: "grey",
  in_progress: "blue",
  implemented: "green",
  needs_revision: "orange",
};

interface Issue {
  shapeId: string;
  level: "error" | "warning";
  message: string;
}

function validate(filePath: string): Issue[] {
  const abs = resolve(filePath);
  const raw = readFileSync(abs, "utf-8");
  let tldr: {
    schema?: { schemaVersion?: number };
    store: Record<string, any>;
  };

  try {
    tldr = JSON.parse(raw);
  } catch {
    console.error(`Failed to parse ${abs} as JSON`);
    process.exit(1);
  }

  if (!tldr.store) {
    console.error(`Invalid .tldr file: missing "store" key`);
    process.exit(1);
  }

  // Check schema record
  if (!tldr.schema || !tldr.schema.schemaVersion) {
    return [{
      shapeId: "schema",
      level: "error",
      message: 'Missing "schema" record with schemaVersion. tldraw will crash without it.',
    }];
  }

  const issues: Issue[] = [];
  const store = tldr.store;

  // Check document and page exist
  if (!store["document:document"]) {
    issues.push({
      shapeId: "document:document",
      level: "error",
      message: "Missing document:document record",
    });
  }

  const pages = Object.keys(store).filter((k) => k.startsWith("page:"));
  if (pages.length === 0) {
    issues.push({
      shapeId: "page:*",
      level: "error",
      message: "No page records found",
    });
  }

  // --- Structural validation (catches tldraw render crashes) ---
  const allShapes = Object.entries(store).filter(
    ([k, v]) => k.startsWith("shape:") && v.typeName === "shape"
  );

  for (const [id, shape] of allShapes) {
    // Index key validation
    if (shape.index && !INDEX_RE.test(shape.index)) {
      issues.push({
        shapeId: id,
        level: "error",
        message: `Invalid index "${shape.index}". Must match /^a[0-9a-zA-Z]*[1-9a-zA-Z]$/ (e.g. "a1", "aV", "a1V")`,
      });
    }

    // Frame color validation
    if (shape.type === "frame" && !shape.props?.color) {
      issues.push({
        shapeId: id,
        level: "error",
        message: 'Frame missing required props.color. Add "color": "black" or another valid color.',
      });
    }

    // Color value validation (all shapes with color)
    if (shape.props?.color && !VALID_COLORS.includes(shape.props.color)) {
      issues.push({
        shapeId: id,
        level: "error",
        message: `Invalid color "${shape.props.color}". Valid: ${VALID_COLORS.join(", ")}`,
      });
    }

    // Arrow null coordinate check
    if (shape.type === "arrow") {
      const p = shape.props || {};
      if (p.start?.x === null || p.start?.y === null || p.end?.x === null || p.end?.y === null) {
        issues.push({
          shapeId: id,
          level: "error",
          message: "Arrow has null start/end coordinates. Use { x: 0, y: 0 } as placeholder.",
        });
      }
    }

    // RichText validation — catch empty text nodes
    const rt = shape.props?.richText;
    if (rt) {
      if (rt.content && Array.isArray(rt.content)) {
        if (rt.content.length === 0) {
          issues.push({
            shapeId: id,
            level: "error",
            message: 'richText has empty content array. For unlabeled shapes, omit richText entirely.',
          });
        }
        for (const para of rt.content) {
          if (para.content && Array.isArray(para.content)) {
            for (const node of para.content) {
              if (node.type === "text" && (!node.text || node.text.trim() === "")) {
                issues.push({
                  shapeId: id,
                  level: "error",
                  message: `Empty or whitespace-only text node "${node.text || ""}". Remove richText for unlabeled shapes.`,
                });
              }
            }
          }
        }
      }
    }
  }

  // Validate shapes (planning metadata)
  const shapes = allShapes;

  const arrowShapes = shapes.filter(([, v]) => v.type === "arrow");
  const geoShapes = shapes.filter(([, v]) => v.type === "geo");

  // Only check planning metadata if at least one shape has it set.
  // If no shapes have meta.nodeType, skip all planning metadata checks —
  // they are not applicable to non-planning diagrams.
  const anyHasNodeType = geoShapes.some(([, v]) => v.meta?.nodeType);

  for (const [id, shape] of geoShapes) {
    if (!anyHasNodeType) break; // No planning metadata in file — skip all checks

    const meta = shape.meta || {};

    // Check for nodeType
    if (!meta.nodeType) {
      issues.push({
        shapeId: id,
        level: "warning",
        message: `Geo shape missing meta.nodeType`,
      });
      continue;
    }

    // Validate nodeType value
    if (!VALID_NODE_TYPES.includes(meta.nodeType)) {
      issues.push({
        shapeId: id,
        level: "error",
        message: `Invalid meta.nodeType "${meta.nodeType}". Valid: ${VALID_NODE_TYPES.join(", ")}`,
      });
    }

    // Validate geo matches nodeType convention
    const expectedGeos = NODE_TYPE_GEO_MAP[meta.nodeType];
    if (expectedGeos && !expectedGeos.includes(shape.props?.geo)) {
      issues.push({
        shapeId: id,
        level: "warning",
        message: `nodeType "${meta.nodeType}" typically uses geo "${expectedGeos.join("/")}", got "${shape.props?.geo}"`,
      });
    }

    // Validate phase
    if (meta.phase) {
      if (!VALID_PHASES.includes(meta.phase)) {
        issues.push({
          shapeId: id,
          level: "error",
          message: `Invalid meta.phase "${meta.phase}". Valid: ${VALID_PHASES.join(", ")}`,
        });
      }

      // Check phase/color consistency (skip nodes where role color overrides)
      const ROLE_COLORED_TYPES = ["supervisor", "start", "end", "human_checkpoint", "tool"];
      if (!ROLE_COLORED_TYPES.includes(meta.nodeType)) {
        const expectedColor = PHASE_COLOR_MAP[meta.phase];
        if (expectedColor && shape.props?.color !== expectedColor) {
          issues.push({
            shapeId: id,
            level: "warning",
            message: `Phase "${meta.phase}" should use color "${expectedColor}", got "${shape.props?.color}"`,
          });
        }
      }
    }

    // Check required props
    if (!shape.props?.richText && !shape.props?.text) {
      issues.push({
        shapeId: id,
        level: "warning",
        message: "Shape has no label text",
      });
    }
  }

  // Validate arrow bindings
  for (const [id, shape] of arrowShapes) {
    const bindings = Object.entries(store).filter(
      ([k, v]) =>
        k.startsWith("binding:") &&
        v.typeName === "binding" &&
        v.fromId === id
    );

    const hasStart = bindings.some(([, b]) => b.props?.terminal === "start");
    const hasEnd = bindings.some(([, b]) => b.props?.terminal === "end");

    if (!hasStart && !hasEnd) {
      issues.push({
        shapeId: id,
        level: "warning",
        message: "Arrow has no bindings (not connected to any shape)",
      });
    } else if (!hasStart) {
      issues.push({
        shapeId: id,
        level: "warning",
        message: "Arrow missing start binding",
      });
    } else if (!hasEnd) {
      issues.push({
        shapeId: id,
        level: "warning",
        message: "Arrow missing end binding",
      });
    }
  }

  return issues;
}

// --- CLI ---
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(`Usage: bun run validate.ts <file.tldr> [--strict]

Validates planning metadata in a .tldr file.

Options:
  --strict    Treat warnings as errors (exit 1 on any issue)
  --json      Output results as JSON
  --help      Show this help`);
  process.exit(0);
}

const strict = args.includes("--strict");
const json = args.includes("--json");
const filePath = args.find((a) => !a.startsWith("--"));

if (!filePath) {
  console.error("No file path provided");
  process.exit(1);
}

const issues = validate(filePath);

if (json) {
  console.log(JSON.stringify({ file: filePath, issues }, null, 2));
} else {
  if (issues.length === 0) {
    console.log(`${filePath}: valid (no issues found)`);
  } else {
    const errors = issues.filter((i) => i.level === "error");
    const warnings = issues.filter((i) => i.level === "warning");

    for (const issue of issues) {
      const prefix = issue.level === "error" ? "ERROR" : "WARN";
      console.log(`  ${prefix}  ${issue.shapeId}: ${issue.message}`);
    }

    console.log(
      `\n${errors.length} error(s), ${warnings.length} warning(s)`
    );
  }
}

const exitCode =
  strict
    ? issues.length > 0
      ? 1
      : 0
    : issues.some((i) => i.level === "error")
      ? 1
      : 0;

process.exit(exitCode);

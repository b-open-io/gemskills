#!/usr/bin/env bun
/**
 * KPI summary from .tldr workflow diagrams.
 * Extracts node counts by phase, type, completion percentage.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

interface Stats {
  name: string;
  totalShapes: number;
  planningNodes: number;
  arrows: number;
  frames: number;
  byPhase: Record<string, number>;
  byNodeType: Record<string, number>;
  completion: number;
  agents: string[];
}

function extractText(shape: any): string {
  const rt = shape.props?.richText;
  if (!rt) return "";
  try {
    return rt.content
      ?.flatMap((p: any) => p.content?.map((t: any) => t.text) ?? [])
      .join("") ?? "";
  } catch {
    return "";
  }
}

function getStats(filePath: string): Stats {
  const abs = resolve(filePath);
  const raw = readFileSync(abs, "utf-8");
  let tldr: { store: Record<string, any> };

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

  const store = tldr.store;
  const docName = store["document:document"]?.name ?? "Untitled";

  const shapes = Object.entries(store).filter(
    ([k, v]) => k.startsWith("shape:") && v.typeName === "shape"
  );

  const geoShapes = shapes.filter(([, v]) => v.type === "geo");
  const arrowShapes = shapes.filter(([, v]) => v.type === "arrow");
  const frameShapes = shapes.filter(([, v]) => v.type === "frame");

  const planningNodes = geoShapes.filter(([, v]) => v.meta?.nodeType);

  const byPhase: Record<string, number> = {};
  const byNodeType: Record<string, number> = {};
  const agents = new Set<string>();

  for (const [, shape] of planningNodes) {
    const phase = shape.meta?.phase ?? "unset";
    byPhase[phase] = (byPhase[phase] ?? 0) + 1;

    const nodeType = shape.meta?.nodeType;
    if (nodeType) {
      byNodeType[nodeType] = (byNodeType[nodeType] ?? 0) + 1;
    }

    if (shape.meta?.agent) {
      agents.add(shape.meta.agent);
    }
  }

  const implemented = byPhase["implemented"] ?? 0;
  const total = planningNodes.length;
  const completion = total > 0 ? Math.round((implemented / total) * 100) : 0;

  return {
    name: docName,
    totalShapes: shapes.length,
    planningNodes: planningNodes.length,
    arrows: arrowShapes.length,
    frames: frameShapes.length,
    byPhase,
    byNodeType,
    completion,
    agents: [...agents].sort(),
  };
}

// --- CLI ---
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(`Usage: bun run stats.ts <file.tldr> [--json]

Prints KPI summary from a .tldr workflow diagram.

Options:
  --json    Output as JSON
  --help    Show this help`);
  process.exit(0);
}

const json = args.includes("--json");
const filePath = args.find((a) => !a.startsWith("--"));

if (!filePath) {
  console.error("No file path provided");
  process.exit(1);
}

const stats = getStats(filePath);

if (json) {
  console.log(JSON.stringify(stats, null, 2));
} else {
  console.log(`Diagram: ${stats.name}`);
  console.log(`Shapes: ${stats.totalShapes} total (${stats.planningNodes} planning nodes, ${stats.arrows} arrows, ${stats.frames} frames)`);
  console.log();

  console.log("By Phase:");
  for (const [phase, count] of Object.entries(stats.byPhase).sort()) {
    const bar = "█".repeat(count);
    console.log(`  ${phase.padEnd(16)} ${bar} ${count}`);
  }
  console.log();

  console.log("By Node Type:");
  for (const [type, count] of Object.entries(stats.byNodeType).sort()) {
    console.log(`  ${type.padEnd(20)} ${count}`);
  }
  console.log();

  console.log(`Completion: ${stats.completion}%`);

  if (stats.agents.length > 0) {
    console.log(`Agents: ${stats.agents.join(", ")}`);
  }
}

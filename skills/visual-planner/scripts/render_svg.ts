#!/usr/bin/env bun
/**
 * Export .tldr diagram to SVG.
 * Renders shapes and arrows as clean SVG for documentation/embedding.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, basename } from "path";

const COLOR_MAP: Record<string, string> = {
  black: "#1d1d1d",
  grey: "#9ca3af",
  "light-violet": "#c4b5fd",
  violet: "#7c3aed",
  blue: "#3b82f6",
  "light-blue": "#93c5fd",
  yellow: "#eab308",
  orange: "#f97316",
  green: "#22c55e",
  "light-green": "#86efac",
  "light-red": "#fca5a5",
  red: "#ef4444",
  white: "#ffffff",
};

const FILL_OPACITY: Record<string, number> = {
  none: 0,
  solid: 1,
  semi: 0.3,
};

function extractText(shape: any): string {
  const rt = shape.props?.richText;
  if (!rt) return "";
  try {
    return (
      rt.content
        ?.flatMap((p: any) => p.content?.map((t: any) => t.text) ?? [])
        .join("") ?? ""
    );
  } catch {
    return "";
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderGeoShape(shape: any): string {
  const { x, y, props, meta } = shape;
  const w = props.w ?? 200;
  const h = props.h ?? 80;
  const color = COLOR_MAP[props.color] ?? COLOR_MAP.black;
  const fillColor = COLOR_MAP[props.color] ?? COLOR_MAP.black;
  const fillOpacity = FILL_OPACITY[props.fill] ?? 0.15;
  const text = extractText(shape);
  const geo = props.geo ?? "rectangle";

  let shapeEl = "";

  switch (geo) {
    case "ellipse":
      shapeEl = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="2"/>`;
      break;
    case "diamond": {
      const points = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
      shapeEl = `<polygon points="${points}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="2"/>`;
      break;
    }
    case "cloud": {
      // Simplified cloud path
      shapeEl = `<rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="20" ry="20" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="2" stroke-dasharray="8,4"/>`;
      break;
    }
    default:
      // rectangle and others
      shapeEl = `<rect x="0" y="0" width="${w}" height="${h}" rx="4" ry="4" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="2"/>`;
  }

  const textEl = text
    ? `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="14" fill="${COLOR_MAP.black}">${escapeXml(text)}</text>`
    : "";

  // Phase indicator
  let phaseEl = "";
  if (meta?.phase) {
    const phaseColor =
      meta.phase === "implemented"
        ? COLOR_MAP.green
        : meta.phase === "in_progress"
          ? COLOR_MAP.blue
          : meta.phase === "needs_revision"
            ? COLOR_MAP.orange
            : COLOR_MAP.grey;
    phaseEl = `<circle cx="${w - 8}" cy="8" r="5" fill="${phaseColor}" stroke="white" stroke-width="1"/>`;
  }

  return `<g transform="translate(${x},${y})">${shapeEl}${textEl}${phaseEl}</g>`;
}

function renderArrow(
  arrow: any,
  store: Record<string, any>
): string {
  const bindings = Object.values(store).filter(
    (r: any) =>
      r.typeName === "binding" && r.type === "arrow" && r.fromId === arrow.id
  );

  let x1: number, y1: number, x2: number, y2: number;

  const startBinding = bindings.find(
    (b: any) => b.props?.terminal === "start"
  );
  const endBinding = bindings.find((b: any) => b.props?.terminal === "end");

  if (startBinding && endBinding) {
    const startShape = store[startBinding.toId];
    const endShape = store[endBinding.toId];
    if (!startShape || !endShape) return "";

    const sw = startShape.props?.w ?? 200;
    const sh = startShape.props?.h ?? 80;
    const ew = endShape.props?.w ?? 200;
    const eh = endShape.props?.h ?? 80;

    x1 = startShape.x + sw / 2;
    y1 = startShape.y + sh / 2;
    x2 = endShape.x + ew / 2;
    y2 = endShape.y + eh / 2;
  } else {
    // Unbound arrow — use start/end props
    x1 = arrow.x + (arrow.props?.start?.x ?? 0);
    y1 = arrow.y + (arrow.props?.start?.y ?? 0);
    x2 = arrow.x + (arrow.props?.end?.x ?? 100);
    y2 = arrow.y + (arrow.props?.end?.y ?? 0);
  }

  const color = COLOR_MAP[arrow.props?.color] ?? COLOR_MAP.black;
  const dash =
    arrow.props?.dash === "dashed"
      ? ' stroke-dasharray="8,4"'
      : arrow.props?.dash === "dotted"
        ? ' stroke-dasharray="2,4"'
        : "";

  const text = extractText(arrow);
  const midX = (x1 + x2) / 2;
  const midY = (x1 + x2) / 2 ? (y1 + y2) / 2 - 10 : (y1 + y2) / 2;

  const labelEl = text
    ? `<text x="${midX}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="${COLOR_MAP.grey}">${escapeXml(text)}</text>`
    : "";

  // Arrowhead marker id based on color
  const markerId = `arrow-${arrow.props?.color ?? "black"}`;

  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"${dash} marker-end="url(#${markerId})"/>${labelEl}`;
}

function renderFrame(shape: any): string {
  const { x, y, props } = shape;
  const w = props.w ?? 600;
  const h = props.h ?? 400;
  const name = props.name ?? "";

  return `<g transform="translate(${x},${y})">
    <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${COLOR_MAP.grey}" stroke-width="1" stroke-dasharray="6,3" rx="4"/>
    ${name ? `<text x="8" y="-6" font-family="system-ui, sans-serif" font-size="12" fill="${COLOR_MAP.grey}">${escapeXml(name)}</text>` : ""}
  </g>`;
}

function renderNote(shape: any): string {
  const { x, y, props } = shape;
  const text = extractText(shape);
  const color = COLOR_MAP[props?.color] ?? COLOR_MAP.yellow;

  return `<g transform="translate(${x},${y})">
    <rect x="0" y="0" width="200" height="100" rx="2" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1"/>
    <text x="10" y="20" font-family="system-ui, sans-serif" font-size="11" fill="${COLOR_MAP.black}">${escapeXml(text)}</text>
  </g>`;
}

function render(filePath: string): string {
  const abs = resolve(filePath);
  const raw = readFileSync(abs, "utf-8");
  let tldr: { store: Record<string, any> };

  try {
    tldr = JSON.parse(raw);
  } catch {
    console.error(`Failed to parse ${abs} as JSON`);
    process.exit(1);
  }

  const store = tldr.store;
  const shapes = Object.entries(store).filter(
    ([k, v]) => k.startsWith("shape:") && v.typeName === "shape"
  );

  // Compute bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [, s] of shapes) {
    const x = s.x ?? 0;
    const y = s.y ?? 0;
    const w = s.props?.w ?? 200;
    const h = s.props?.h ?? 80;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  const padding = 60;
  minX -= padding;
  minY -= padding;
  const width = maxX - minX + padding;
  const height = maxY - minY + padding;

  // Collect unique arrow colors for markers
  const arrowColors = new Set<string>();
  for (const [, s] of shapes) {
    if (s.type === "arrow") arrowColors.add(s.props?.color ?? "black");
  }

  const markers = [...arrowColors]
    .map((c) => {
      const hex = COLOR_MAP[c] ?? COLOR_MAP.black;
      return `<marker id="arrow-${c}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${hex}"/></marker>`;
    })
    .join("\n    ");

  // Render layers: frames, then arrows, then shapes
  const frameEls = shapes
    .filter(([, s]) => s.type === "frame")
    .map(([, s]) => renderFrame(s));
  const arrowEls = shapes
    .filter(([, s]) => s.type === "arrow")
    .map(([, s]) => renderArrow(s, store));
  const geoEls = shapes
    .filter(([, s]) => s.type === "geo")
    .map(([, s]) => renderGeoShape(s));
  const noteEls = shapes
    .filter(([, s]) => s.type === "note")
    .map(([, s]) => renderNote(s));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>text { user-select: none; }</style>
    ${markers}
  </defs>
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="white"/>
  ${frameEls.join("\n  ")}
  ${arrowEls.join("\n  ")}
  ${geoEls.join("\n  ")}
  ${noteEls.join("\n  ")}
</svg>`;
}

// --- CLI ---
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(`Usage: bun run render_svg.ts --input <file.tldr> [--output <file.svg>]

Exports a .tldr workflow diagram to SVG.

Options:
  --input <path>    Input .tldr file (required)
  --output <path>   Output .svg file (default: same name with .svg extension)
  --help            Show this help`);
  process.exit(0);
}

let input: string | undefined;
let output: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--input" && args[i + 1]) {
    input = args[++i];
  } else if (args[i] === "--output" && args[i + 1]) {
    output = args[++i];
  }
}

if (!input) {
  // Try positional arg
  input = args.find((a) => !a.startsWith("--"));
}

if (!input) {
  console.error("No input file provided. Use --input <file.tldr>");
  process.exit(1);
}

if (!output) {
  output = input.replace(/\.tldr$/, ".svg");
  if (output === input) output = input + ".svg";
}

const svg = render(input);
writeFileSync(resolve(output), svg);
console.log(resolve(output));

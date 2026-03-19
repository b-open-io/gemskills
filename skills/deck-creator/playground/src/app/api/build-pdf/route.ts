import { PDF } from "@libpdf/core";
import { NextResponse } from "next/server";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILD_PRESENTER, getDeckDir, loadDeckState } from "@/lib/server/deck";
import { getAspectCanvasSize, isDeckAspectRatio } from "@/lib/aspect-ratio";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const CHROME_COMMANDS = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "chrome",
];

function findChromeBinary(): string | null {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  for (const cmd of CHROME_COMMANDS) {
    const check = spawnSync(cmd, ["--version"], {
      stdio: "pipe",
      encoding: "utf-8",
    });
    if (check.status === 0) return cmd;
  }
  return null;
}

function buildPresenter(deckDir: string): void {
  const result = spawnSync("bun", ["run", BUILD_PRESENTER, "--dir", deckDir], {
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `Failed to build presenter before PDF export${stderr ? `: ${stderr}` : ""}`,
    );
  }
}

async function captureSlidePngs(opts: {
  chromeBinary: string;
  origin: string;
  slideIndexes: number[];
  windowWidth: number;
  windowHeight: number;
}): Promise<string[]> {
  const tempDir = await mkdtemp(join(tmpdir(), "deck-pdf-"));
  const captures: string[] = [];

  try {
    for (const index of opts.slideIndexes) {
      const outputPath = join(
        tempDir,
        `${String(index).padStart(2, "0")}-slide-export.png`,
      );
      const url = `${opts.origin}/presenter?skipBuild=1&export=1&slide=${index}&t=${Date.now()}`;
      const result = await runCommand(opts.chromeBinary, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        `--window-size=${opts.windowWidth},${opts.windowHeight}`,
        "--virtual-time-budget=5000",
        `--screenshot=${outputPath}`,
        url,
      ]);
      if (result.code !== 0 || !existsSync(outputPath)) {
        const details = (result.stderr || result.stdout || "").trim();
        throw new Error(
          `Slide ${index} screenshot failed${details ? `: ${details}` : ""}`,
        );
      }
      captures.push(outputPath);
    }
    return captures;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function runCommand(
  command: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function writePdfFromPngs(
  paths: string[],
  pdfPath: string,
): Promise<void> {
  if (paths.length === 0) {
    throw new Error("No slide captures available for PDF export");
  }

  const pdf = PDF.create();
  for (const path of paths) {
    const bytes = await readFile(path);
    const image = pdf.embedPng(bytes);
    const page = pdf.addPage({ width: image.width, height: image.height });
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }
  const out = await pdf.save();
  await writeFile(pdfPath, Buffer.from(out));
}

export async function POST(req: Request) {
  let tempDirToCleanup: string | null = null;
  try {
    const deckDir = getDeckDir();
    const pdfPath = join(deckDir, "deck.pdf");
    const chromeBinary = findChromeBinary();
    if (!chromeBinary) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Chrome/Chromium executable not found. Install Google Chrome or Chromium to export PDFs from mixed HTML/image slides.",
        },
        { status: 500 },
      );
    }

    const deckState = loadDeckState();
    const rawSlides = (deckState.slides as Array<{ index: number }>) || [];
    const aspectRatio = isDeckAspectRatio(String(deckState.aspectRatio || ""))
      ? (deckState.aspectRatio as string)
      : "16:9";
    const canvasSize = getAspectCanvasSize(aspectRatio);
    const slideIndexes = rawSlides
      .map((slide) => Number(slide.index))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    if (slideIndexes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No slides found for PDF export" },
        { status: 400 },
      );
    }

    buildPresenter(deckDir);

    const origin = new URL(req.url).origin;
    const captures = await captureSlidePngs({
      chromeBinary,
      origin,
      slideIndexes,
      windowWidth: canvasSize.width,
      windowHeight: canvasSize.height,
    });
    tempDirToCleanup = captures.length > 0 ? join(captures[0], "..") : null;
    await writePdfFromPngs(captures, pdfPath);

    if (tempDirToCleanup) {
      await rm(tempDirToCleanup, { recursive: true, force: true });
    }

    console.error(`PDF built: ${pdfPath}`);
    return NextResponse.json({
      ok: true,
      path: pdfPath,
      slides: slideIndexes.length,
      renderer: "chrome-headless + @libpdf/core",
    });
  } catch (error: unknown) {
    if (tempDirToCleanup) {
      await rm(tempDirToCleanup, { recursive: true, force: true });
    }
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

#!/usr/bin/env bun
/**
 * Visual Planner playground launcher
 *
 * Sets TLDR_FILE env var and starts the Next.js dev server.
 *
 * Usage:
 *   bun run scripts/playground_server.ts --file <path.tldr>
 *   bun run scripts/playground_server.ts --file <path.tldr> --port=3458
 *   bun run scripts/playground_server.ts --file <path.tldr> --no-open
 *   bun run scripts/playground_server.ts --file <path.tldr> --wait-signal
 *
 * --wait-signal: Watch for the "Send to Agent" signal. When the user clicks
 *   the button, the updated diagram state is printed to stdout and the server
 *   exits. This enables the calling agent to capture the output inline.
 */

import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, watch, unlinkSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_DIR = resolve(__dirname, "../playground");

// ── CLI args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const NO_OPEN = args.includes("--no-open");
const WAIT_SIGNAL = args.includes("--wait-signal");
const DEFAULT_PORT = parseInt(args.find((a) => a.startsWith("--port="))?.split("=")[1] || "3458", 10);

let tldrFile = "";
const fileIdx = args.indexOf("--file");
if (fileIdx !== -1 && args[fileIdx + 1]) {
  tldrFile = args[fileIdx + 1];
} else {
  const fileArg = args.find((a) => a.startsWith("--file="));
  if (fileArg) tldrFile = fileArg.split("=")[1];
}

if (!tldrFile) {
  console.error("Error: --file <path.tldr> is required");
  console.error(
    "\nUsage: bun run scripts/playground_server.ts --file <path.tldr> [--port=3458] [--no-open]",
  );
  process.exit(1);
}

const resolvedFile = resolve(tldrFile);
if (!existsSync(resolvedFile)) {
  console.error(`Error: File not found: ${resolvedFile}`);
  process.exit(1);
}

// ── Ensure dependencies are installed ────────────────────────────────

// Clear .next cache to prevent stale NEXT_PUBLIC_* env vars from Turbopack
const nextCachePath = resolve(PLAYGROUND_DIR, ".next");
if (existsSync(nextCachePath)) {
  Bun.spawnSync(["rm", "-rf", nextCachePath], { cwd: PLAYGROUND_DIR });
}

const nodeModulesPath = resolve(PLAYGROUND_DIR, "node_modules");
if (!existsSync(nodeModulesPath)) {
  console.error("Installing playground dependencies...");
  const install = Bun.spawnSync(["bun", "install"], {
    cwd: PLAYGROUND_DIR,
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (install.exitCode !== 0) {
    console.error("Failed to install playground dependencies");
    process.exit(1);
  }
}

// ── Port conflict resolution ─────────────────────────────────────────

/**
 * Check if a port is in use by attempting to bind to it.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Kill the process occupying a port using lsof (macOS/Linux).
 * Returns true if a process was killed.
 */
function killPortProcess(port: number): boolean {
  const result = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`], {
    stdio: ["inherit", "pipe", "pipe"],
  });
  const pids = result.stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  if (pids.length === 0) return false;
  for (const pid of pids) {
    Bun.spawnSync(["kill", "-9", pid]);
  }
  return true;
}

/**
 * Find the first free port starting from `start`.
 */
async function findFreePort(start: number, max = start + 20): Promise<number> {
  for (let port = start; port <= max; port++) {
    if (!(await isPortInUse(port))) return port;
  }
  throw new Error(`No free port found in range ${start}–${max}`);
}

// Resolve the port to use, handling conflicts
let PORT: number;
if (await isPortInUse(DEFAULT_PORT)) {
  console.error(`Port ${DEFAULT_PORT} is already in use. Attempting to free it...`);
  const killed = killPortProcess(DEFAULT_PORT);
  if (killed) {
    // Brief pause to let the OS release the port
    await Bun.sleep(500);
    if (await isPortInUse(DEFAULT_PORT)) {
      PORT = await findFreePort(DEFAULT_PORT + 1);
      console.error(`Could not free port ${DEFAULT_PORT}. Using port ${PORT} instead.`);
    } else {
      PORT = DEFAULT_PORT;
      console.error(`Freed port ${DEFAULT_PORT}.`);
    }
  } else {
    PORT = await findFreePort(DEFAULT_PORT + 1);
    console.error(`Could not identify process on port ${DEFAULT_PORT}. Using port ${PORT} instead.`);
  }
} else {
  PORT = DEFAULT_PORT;
}

// ── Launch Next.js ──────────────────────────────────────────────────

const browserUrl = `http://localhost:${PORT}`;
const HEARTBEAT_FILE = join(tmpdir(), `visual-planner-heartbeat-${PORT}.tmp`);
console.error(`Visual Planner Playground starting at ${browserUrl}`);
console.error(`Diagram file: ${resolvedFile}`);

const proc = Bun.spawn(["bun", "run", "next", "dev", "--turbopack", "-p", String(PORT)], {
  cwd: PLAYGROUND_DIR,
  env: {
    ...process.env,
    TLDR_FILE: resolvedFile,
    HEARTBEAT_FILE,
    // Expose async mode to the Next.js app so the UI can show the correct button
    NEXT_PUBLIC_WAIT_SIGNAL: WAIT_SIGNAL ? "1" : "0",
  },
  // When waiting for signal, redirect Next.js stdout to stderr
  // so only the diagram JSON goes to stdout
  stdio: ["inherit", WAIT_SIGNAL ? "pipe" : "inherit", "inherit"],
});

// Pipe Next.js stdout to stderr when in signal mode
if (WAIT_SIGNAL && proc.stdout) {
  const reader = proc.stdout.getReader();
  (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      process.stderr.write(value);
    }
  })();
}

// Wait a moment for the server to start, then open browser
if (!NO_OPEN) {
  setTimeout(() => {
    const opener =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    Bun.spawn([opener, browserUrl]);
  }, 3000);
}

// ── Idle shutdown (auto-kill when browser tab closes) ───────────────

const IDLE_TIMEOUT_MS = 120_000; // 2 minutes — generous for background tab throttling
const IDLE_CHECK_MS = 15_000;

// Don't start checking until the browser has had time to load and send a first heartbeat
const idleWatcherDelay = setTimeout(() => {
  const idleChecker = setInterval(() => {
    try {
      const lastPing = parseInt(readFileSync(HEARTBEAT_FILE, "utf-8"), 10);
      if (Date.now() - lastPing > IDLE_TIMEOUT_MS) {
        console.error("No browser heartbeat for 2 minutes. Shutting down.");
        clearInterval(idleChecker);
        proc.kill("SIGTERM");
      }
    } catch {
      // Heartbeat file doesn't exist yet — browser hasn't loaded
    }
  }, IDLE_CHECK_MS);

  // Clean up interval on process exit
  process.on("exit", () => clearInterval(idleChecker));
}, 30_000); // 30s grace period for initial page load

process.on("exit", () => clearTimeout(idleWatcherDelay));

// ── Signal watcher (agent callback bridge) ─────────────────────────

const signalFile = `${resolvedFile}.signal`;

function cleanup() {
  proc.kill("SIGINT");
  try { unlinkSync(signalFile); } catch {}
  try { unlinkSync(HEARTBEAT_FILE); } catch {}
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

if (WAIT_SIGNAL) {
  // Clean up any stale signal from previous runs
  try { unlinkSync(signalFile); } catch {}

  console.error("Waiting for 'Send to Agent' signal...");

  // Watch the signal marker file
  const signalDir = dirname(resolvedFile);
  const signalBasename = `${resolvedFile.split("/").pop()}.signal`;

  const watcher = watch(signalDir, async (eventType, filename) => {
    if (filename !== signalBasename) return;
    if (!existsSync(signalFile)) return;

    // Signal received — read the updated .tldr and output to stdout
    try {
      const content = await readFile(resolvedFile, "utf-8");
      console.log(content); // stdout → captured by calling agent
      console.error("Signal received — diagram state sent to agent.");

      // Clean up signal marker
      try { unlinkSync(signalFile); } catch {}

      // Shut down
      watcher.close();
      cleanup();
    } catch (err) {
      console.error("Error reading diagram after signal:", err);
    }
  });
}

await proc.exited;

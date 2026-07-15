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
const portValue =
  args.find((a) => a.startsWith("--port="))?.split("=")[1] || process.env.PORT || "3458";
const REQUESTED_PORT = Number(portValue);
if (
  !/^\d+$/.test(portValue) ||
  !Number.isInteger(REQUESTED_PORT) ||
  REQUESTED_PORT < 1 ||
  REQUESTED_PORT > 65535
) {
  console.error(`Error: Invalid port: ${portValue}`);
  process.exit(1);
}
const HOST = process.env.HOST || "127.0.0.1";
const portlessUrl = process.env.PORTLESS_URL?.trim();

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
    server.listen(port, HOST);
  });
}

/**
 * Find the first free port starting from `start`.
 */
async function findFreePort(start: number, max = Math.min(start + 20, 65535)): Promise<number> {
  if (start > 65535) throw new Error("No valid ports remain after the requested port");
  for (let port = start; port <= max; port++) {
    if (!(await isPortInUse(port))) return port;
  }
  throw new Error(`No free port found in range ${start}–${max}`);
}

// Resolve the port to use, handling conflicts
let PORT: number;
if (await isPortInUse(REQUESTED_PORT)) {
  if (portlessUrl) {
    console.error(
      `Error: Portless assigned port ${REQUESTED_PORT}, but it is already in use. Refusing to use a different port because ${portlessUrl} would route to the wrong process.`,
    );
    process.exit(1);
  }
  PORT = await findFreePort(REQUESTED_PORT + 1);
  console.error(`Port ${REQUESTED_PORT} is already in use. Using port ${PORT} instead.`);
} else {
  PORT = REQUESTED_PORT;
}

// ── Launch Next.js ──────────────────────────────────────────────────

const browserHost =
  HOST === "0.0.0.0"
    ? "127.0.0.1"
    : HOST === "::"
      ? "[::1]"
      : HOST.includes(":")
        ? `[${HOST}]`
        : HOST;
const browserUrl = portlessUrl || `http://${browserHost}:${PORT}`;
const HEARTBEAT_FILE = join(tmpdir(), `visual-planner-heartbeat-${PORT}.tmp`);
try { unlinkSync(HEARTBEAT_FILE); } catch {}
console.error(`Visual Planner Playground starting at ${browserUrl}`);
console.error(`Diagram file: ${resolvedFile}`);

const proc = Bun.spawn(["bun", "run", "next", "dev", "--turbopack", "-H", HOST, "-p", String(PORT)], {
  cwd: PLAYGROUND_DIR,
  env: {
    ...process.env,
    HOST,
    PORT: String(PORT),
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
const heartbeatGraceOverride = Number(process.env.PLAYGROUND_HEARTBEAT_GRACE_MS);
const HEARTBEAT_GRACE_MS =
  Number.isFinite(heartbeatGraceOverride) && heartbeatGraceOverride > 0
    ? heartbeatGraceOverride
    : 120_000;
const heartbeatStartedAt = Date.now();
let lastHeartbeatAt: number | undefined;

// Don't start checking until the browser has had time to load and send a first heartbeat
const idleWatcherDelay = setTimeout(() => {
  const checkHeartbeat = () => {
    try {
      const lastPing = Number.parseInt(readFileSync(HEARTBEAT_FILE, "utf-8"), 10);
      if (Number.isFinite(lastPing)) lastHeartbeatAt = Math.min(lastPing, Date.now());
    } catch {}

    const now = Date.now();
    if (lastHeartbeatAt === undefined && now - heartbeatStartedAt >= HEARTBEAT_GRACE_MS) {
      console.error("No browser heartbeat received before the startup grace expired. Shutting down.");
      clearInterval(idleChecker);
      proc.kill("SIGTERM");
    } else if (lastHeartbeatAt !== undefined && now - lastHeartbeatAt > IDLE_TIMEOUT_MS) {
      console.error("No browser heartbeat for 2 minutes. Shutting down.");
      clearInterval(idleChecker);
      proc.kill("SIGTERM");
    }
  };
  const idleChecker = setInterval(checkHeartbeat, IDLE_CHECK_MS);
  checkHeartbeat();

  // Clean up interval on process exit
  process.on("exit", () => clearInterval(idleChecker));
}, Math.min(30_000, HEARTBEAT_GRACE_MS));

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

  const watcher = watch(signalDir, async (_eventType, filename) => {
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

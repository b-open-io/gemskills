/**
 * Provider configuration + resolution + a tiny CLI used by /gemskills:setup.
 *
 * Resolution precedence for a task's provider (highest first):
 *   1. explicit --provider flag
 *   2. env  GEMSKILLS_<TASK>_PROVIDER
 *   3. project config  ./.gemskills.json
 *   4. global config   $GEMSKILLS_CONFIG or ~/.config/gemskills/config.json
 *   5. capability-aware auto-pick (best ranked provider whose key is present
 *      and which supports the requested capabilities)
 *
 * Both scopes are merged (project overrides global), so a repo can pin its own
 * defaults while the user keeps a global baseline.
 */

import { existsSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { resolve, dirname } from "path";
import type { Provider } from "./keys";
import { hasKey } from "./keys";
import type { Task } from "./types";
import { RANKINGS, TASK_PROVIDERS, supports } from "./types";
import type { Capability } from "./types";

export interface GemskillsConfig {
  version: number;
  providers?: Partial<Record<Task, Provider>>;
  models?: Record<string, string>;
}

export type ConfigScope = "global" | "project";

export function globalConfigPath(): string {
  return process.env.GEMSKILLS_CONFIG || resolve(homedir(), ".config/gemskills/config.json");
}

export function projectConfigPath(): string {
  return resolve(process.cwd(), ".gemskills.json");
}

function configPath(scope: ConfigScope): string {
  return scope === "global" ? globalConfigPath() : projectConfigPath();
}

async function readConfig(path: string): Promise<GemskillsConfig | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf-8")) as GemskillsConfig;
  } catch {
    console.error(`Warning: ignoring malformed config at ${path}`);
    return null;
  }
}

/** Merged view (project overrides global). */
export async function loadConfig(): Promise<GemskillsConfig> {
  const g = (await readConfig(globalConfigPath())) || { version: 1 };
  const p = (await readConfig(projectConfigPath())) || { version: 1 };
  return {
    version: 1,
    providers: { ...g.providers, ...p.providers },
    models: { ...g.models, ...p.models },
  };
}

function envProvider(task: Task): Provider | undefined {
  const v = process.env[`GEMSKILLS_${task.toUpperCase()}_PROVIDER`];
  if (!v) return undefined;
  if (!TASK_PROVIDERS[task].includes(v as Provider)) {
    console.error(`Warning: GEMSKILLS_${task.toUpperCase()}_PROVIDER="${v}" is not valid for ${task}; ignoring.`);
    return undefined;
  }
  return v as Provider;
}

export type ResolutionSource = "flag" | "env" | "project" | "global" | "auto";

export interface Resolution {
  provider: Provider;
  source: ResolutionSource;
}

/**
 * Pick the provider for a task. `caps` are the capabilities THIS request needs
 * (e.g. ["transparent"] or ["styleTile"]); auto-pick filters by them.
 */
export async function resolveProvider(
  task: Task,
  opts: { explicit?: string; caps?: Capability[] } = {}
): Promise<Resolution> {
  const caps = opts.caps || [];

  if (opts.explicit) {
    if (!TASK_PROVIDERS[task].includes(opts.explicit as Provider)) {
      console.error(`Error: --provider ${opts.explicit} is not valid for ${task}. Valid: ${TASK_PROVIDERS[task].join(", ")}`);
      process.exit(1);
    }
    return { provider: opts.explicit as Provider, source: "flag" };
  }

  const env = envProvider(task);
  if (env) return { provider: env, source: "env" };

  const project = (await readConfig(projectConfigPath()))?.providers?.[task];
  if (project) return { provider: project, source: "project" };

  const global = (await readConfig(globalConfigPath()))?.providers?.[task];
  if (global) return { provider: global, source: "global" };

  // Auto-pick: best-ranked provider that supports caps; prefer one with a key.
  const eligible = RANKINGS[task].filter((p) => supports(task, p, caps));
  if (!eligible.length) {
    console.error(`Error: no provider supports the requested capabilities for ${task}: ${caps.join(", ")}`);
    process.exit(1);
  }
  const withKey = eligible.filter((p) => hasKey(p));
  return { provider: (withKey[0] || eligible[0]) as Provider, source: "auto" };
}

export async function setProvider(task: Task, provider: Provider, scope: ConfigScope): Promise<string> {
  if (!TASK_PROVIDERS[task].includes(provider)) {
    throw new Error(`${provider} is not valid for ${task}. Valid: ${TASK_PROVIDERS[task].join(", ")}`);
  }
  const path = configPath(scope);
  const current = (await readConfig(path)) || { version: 1 };
  current.version = 1;
  current.providers = { ...current.providers, [task]: provider };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(current, null, 2) + "\n");
  return path;
}

export function detectKeys(): Record<Provider, boolean> {
  return { gemini: hasKey("gemini"), openai: hasKey("openai"), xai: hasKey("xai") };
}

// ── CLI (used by the setup skill/command and for manual inspection) ──

async function cli() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "detect": {
      const keys = detectKeys();
      console.log(JSON.stringify(keys, null, 2));
      break;
    }
    case "show": {
      const cfg = await loadConfig();
      console.log(JSON.stringify({ global: globalConfigPath(), project: projectConfigPath(), merged: cfg, keys: detectKeys() }, null, 2));
      break;
    }
    case "path":
      console.log(JSON.stringify({ global: globalConfigPath(), project: projectConfigPath() }, null, 2));
      break;
    case "get": {
      const task = rest[0] as Task;
      if (!task || !(task in TASK_PROVIDERS)) { console.error("Usage: config get <image|video|edit>"); process.exit(1); }
      console.log(JSON.stringify(await resolveProvider(task), null, 2));
      break;
    }
    case "set": {
      const task = rest[0] as Task;
      const provider = rest[1] as Provider;
      const scope = (rest.includes("--project") ? "project" : "global") as ConfigScope;
      if (!task || !provider) { console.error("Usage: config set <image|video|edit> <gemini|openai|xai> [--project]"); process.exit(1); }
      try {
        const path = await setProvider(task, provider, scope);
        console.log(`Set ${task} → ${provider} (${scope}) in ${path}`);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
      break;
    }
    default:
      console.error("Usage: config <detect|show|path|get|set>");
      process.exit(1);
  }
}

// Run CLI only when invoked directly (not when imported).
if (import.meta.main) {
  await cli();
}

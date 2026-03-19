import { resolve } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";

/**
 * Resolves the gemskills plugin root directory across all installation environments:
 * 1. GEMSKILLS_ROOT env var (any platform — set by user or CI)
 * 2. Relative ../../.. from the calling script (full plugin tree intact)
 * 3. Claude Code installed_plugins.json registry
 * 4. Claude Code plugin cache directory scan
 */
export function resolvePluginRoot(scriptDir: string): string {
  const _check = (p: string) => (p && existsSync(resolve(p, "utils.ts"))) ? p : null;

  const fromEnv = _check(process.env.GEMSKILLS_ROOT || "");
  if (fromEnv) return fromEnv;

  const fromRel = _check(resolve(scriptDir, "../../.."));
  if (fromRel) return fromRel;

  const home = process.env.HOME || process.env.USERPROFILE || "";
  try {
    const pf = resolve(home, ".claude/plugins/installed_plugins.json");
    const data = JSON.parse(readFileSync(pf, "utf-8"));
    const ip = data.plugins?.["gemskills@b-open-io"]?.[0]?.installPath;
    if (ip && _check(ip)) return ip;
  } catch {}

  try {
    const cd = resolve(home, ".claude/plugins/cache/b-open-io/gemskills");
    const vs = readdirSync(cd).filter(v => /^\d+\./.test(v)).sort();
    for (let i = vs.length - 1; i >= 0; i--) {
      const p = resolve(cd, vs[i]);
      if (_check(p)) return p;
    }
  } catch {}

  throw new Error(
    "Cannot find gemskills plugin root. Set GEMSKILLS_ROOT or: claude plugin install gemskills@b-open-io"
  );
}

/**
 * Bootstraps the resolver when resolve-root.ts can't be found at its relative path.
 * Used by the dynamic import catch handler in scripts.
 */
export function bootstrapPluginRoot(): string {
  return resolvePluginRoot("");
}

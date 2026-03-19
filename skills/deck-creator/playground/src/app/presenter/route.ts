import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD_PRESENTER, getDeckDir } from "@/lib/server/deck";

export async function GET(req: Request) {
  const deckDir = getDeckDir();
  const presenterPath = join(deckDir, "presenter.html");
  const { searchParams } = new URL(req.url);
  const skipBuild = searchParams.get("skipBuild") === "1";

  if (!skipBuild) {
    const build = spawnSync("bun", ["run", BUILD_PRESENTER, "--dir", deckDir], {
      stdio: "pipe",
      encoding: "utf-8",
    });

    if (build.status !== 0) {
      const stderr = (build.stderr || build.stdout || "").trim();
      return new Response(
        `Presenter build failed${stderr ? `:\n${stderr}` : ""}`,
        { status: 500 },
      );
    }
  }

  if (!existsSync(presenterPath)) {
    return new Response("Presenter not built yet", { status: 404 });
  }

  return new Response(readFileSync(presenterPath, "utf-8"), {
    headers: { "Content-Type": "text/html" },
  });
}

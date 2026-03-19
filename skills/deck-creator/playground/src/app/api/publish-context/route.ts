import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { NextResponse } from "next/server";
import {
	getDeckDir,
	getSlidesDir,
	getSlidesSubdir,
	loadDeckState,
} from "@/lib/server/deck";
import { listVercelScopes } from "@/lib/server/publish";

function normalizeGitUrl(url: string): string {
	let normalized = url.trim();
	const sshMatch = normalized.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
	if (sshMatch) {
		normalized = `https://${sshMatch[1]}/${sshMatch[2]}`;
	}
	return normalized.replace(/\.git$/, "");
}

function toSlug(input: string): string {
	const slug = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "deck";
}

export async function GET() {
	try {
		const deckDir = getDeckDir();
		const slidesDir = getSlidesDir();
		const slidesSubdir = getSlidesSubdir();
		const deckState = loadDeckState();
		const title =
			(typeof deckState.title === "string" && deckState.title.trim()) ||
			basename(deckDir);

		const hasDeckPlan = existsSync(join(deckDir, "DECK-PLAN.md"));
		const hasDeckIndex = existsSync(join(deckDir, "DECK-INDEX.md"));
		const hasTheme = existsSync(join(deckDir, "THEME.md"));
		const hasPresenter = existsSync(join(deckDir, "presenter.html"));
		const hasPdf = existsSync(join(deckDir, "deck.pdf"));

		const slideFiles = existsSync(slidesDir)
			? readdirSync(slidesDir)
					.filter((f) => /\.(png|jpg|jpeg|webp|html)$/i.test(f))
					.sort()
			: [];
		const htmlSlides = slideFiles.filter((f) => /\.html$/i.test(f)).length;
		const imageSlides = slideFiles.length - htmlSlides;

		let repoRoot: string | null = null;
		let originUrl: string | null = null;
		const topLevel = spawnSync(
			"git",
			["-C", deckDir, "rev-parse", "--show-toplevel"],
			{
				stdio: "pipe",
			},
		);
		if (topLevel.status === 0) {
			repoRoot = topLevel.stdout.toString().trim() || null;
		}
		if (repoRoot) {
			const remote = spawnSync(
				"git",
				["-C", repoRoot, "remote", "get-url", "origin"],
				{
					stdio: "pipe",
				},
			);
			if (remote.status === 0) {
				const raw = remote.stdout.toString().trim();
				originUrl = raw ? normalizeGitUrl(raw) : null;
			}
		}
		const isDeckRepoRoot = repoRoot === deckDir;

		const hasVercelJson = existsSync(join(deckDir, "vercel.json"));
		const scopesResult = listVercelScopes();
		const vercelLinkPath = join(deckDir, ".vercel", "project.json");
		let vercelProject:
			| { projectId?: string; orgId?: string; projectName?: string }
			| null = null;
		if (existsSync(vercelLinkPath)) {
			try {
				const parsed = JSON.parse(readFileSync(vercelLinkPath, "utf-8")) as {
					projectId?: unknown;
					orgId?: unknown;
					projectName?: unknown;
				};
				vercelProject = {
					projectId:
						typeof parsed.projectId === "string"
							? parsed.projectId
							: undefined,
					orgId: typeof parsed.orgId === "string" ? parsed.orgId : undefined,
					projectName:
						typeof parsed.projectName === "string"
							? parsed.projectName
							: undefined,
				};
			} catch {
				vercelProject = null;
			}
		}

		return NextResponse.json({
			ok: true,
			deckDir,
			title,
			suggestedProjectName: toSlug(title),
			slidesSubdir,
			summary: {
				hasDeckPlan,
				hasDeckIndex,
				hasTheme,
				hasPresenter,
				hasPdf,
				slideFileCount: slideFiles.length,
				htmlSlideCount: htmlSlides,
				imageSlideCount: imageSlides,
			},
			git: {
				repoRoot,
				originUrl,
				isDeckRepoRoot,
				isGitRepo: Boolean(repoRoot),
			},
			vercel: {
				hasVercelJson,
				isLinked: Boolean(vercelProject),
				project: vercelProject,
				scopes: scopesResult.scopes,
				scopesError: scopesResult.error || null,
			},
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

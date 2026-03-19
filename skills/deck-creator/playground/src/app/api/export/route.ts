import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { SlideData } from "@/lib/server/deck";
import {
	getDeckDir,
	getSlidesDir,
	getSlidesSubdir,
	loadDeckState,
	resolveSlideAssetPath,
	resolveVideoAssetPath,
} from "@/lib/server/deck";

const SLIDE_FILE_RE = /\.(png|jpg|jpeg|webp|html)$/i;

function sanitizeSlideFilename(value: string): string | null {
	const trimmed = value.trim().replace(/\\/g, "/");
	if (!trimmed) return null;

	const withoutPrefix = trimmed.replace(/^(slides|pages)\//i, "");
	if (
		!withoutPrefix ||
		withoutPrefix.includes("/") ||
		withoutPrefix.includes("..")
	) {
		return null;
	}
	if (!SLIDE_FILE_RE.test(withoutPrefix)) return null;
	return withoutPrefix;
}

function isExternalMedia(value: string): boolean {
	return /^https?:\/\//i.test(value) || /^\/\//.test(value);
}

function detectBackgroundKind(value: string): "none" | "video" | "image" {
	const raw = value.trim().toLowerCase();
	if (!raw || raw === "none") return "none";
	if (raw.startsWith("/videos/") || raw.startsWith("videos/")) return "video";
	if (raw.startsWith("/slides/") || raw.startsWith("slides/")) return "image";
	if (/\.(mp4|m3u8|webm|mov|m4v)([?#].*)?$/.test(raw)) return "video";
	if (/\.(png|jpe?g|webp|gif|avif)([?#].*)?$/.test(raw)) return "image";
	return "none";
}

function normalizeMediaFilename(
	value: string,
	kind: "video" | "image",
): string | null {
	let normalized = value.trim().replace(/^\/+/, "");
	if (kind === "video") normalized = normalized.replace(/^videos\//i, "");
	if (kind === "image")
		normalized = normalized.replace(/^(slides|pages)\//i, "");
	if (!normalized || normalized.includes("/") || normalized.includes(".."))
		return null;
	return normalized;
}

export async function GET() {
	const stagedGlobalAssets: string[] = [];
	const cleanupStagedGlobalAssets = () => {
		for (const stagedPath of stagedGlobalAssets) {
			if (existsSync(stagedPath)) unlinkSync(stagedPath);
		}
	};

	try {
		const deckDir = getDeckDir();
		const slidesDir = getSlidesDir();
		const slidesSubdir = getSlidesSubdir();
		const deckState = loadDeckState();
		const title = (deckState.title as string) || "Untitled Deck";
		const slides = (deckState.slides || []) as SlideData[];
		const slug =
			title
				.replace(/[^a-z0-9]+/gi, "-")
				.replace(/-+$/, "")
				.toLowerCase() || "deck";
		const filename = `${slug}.deck`;
		const outPath = join(deckDir, filename);

		const manifest = {
			format: "deck",
			version: 1,
			title,
			slideCount: slides.length,
			created: new Date().toISOString(),
			skill: "deck-creator",
			usage: {
				playground: `bun run skills/deck-creator/scripts/playground_server.ts --dir <extracted-path>`,
				presenter: "open presenter.html",
				pdf: "open deck.pdf",
			},
		};
		const manifestPath = join(deckDir, "MANIFEST.json");
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

		const selectedBackgroundMedia = (
			typeof deckState.videoBackground === "string"
				? deckState.videoBackground
				: typeof deckState.videoUrl === "string"
					? deckState.videoUrl
					: ""
		).trim();
		if (
			selectedBackgroundMedia &&
			selectedBackgroundMedia !== "none" &&
			!isExternalMedia(selectedBackgroundMedia)
		) {
			const mediaKind = detectBackgroundKind(selectedBackgroundMedia);
			if (mediaKind === "video") {
				const filename = normalizeMediaFilename(
					selectedBackgroundMedia,
					"video",
				);
				if (filename) {
					const sourcePath = resolveVideoAssetPath(filename);
					const targetPath = join(deckDir, filename);
					if (
						sourcePath &&
						sourcePath !== targetPath &&
						!existsSync(targetPath) &&
						existsSync(sourcePath)
					) {
						copyFileSync(sourcePath, targetPath);
						stagedGlobalAssets.push(targetPath);
					}
				}
			} else if (mediaKind === "image") {
				const filename = normalizeMediaFilename(
					selectedBackgroundMedia,
					"image",
				);
				if (filename) {
					const sourcePath = resolveSlideAssetPath(filename);
					const targetPath = join(slidesDir, filename);
					if (
						sourcePath &&
						sourcePath !== targetPath &&
						!existsSync(targetPath) &&
						existsSync(sourcePath)
					) {
						copyFileSync(sourcePath, targetPath);
						stagedGlobalAssets.push(targetPath);
					}
				}
			}
		}

		const includeSet = new Set<string>(["MANIFEST.json"]);
		const candidates = [
			"DECK-INDEX.md",
			"DECK-PLAN.md",
			"THEME.md",
			"ANNOTATIONS.json",
			"ANNOTATION-SESSIONS.json",
			"VARIANTS.json",
			"VIDEOS.json",
			"PRESENTER-CONFIG.json",
			"presenter.html",
			"deck.pdf",
		];
		for (const f of candidates) {
			if (existsSync(join(deckDir, f))) includeSet.add(f);
		}

		// Keep all top-level mp4 assets in the export for portability.
		const videoFiles = readdirSync(deckDir).filter((f) => /\.mp4$/i.test(f));
		for (const videoFile of videoFiles) includeSet.add(videoFile);

		if (existsSync(slidesDir)) {
			const diskSlideFiles = readdirSync(slidesDir)
				.filter((f) => SLIDE_FILE_RE.test(f))
				.sort();

			let includedSlides = 0;
			for (const slide of slides) {
				const safeFilename = sanitizeSlideFilename(slide.filename || "");
				if (safeFilename && diskSlideFiles.includes(safeFilename)) {
					includeSet.add(`${slidesSubdir}/${safeFilename}`);
					includedSlides += 1;
					continue;
				}

				// Deck index can be stale; use numeric fallback (e.g. 03-*).
				const prefix = `${String(slide.index).padStart(2, "0")}-`;
				const fallback = diskSlideFiles.find((f) => f.startsWith(prefix));
				if (fallback) {
					includeSet.add(`${slidesSubdir}/${fallback}`);
					includedSlides += 1;
				}
			}

			// Safety fallback for legacy decks without valid slide metadata.
			if (includedSlides === 0) {
				for (const slideFile of diskSlideFiles) {
					includeSet.add(`${slidesSubdir}/${slideFile}`);
				}
			}
		}

		const includeFiles = Array.from(includeSet);

		if (existsSync(outPath)) unlinkSync(outPath);

		const zipResult = spawnSync("zip", ["-r", filename, ...includeFiles], {
			cwd: deckDir,
			stdio: "pipe",
		});

		if (existsSync(manifestPath)) unlinkSync(manifestPath);

		if (zipResult.status !== 0) {
			const stderr = zipResult.stderr?.toString() || "zip command failed";
			cleanupStagedGlobalAssets();
			return new Response(JSON.stringify({ ok: false, error: stderr }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}

		const zipBytes = readFileSync(outPath);
		if (existsSync(outPath)) unlinkSync(outPath);
		cleanupStagedGlobalAssets();

		return new Response(zipBytes, {
			headers: {
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="${filename}"`,
			},
		});
	} catch (error: unknown) {
		cleanupStagedGlobalAssets();
		const msg = error instanceof Error ? error.message : String(error);
		return new Response(JSON.stringify({ ok: false, error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}

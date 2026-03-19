import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isDeckAspectRatio, isVideoModelAspectRatio } from "@/lib/aspect-ratio";
import {
	createVideoJob,
	getGlobalVideoStorageDir,
	getSlidesDir,
	getStylesRegistry,
	setVideoJobDone,
	setVideoJobError,
	TILES_DIR,
	upsertVideoLibraryEntry,
} from "@/lib/server/deck";
import { callGeminiVideo, getApiKey, loadImage } from "@/lib/server/gemini";
import {
	composeStyleInstructionsForRole,
	isKnownStyleRecipeId,
	type StyleRecipeInfo,
} from "@/lib/style-recipes";

function slugifyPrompt(prompt: string): string {
	return prompt
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.split(/\s+/)
		.slice(0, 6)
		.join("-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function buildUniqueVideoFilename(storageDir: string, prompt: string): string {
	const now = new Date();
	const stamp = [
		now.getFullYear().toString(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
		"-",
		String(now.getHours()).padStart(2, "0"),
		String(now.getMinutes()).padStart(2, "0"),
		String(now.getSeconds()).padStart(2, "0"),
		String(now.getMilliseconds()).padStart(3, "0"),
	].join("");
	const slug = slugifyPrompt(prompt) || "video-background";
	const base = `${stamp}-${slug}`;

	let filename = `${base}.mp4`;
	let counter = 2;
	while (existsSync(join(storageDir, filename))) {
		filename = `${base}-${counter}.mp4`;
		counter += 1;
	}
	return filename;
}

export async function POST(req: Request) {
	try {
		const body = (await req.json()) as {
			prompt: string;
			aspectRatio?: string;
			styleId?: string;
			styleRecipeId?: string | null;
			styleRecipes?: StyleRecipeInfo[];
			stylePrompt?: string;
			themeConfig?: Record<string, string>;
			duration?: "4" | "6" | "8";
			inputImagePath?: string; // backdrop filename in slides dir for image-to-video
		};
		const styleRecipeId =
			typeof body.styleRecipeId === "string"
				? body.styleRecipeId.trim() || null
				: body.styleRecipeId;

		if (!body.prompt?.trim()) {
			return NextResponse.json(
				{ ok: false, error: "prompt is required" },
				{ status: 400 },
			);
		}
		const rawAspectRatio = String(body.aspectRatio || "").trim();
		if (rawAspectRatio && !isDeckAspectRatio(rawAspectRatio)) {
			return NextResponse.json(
				{ ok: false, error: `Unsupported aspectRatio "${rawAspectRatio}"` },
				{ status: 400 },
			);
		}
		const aspectRatio = isDeckAspectRatio(rawAspectRatio)
			? rawAspectRatio
			: "16:9";
		if (!isVideoModelAspectRatio(aspectRatio)) {
			return NextResponse.json(
				{
					ok: false,
					error: `Video generation currently supports 16:9 or 9:16 only. Selected aspect ratio is ${aspectRatio}.`,
				},
				{ status: 422 },
			);
		}
		const videoAspectRatio = aspectRatio as "16:9" | "9:16";
		if (body.duration && !["4", "6", "8"].includes(body.duration)) {
			return NextResponse.json(
				{ ok: false, error: `Unsupported duration "${body.duration}"` },
				{ status: 400 },
			);
		}
		if (
			typeof styleRecipeId === "string" &&
			!isKnownStyleRecipeId(styleRecipeId, body.styleRecipes)
		) {
			return NextResponse.json(
				{
					ok: false,
					error: `Unknown styleRecipeId "${styleRecipeId}"`,
				},
				{ status: 400 },
			);
		}

		const prompt = body.prompt.trim();
		const apiKey = getApiKey();
		const videoStorageDir = getGlobalVideoStorageDir();
		const registry = getStylesRegistry();
		const filename = buildUniqueVideoFilename(videoStorageDir, prompt);
		const outputPath = join(videoStorageDir, filename);
		const jobId = createVideoJob(filename);

		// Auto-inject seamless looping language if not already present
		let videoPrompt = prompt;
		let tileImage: Awaited<ReturnType<typeof loadImage>> = null;

		if (body.styleId) {
			const style = registry.styles.find(
				(s) => s.id === body.styleId || s.shortName === body.styleId,
			);
			if (!style) {
				return NextResponse.json(
					{ ok: false, error: `Unknown styleId "${body.styleId}"` },
					{ status: 400 },
				);
			}
			videoPrompt = `Art style target: ${style.name}\nUse art style for composition, form, texture, and motion language. Keep color choices aligned to theme palette constraints when provided.\nStyle guidance: ${style.promptHints}\n\n${videoPrompt}`;
			const tilePath = join(TILES_DIR, `${style.id}.png`);
			if (existsSync(tilePath)) {
				tileImage = await loadImage(tilePath);
				if (tileImage) {
					videoPrompt = `Match the visual language from the attached style reference image (composition, form, texture, motion character) without copying literal composition or palette.\n\n${videoPrompt}`;
				}
			}
		}

		const tc = body.themeConfig || {};
		const paletteLines = [
			tc.background ? `Background/base tone: ${tc.background}` : "",
			tc.primary ? `Primary/accent hue: ${tc.primary}` : "",
			tc.foreground ? `Foreground contrast target: ${tc.foreground}` : "",
			tc.card ? `Surface color family: ${tc.card}` : "",
			tc["muted-foreground"]
				? `Muted detail tone: ${tc["muted-foreground"]}`
				: "",
		].filter(Boolean);
		if (paletteLines.length > 0) {
			videoPrompt = `Theme palette constraints:\n${paletteLines.map((line) => `- ${line}`).join("\n")}\n\n${videoPrompt}`;
		}

		const styleInstructions = composeStyleInstructionsForRole({
			role: "video-background",
			styleRecipeId,
			styleRecipes: body.styleRecipes,
			customPrompt: body.stylePrompt,
		});
		if (styleInstructions) {
			videoPrompt = `${styleInstructions}\n\nVideo brief:\n${videoPrompt}`;
		}
		if (!videoPrompt.toLowerCase().includes("loop")) {
			videoPrompt += ", seamless loop, perfect loop point, continuous motion";
		}

		// Load input backdrop image for image-to-video (Animate feature)
		let inputImage: Awaited<ReturnType<typeof loadImage>> = null;
		if (body.inputImagePath) {
			const slidesDir = getSlidesDir();
			const imagePath = join(slidesDir, body.inputImagePath);
			if (existsSync(imagePath)) {
				inputImage = await loadImage(imagePath);
				if (inputImage) {
					videoPrompt = `Animate this presentation backdrop into seamless looping motion. Maintain the composition, colors, and visual elements from the source image. Add subtle, elegant motion (parallax, particles, light shifts, gentle animation) that brings the static image to life.\n\n${videoPrompt}`;
				}
			}
		}

		callGeminiVideo(apiKey, videoPrompt, {
			image: inputImage || tileImage || undefined,
			aspectRatio: videoAspectRatio,
			durationSeconds: body.duration || "8",
			outputPath,
		})
			.then((result) => {
				setVideoJobDone(jobId, result.videoPath);
				upsertVideoLibraryEntry(filename, {
					prompt,
					composedPrompt: videoPrompt,
					createdAt: Date.now(),
					duration: body.duration || "8",
					styleId: body.styleId,
					styleRecipeId,
					stylePrompt: body.stylePrompt,
					themeConfig: tc,
					aspectRatio,
				});
				console.error(`Video generation complete: ${result.videoPath}`);
			})
			.catch((err) => {
				const msg = err instanceof Error ? err.message : String(err);
				setVideoJobError(jobId, msg);
				console.error(`Video generation failed: ${msg}`);
			});

		return NextResponse.json({ ok: true, jobId, filename });
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`Video generation request failed: ${msg}`);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

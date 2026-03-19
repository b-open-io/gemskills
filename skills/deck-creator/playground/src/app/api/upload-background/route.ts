import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
	getGlobalBackgroundStorageDir,
	getGlobalVideoStorageDir,
} from "@/lib/server/deck";

const IMAGE_MIME_TO_EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
};

function sanitizeBaseName(name: string): string {
	return name
		.toLowerCase()
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/[^a-z0-9-_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48);
}

function buildUniqueFilePath(
	dir: string,
	baseName: string,
	ext: string,
): { filename: string; path: string } {
	const stamp = Date.now();
	const safeBase = sanitizeBaseName(baseName) || "background";
	let filename = `${safeBase}-${stamp}.${ext}`;
	let filePath = join(dir, filename);
	let n = 2;
	while (existsSync(filePath)) {
		filename = `${safeBase}-${stamp}-${n}.${ext}`;
		filePath = join(dir, filename);
		n += 1;
	}
	return { filename, path: filePath };
}

export async function POST(req: Request) {
	try {
		const form = await req.formData();
		const file = form.get("file");
		if (!(file instanceof File)) {
			return NextResponse.json(
				{ ok: false, error: "file is required" },
				{ status: 400 },
			);
		}
		if (file.size <= 0) {
			return NextResponse.json(
				{ ok: false, error: "uploaded file is empty" },
				{ status: 400 },
			);
		}

		const mime = file.type || "";
		const originalName = file.name || "background";

		if (mime === "video/mp4") {
			const videosDir = getGlobalVideoStorageDir();
			await mkdir(videosDir, { recursive: true });
			const target = buildUniqueFilePath(videosDir, originalName, "mp4");
			await writeFile(target.path, Buffer.from(await file.arrayBuffer()));
			return NextResponse.json({
				ok: true,
				mediaType: "video",
				filename: target.filename,
			});
		}

		const imageExt = IMAGE_MIME_TO_EXT[mime];
		if (!imageExt) {
			return NextResponse.json(
				{
					ok: false,
					error:
						"Unsupported file type. Upload .mp4, .png, .jpg/.jpeg, or .webp.",
				},
				{ status: 415 },
			);
		}

		const backgroundsDir = getGlobalBackgroundStorageDir();
		await mkdir(backgroundsDir, { recursive: true });
		const target = buildUniqueFilePath(
			backgroundsDir,
			`bg-${originalName}`,
			imageExt,
		);
		await writeFile(target.path, Buffer.from(await file.arrayBuffer()));
		return NextResponse.json({
			ok: true,
			mediaType: "image",
			filename: target.filename,
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

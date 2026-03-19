import { existsSync, readFileSync } from "node:fs";
import { resolveSlideAssetPath } from "@/lib/server/deck";

function getContentType(filename: string): string {
	if (/\.html$/i.test(filename)) return "text/html";
	if (/\.jpe?g$/i.test(filename)) return "image/jpeg";
	if (/\.webp$/i.test(filename)) return "image/webp";
	if (/\.gif$/i.test(filename)) return "image/gif";
	if (/\.avif$/i.test(filename)) return "image/avif";
	return "image/png";
}

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ filename: string }> },
) {
	const { filename } = await params;
	if (filename.includes("..") || filename.includes("/")) {
		return new Response("Invalid filename", { status: 400 });
	}

	const filePath = resolveSlideAssetPath(filename);
	if (!filePath || !existsSync(filePath)) {
		return new Response("Not found", { status: 404 });
	}

	const contentType = getContentType(filename);
	return new Response(readFileSync(filePath), {
		headers: {
			"Content-Type": contentType,
			"Cache-Control": "no-cache",
		},
	});
}

export async function HEAD(
	_req: Request,
	{ params }: { params: Promise<{ filename: string }> },
) {
	const { filename } = await params;
	if (filename.includes("..") || filename.includes("/")) {
		return new Response(null, { status: 400 });
	}

	const filePath = resolveSlideAssetPath(filename);
	if (!filePath || !existsSync(filePath)) {
		return new Response(null, { status: 404 });
	}

	return new Response(null, { status: 200 });
}

import { existsSync, readFileSync } from "node:fs";
import { resolveVideoAssetPath } from "@/lib/server/deck";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ filename: string }> },
) {
	const { filename } = await params;
	if (
		filename.includes("..") ||
		filename.includes("/") ||
		!/\.mp4$/i.test(filename)
	) {
		return new Response("Invalid filename", { status: 400 });
	}

	const filePath = resolveVideoAssetPath(filename);
	if (!filePath || !existsSync(filePath)) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(readFileSync(filePath), {
		headers: {
			"Content-Type": "video/mp4",
			"Cache-Control": "no-cache",
		},
	});
}

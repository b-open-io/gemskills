export type BackgroundMediaKind = "none" | "video" | "image";

const VIDEO_EXTENSIONS = [".mp4", ".m3u8", ".webm", ".mov", ".m4v"];
const IMAGE_EXTENSIONS = [
	".png",
	".jpg",
	".jpeg",
	".webp",
	".gif",
	".avif",
];

function normalizePath(value: string): string {
	return value.split("#")[0].split("?")[0].trim().toLowerCase();
}

function hasExt(path: string, exts: string[]): boolean {
	return exts.some((ext) => path.endsWith(ext));
}

export function getBackgroundMediaKind(value?: string): BackgroundMediaKind {
	const raw = (value || "").trim();
	if (!raw) return "none";
	if (raw === "none") return "none";

	const path = normalizePath(raw);
	if (path.startsWith("/videos/") || path.startsWith("videos/")) return "video";
	if (path.startsWith("/slides/") || path.startsWith("slides/")) return "image";
	if (hasExt(path, VIDEO_EXTENSIONS)) return "video";
	if (hasExt(path, IMAGE_EXTENSIONS)) return "image";
	return "none";
}

export function isVideoBackground(value?: string): boolean {
	return getBackgroundMediaKind(value) === "video";
}

export function isImageBackground(value?: string): boolean {
	return getBackgroundMediaKind(value) === "image";
}

export function resolveBackgroundMediaSrc(value?: string): string {
	const raw = (value || "").trim();
	if (!raw || raw === "none") return "";
	if (/^https?:\/\//i.test(raw) || /^\/\//.test(raw) || raw.startsWith("/")) {
		return raw;
	}

	const kind = getBackgroundMediaKind(raw);
	if (kind === "video") return `/videos/${raw}`;
	if (kind === "image") return `/slides/${raw}`;
	return raw;
}

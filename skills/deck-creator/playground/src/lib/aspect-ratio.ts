export const DECK_ASPECT_RATIOS = ["16:9", "4:3", "3:4", "9:16", "1:1"] as const

export type DeckAspectRatio = (typeof DECK_ASPECT_RATIOS)[number]

export const DECK_ASPECT_RATIO_LABELS: Record<DeckAspectRatio, string> = {
	"16:9": "Widescreen (16:9)",
	"4:3": "Classic (4:3)",
	"3:4": "Portrait (3:4)",
	"9:16": "Vertical (9:16)",
	"1:1": "Square (1:1)",
}

export const VIDEO_MODEL_ASPECT_RATIOS = ["16:9", "9:16"] as const
export type VideoModelAspectRatio = (typeof VIDEO_MODEL_ASPECT_RATIOS)[number]

export function isDeckAspectRatio(value: string): value is DeckAspectRatio {
	return DECK_ASPECT_RATIOS.includes(value as DeckAspectRatio)
}

export function isVideoModelAspectRatio(
	value: string,
): value is VideoModelAspectRatio {
	return VIDEO_MODEL_ASPECT_RATIOS.includes(value as VideoModelAspectRatio)
}

export function parseAspectRatio(value: string): { width: number; height: number } {
	const m = value.trim().match(/^(\d+)\s*:\s*(\d+)$/)
	if (!m) return { width: 16, height: 9 }
	const width = Number.parseInt(m[1], 10)
	const height = Number.parseInt(m[2], 10)
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return { width: 16, height: 9 }
	}
	return { width, height }
}

export function getAspectCanvasSize(
	aspectRatio: string,
	baseLongSide = 1920,
): { width: number; height: number } {
	const { width: aspectW, height: aspectH } = parseAspectRatio(aspectRatio)
	const longSide = Math.max(1, Math.round(baseLongSide))
	let width = longSide
	let height = longSide
	if (aspectW >= aspectH) {
		height = Math.max(1, Math.round((longSide * aspectH) / aspectW))
	} else {
		width = Math.max(1, Math.round((longSide * aspectW) / aspectH))
	}
	return { width, height }
}

export function toCssAspectRatio(aspectRatio: string): string {
	const { width, height } = parseAspectRatio(aspectRatio)
	return `${width} / ${height}`
}

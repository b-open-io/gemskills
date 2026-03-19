import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

const inputPath = process.argv[2];
const region = process.argv[3] || "all"; // "top", "bottom", "all"

if (!inputPath) {
	console.error("Usage: bun run scripts/analyze-bg.ts <parallax-image> [region]");
	console.error("Analyzes parallax image to extract dominant background color");
	console.error("");
	console.error("Regions:");
	console.error("  top    - Analyze top 20% of image (for top border)");
	console.error("  bottom - Analyze bottom 20% of image (for bottom border)");
	console.error("  all    - Analyze entire image (default)");
	console.error("");
	console.error("Output: Hex color code (e.g., #1a2b3c)");
	process.exit(1);
}

function rgbToHex(r: number, g: number, b: number): string {
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

async function analyzeBg() {
	const data = await readFile(inputPath);
	const png = PNG.sync.read(data);
	const { width, height } = png;

	// Determine region to analyze
	let startY = 0;
	let endY = height;

	if (region === "top") {
		endY = Math.floor(height * 0.2);
	} else if (region === "bottom") {
		startY = Math.floor(height * 0.8);
	}

	// Collect colors
	let totalR = 0;
	let totalG = 0;
	let totalB = 0;
	let count = 0;

	// Also track color frequency for mode (most common color)
	const colorCounts = new Map<string, number>();

	for (let y = startY; y < endY; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (width * y + x) * 4;
			const r = png.data[idx];
			const g = png.data[idx + 1];
			const b = png.data[idx + 2];
			const a = png.data[idx + 3];

			// Skip transparent pixels
			if (a < 128) continue;

			totalR += r;
			totalG += g;
			totalB += b;
			count++;

			// Quantize to reduce unique colors (group similar colors)
			const qr = Math.round(r / 16) * 16;
			const qg = Math.round(g / 16) * 16;
			const qb = Math.round(b / 16) * 16;
			const key = `${qr},${qg},${qb}`;
			colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
		}
	}

	if (count === 0) {
		console.error("Error: No opaque pixels found in region");
		process.exit(1);
	}

	// Calculate average color
	const avgR = Math.round(totalR / count);
	const avgG = Math.round(totalG / count);
	const avgB = Math.round(totalB / count);

	// Find most common (mode) color
	let maxCount = 0;
	let modeColor = "0,0,0";
	for (const [color, freq] of colorCounts.entries()) {
		if (freq > maxCount) {
			maxCount = freq;
			modeColor = color;
		}
	}
	const [modeR, modeG, modeB] = modeColor.split(",").map(Number);

	const avgHex = rgbToHex(avgR, avgG, avgB);
	const modeHex = rgbToHex(modeR, modeG, modeB);

	// Output machine-readable format
	console.log(JSON.stringify({
		region,
		pixels: count,
		average: {
			hex: avgHex,
			rgb: { r: avgR, g: avgG, b: avgB },
		},
		dominant: {
			hex: modeHex,
			rgb: { r: modeR, g: modeG, b: modeB },
			frequency: maxCount,
		},
		// Also output just the hex for easy piping
		recommended: avgHex,
	}));
}

analyzeBg().catch((err) => {
	console.error("Error:", err.message);
	process.exit(1);
});

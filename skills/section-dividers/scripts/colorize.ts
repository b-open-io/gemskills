import sharp from "sharp";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const targetColor = process.argv[4] || "#0d3d3d"; // Default: dark teal

if (!inputPath || !outputPath) {
	console.error("Usage: bun run scripts/colorize.ts <input> <output> [color]");
	console.error("Example: bun run scripts/colorize.ts input.png output.png '#0d3d3d'");
	process.exit(1);
}

// Parse hex color
function parseHex(color: string): { r: number; g: number; b: number } {
	const hex = color.replace("#", "");
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16),
	};
}

async function colorize() {
	const target = parseHex(targetColor);
	const image = sharp(inputPath);
	const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

	const pixels = info.width * info.height;
	const outputData = Buffer.alloc(pixels * 4);

	for (let i = 0; i < pixels; i++) {
		const r = data[i * 4];
		const g = data[i * 4 + 1];
		const b = data[i * 4 + 2];
		const a = data[i * 4 + 3];

		// Calculate luminance of original pixel (0-255)
		const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

		// Tint the pixel with target color, preserving luminance
		outputData[i * 4] = Math.round(target.r * (1 - luminance) + 255 * luminance * (target.r / 255));
		outputData[i * 4 + 1] = Math.round(target.g * (1 - luminance) + 255 * luminance * (target.g / 255));
		outputData[i * 4 + 2] = Math.round(target.b * (1 - luminance) + 255 * luminance * (target.b / 255));
		outputData[i * 4 + 3] = a; // Preserve alpha
	}

	await sharp(outputData, {
		raw: {
			width: info.width,
			height: info.height,
			channels: 4,
		},
	})
		.png()
		.toFile(outputPath);

	console.log(`✓ Colorized to ${targetColor}: ${outputPath}`);
}

colorize().catch(console.error);

import sharp from "sharp";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
	console.error("Usage: bun run scripts/remove-magenta.ts <input> <output>");
	process.exit(1);
}

async function removeMagenta() {
	const image = sharp(inputPath);
	const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

	// Create new buffer with alpha channel
	const pixels = info.width * info.height;
	const outputData = Buffer.alloc(pixels * 4);

	for (let i = 0; i < pixels; i++) {
		const r = data[i * 3];
		const g = data[i * 3 + 1];
		const b = data[i * 3 + 2];

		// Check if pixel is close to magenta/pink (#FF00FF and variations)
		// Magenta has high R, low G, high B with R ≈ B
		const isMagenta = r > 150 && g < 120 && b > 150 && Math.abs(r - b) < 80;

		// Also catch lighter magenta/pink where R and B are similar and both > G
		const isPink = r > 120 && b > 120 && g < r - 30 && g < b - 30 && Math.abs(r - b) < 100;

		// Catch darker/duller magentas that appear at edges
		const isDullMagenta = r > 100 && b > 100 && g < 80 && r > g + 40 && b > g + 40;

		// Calculate alpha based on distance from magenta
		let alpha = 255;
		if (isMagenta || isPink || isDullMagenta) {
			// Magenta/pink = fully transparent
			alpha = 0;
		} else {
			// Transition zone - partial transparency based on magenta-ness
			// The more "magenta-like" (high R, high B, low G), the more transparent
			const magentaStrength = Math.min(r, b) - g;
			const rbBalance = 100 - Math.abs(r - b); // Higher when R ≈ B

			if (magentaStrength > 20 && rbBalance > 40) {
				// Aggressive transition for magenta-ish colors
				const factor = ((magentaStrength - 20) / 100) * (rbBalance / 100);
				alpha = Math.max(0, Math.round(255 * (1 - factor * 2)));
			}
		}

		outputData[i * 4] = r;
		outputData[i * 4 + 1] = g;
		outputData[i * 4 + 2] = b;
		outputData[i * 4 + 3] = alpha;
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

	console.log(`✓ Saved: ${outputPath}`);
}

removeMagenta().catch(console.error);

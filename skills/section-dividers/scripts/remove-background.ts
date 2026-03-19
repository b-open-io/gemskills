import sharp from "sharp";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const targetColor = process.argv[4] || "magenta"; // magenta, green, blue, white, black, or hex

if (!inputPath || !outputPath) {
	console.error("Usage: bun run scripts/remove-background.ts <input> <output> [color]");
	console.error("Colors: magenta (default), green, blue, white, black, or hex like #FF00FF");
	process.exit(1);
}

// Parse target color
function parseTargetColor(color: string): { r: number; g: number; b: number } {
	const colors: Record<string, { r: number; g: number; b: number }> = {
		magenta: { r: 255, g: 0, b: 255 },
		green: { r: 0, g: 255, b: 0 },
		blue: { r: 0, g: 0, b: 255 },
		white: { r: 255, g: 255, b: 255 },
		black: { r: 0, g: 0, b: 0 },
	};

	if (colors[color.toLowerCase()]) {
		return colors[color.toLowerCase()];
	}

	// Parse hex
	const hex = color.replace("#", "");
	if (hex.length === 6) {
		return {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex.slice(2, 4), 16),
			b: parseInt(hex.slice(4, 6), 16),
		};
	}

	return colors.magenta; // default
}

// Calculate color distance in LAB color space for better perceptual accuracy
function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
	// RGB to XYZ
	let rr = r / 255;
	let gg = g / 255;
	let bb = b / 255;

	rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
	gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
	bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

	const x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047;
	const y = (rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750);
	const z = (rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041) / 1.08883;

	// XYZ to LAB
	const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
	const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
	const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

	return {
		l: (116 * fy) - 16,
		a: 500 * (fx - fy),
		b: 200 * (fy - fz)
	};
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
	const lab1 = rgbToLab(r1, g1, b1);
	const lab2 = rgbToLab(r2, g2, b2);

	// Delta E (CIE76) - perceptual color difference
	return Math.sqrt(
		Math.pow(lab1.l - lab2.l, 2) +
		Math.pow(lab1.a - lab2.a, 2) +
		Math.pow(lab1.b - lab2.b, 2)
	);
}

async function removeBackground() {
	const target = parseTargetColor(targetColor);
	const image = sharp(inputPath);
	const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

	const pixels = info.width * info.height;
	const outputData = Buffer.alloc(pixels * 4);

	// Thresholds for LAB distance - balanced for clean edges without eating silhouette
	const fullTransparentThreshold = 40;  // Only very close to pure magenta
	const partialTransparentThreshold = 60; // Small transition zone

	for (let i = 0; i < pixels; i++) {
		const r = data[i * 3];
		const g = data[i * 3 + 1];
		const b = data[i * 3 + 2];

		const distance = colorDistance(r, g, b, target.r, target.g, target.b);

		// Strict magenta detection - only catch true magenta, not dark colors
		const isPureMagenta = r > 200 && b > 200 && g < 100;
		const isBrightPink = r > 220 && b > 180 && g < 150;

		let alpha = 255;
		if (distance < fullTransparentThreshold || isPureMagenta || isBrightPink) {
			// Very close to pure magenta = fully transparent
			alpha = 0;
		} else if (distance < partialTransparentThreshold) {
			// Transition zone - smooth falloff
			const t = (distance - fullTransparentThreshold) / (partialTransparentThreshold - fullTransparentThreshold);
			alpha = Math.round(t * 255);
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

	console.log(`✓ Removed ${targetColor} background: ${outputPath}`);
}

removeBackground().catch(console.error);

import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
	console.error("Usage: bun run scripts/defringe.ts <input> <output>");
	console.error("Removes white matte/fringe from transparent PNG edges");
	process.exit(1);
}

async function defringe() {
	console.log("📖 Reading image...");
	const data = await readFile(inputPath);
	const png = PNG.sync.read(data);
	const { width, height } = png;

	console.log(`🔍 Processing ${width}x${height} image...`);

	// For each pixel, if it has any transparency (alpha < 255),
	// we need to remove the white contamination from the RGB values
	// This is called "unmultiplying" or "removing premultiplied alpha"
	// and then adjusting for white matte

	let modified = 0;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (width * y + x) * 4;
			const r = png.data[idx];
			const g = png.data[idx + 1];
			const b = png.data[idx + 2];
			const a = png.data[idx + 3];

			// Skip fully transparent pixels
			if (a === 0) continue;

			// Skip fully opaque pixels that are already dark
			if (a === 255 && r < 50 && g < 50 && b < 50) continue;

			// For semi-transparent pixels or light pixels near edges,
			// calculate what the color should be without white matte

			// If this pixel has partial alpha, the visible color is:
			// displayed = foreground * alpha + background * (1 - alpha)
			// If background was white (255,255,255), we can estimate the true foreground

			if (a < 255 && a > 0) {
				const alphaFraction = a / 255;

				// Estimate original foreground color by removing white contribution
				// foreground = (displayed - white * (1-alpha)) / alpha
				// For a black silhouette, we want to push colors toward black

				// Simple approach: darken edge pixels proportionally to their transparency
				// The more transparent, the more likely to be edge with white bleed
				const darkenFactor = 1 - (1 - alphaFraction) * 0.8;

				const newR = Math.max(0, Math.round(r * darkenFactor - (255 - a) * 0.3));
				const newG = Math.max(0, Math.round(g * darkenFactor - (255 - a) * 0.3));
				const newB = Math.max(0, Math.round(b * darkenFactor - (255 - a) * 0.3));

				if (newR !== r || newG !== g || newB !== b) {
					png.data[idx] = newR;
					png.data[idx + 1] = newG;
					png.data[idx + 2] = newB;
					modified++;
				}
			}

			// Also handle nearly-opaque pixels that are too light (gray fringe)
			if (a > 200) {
				const brightness = (r + g + b) / 3;
				// If it's a grayish pixel (not pure black), darken it
				if (brightness > 30 && brightness < 200) {
					// Check if it's near a transparent pixel (edge detection)
					let nearTransparent = false;
					for (let dy = -1; dy <= 1 && !nearTransparent; dy++) {
						for (let dx = -1; dx <= 1 && !nearTransparent; dx++) {
							if (dx === 0 && dy === 0) continue;
							const nx = x + dx;
							const ny = y + dy;
							if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
								const nidx = (width * ny + nx) * 4;
								if (png.data[nidx + 3] < 128) {
									nearTransparent = true;
								}
							}
						}
					}

					if (nearTransparent) {
						// This is an edge pixel with gray/white contamination
						// Push it toward black
						const factor = 0.3;
						png.data[idx] = Math.round(r * factor);
						png.data[idx + 1] = Math.round(g * factor);
						png.data[idx + 2] = Math.round(b * factor);
						modified++;
					}
				}
			}
		}
	}

	console.log(`✏️  Modified ${modified} edge pixels`);

	const output = PNG.sync.write(png);
	await writeFile(outputPath, output);
	console.log(`✓ Defringed image saved: ${outputPath}`);
}

defringe().catch((err) => {
	console.error("Error:", err.message);
	process.exit(1);
});

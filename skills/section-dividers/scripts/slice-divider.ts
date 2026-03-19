import sharp from "sharp";

const input = process.argv[2];
const topOutput = process.argv[3];
const bottomOutput = process.argv[4];

if (!input || !topOutput || !bottomOutput) {
	console.error("Usage: bun run scripts/slice-divider.ts <input> <top-output> <bottom-output>");
	process.exit(1);
}

async function slice() {
	const metadata = await sharp(input).metadata();
	const halfHeight = Math.floor(metadata.height! / 2);

	// Extract top half
	await sharp(input)
		.extract({ left: 0, top: 0, width: metadata.width!, height: halfHeight })
		.toFile(topOutput);
	console.log(`✓ Top: ${topOutput}`);

	// Extract bottom half
	await sharp(input)
		.extract({ left: 0, top: halfHeight, width: metadata.width!, height: halfHeight })
		.toFile(bottomOutput);
	console.log(`✓ Bottom: ${bottomOutput}`);
}

slice().catch(console.error);

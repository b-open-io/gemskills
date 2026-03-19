import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
	console.error("Usage: bun run scripts/remove-bg.ts <input> <output>");
	console.error(
		"Uses Replicate's AI background remover for clean edge detection",
	);
	process.exit(1);
}

const REPLICATE_API_TOKEN =
	process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
if (!REPLICATE_API_TOKEN) {
	console.error(
		"Error: REPLICATE_API_TOKEN or REPLICATE_API_KEY environment variable not set",
	);
	process.exit(1);
}

async function uploadToTmpFiles(
	filePath: string,
): Promise<string> {
	// Read file and convert to base64 data URL for Replicate
	const fileData = await readFile(filePath);
	const base64 = fileData.toString("base64");
	const mimeType = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
	return `data:${mimeType};base64,${base64}`;
}

async function removeBackground() {
	console.log("📤 Uploading image...");
	const imageData = await uploadToTmpFiles(inputPath);

	console.log("🔍 Removing background via Replicate (rembg model)...");
	const response = await fetch(
		"https://api.replicate.com/v1/predictions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
				"Content-Type": "application/json",
				Prefer: "wait",
			},
			body: JSON.stringify({
				version: "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
				input: {
					image: imageData,
				},
			}),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Replicate API error: ${response.status} - ${error}`);
	}

	const result = await response.json();

	if (result.error) {
		throw new Error(`Replicate error: ${result.error}`);
	}

	if (result.status === "failed") {
		throw new Error(`Replicate prediction failed: ${JSON.stringify(result)}`);
	}

	// Get the output URL
	const outputUrl = result.output;
	if (!outputUrl) {
		throw new Error(`No output URL in response: ${JSON.stringify(result)}`);
	}

	console.log("📥 Downloading result...");
	const imageResponse = await fetch(outputUrl);
	if (!imageResponse.ok) {
		throw new Error(`Failed to download result: ${imageResponse.status}`);
	}

	const imageBuffer = await imageResponse.arrayBuffer();
	await writeFile(outputPath, Buffer.from(imageBuffer));

	console.log(`✓ Background removed: ${outputPath}`);
}

removeBackground().catch((err) => {
	console.error("Error:", err.message);
	process.exit(1);
});

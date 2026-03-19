/**
 * Image processing functions for icon generation
 * - Background removal via Replicate rembg
 * - Crop and center using sharp
 * - Resize to preset sizes
 * - ICO/ICNS bundle generation
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import sharp from "sharp";
import { getPreset, type IconPreset } from "./presets";

/**
 * Remove background using Replicate's rembg model
 */
export async function removeBackground(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const REPLICATE_API_TOKEN =
    process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;

  if (!REPLICATE_API_TOKEN) {
    throw new Error(
      "REPLICATE_API_TOKEN or REPLICATE_API_KEY environment variable not set"
    );
  }

  // Read file and convert to base64 data URL
  const fileData = await readFile(inputPath);
  const base64 = fileData.toString("base64");
  const mimeType = inputPath.endsWith(".png") ? "image/png" : "image/jpeg";
  const imageData = `data:${mimeType};base64,${base64}`;

  console.log("  Removing background via Replicate (rembg model)...");

  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version:
        "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      input: {
        image: imageData,
      },
    }),
  });

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

  const outputUrl = result.output;
  if (!outputUrl) {
    throw new Error(`No output URL in response: ${JSON.stringify(result)}`);
  }

  // Download result
  const imageResponse = await fetch(outputUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download result: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(imageBuffer));
}

/**
 * Crop whitespace and center on square transparent canvas
 */
export async function cropAndCenter(
  inputPath: string,
  outputPath: string,
  options: {
    targetSize: number;
    padding?: number; // Percentage (0-1), default 0.05 (5%)
  }
): Promise<void> {
  const { targetSize, padding = 0.05 } = options;

  // Load image and get trimmed bounds
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions");
  }

  // Trim whitespace/transparent edges and get info
  const trimmed = await image.trim().toBuffer({ resolveWithObject: true });

  const trimmedWidth = trimmed.info.width;
  const trimmedHeight = trimmed.info.height;

  // Calculate the content area with padding
  const contentSize = Math.max(trimmedWidth, trimmedHeight);
  const paddedSize = Math.ceil(contentSize / (1 - padding * 2));

  // Calculate offset to center the trimmed content
  const offsetX = Math.floor((paddedSize - trimmedWidth) / 2);
  const offsetY = Math.floor((paddedSize - trimmedHeight) / 2);

  // Create centered image on square canvas
  const centered = await sharp({
    create: {
      width: paddedSize,
      height: paddedSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: trimmed.data,
        left: offsetX,
        top: offsetY,
      },
    ])
    .png()
    .toBuffer();

  // Resize to target size
  await sharp(centered)
    .resize(targetSize, targetSize, {
      kernel: sharp.kernel.lanczos3,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

/**
 * Resize image to all sizes defined in a preset
 */
export async function resizeToPreset(
  inputPath: string,
  outputDir: string,
  presetName: string
): Promise<string[]> {
  const preset = getPreset(presetName);
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`);
  }

  await mkdir(outputDir, { recursive: true });

  const createdFiles: string[] = [];
  const processedSizes = new Set<string>(); // Track size+filename combos to avoid duplicates

  for (const sizeSpec of preset.sizes) {
    const filename = sizeSpec.filename || `icon-${sizeSpec.size}.png`;
    const sizeKey = `${sizeSpec.size}-${filename}`;

    // Skip duplicates (some presets have same size for different contexts)
    if (processedSizes.has(sizeKey)) continue;
    processedSizes.add(sizeKey);

    const outputPath = join(outputDir, filename);

    // Ensure subdirectory exists for nested paths (e.g., mipmap-xxxhdpi/)
    await mkdir(dirname(outputPath), { recursive: true });

    await sharp(inputPath)
      .resize(sizeSpec.size, sizeSpec.size, {
        kernel: sharp.kernel.lanczos3,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    createdFiles.push(outputPath);
  }

  return createdFiles;
}

/**
 * Generate ICO file from multiple PNG sizes using ImageMagick
 * Falls back to copying 32x32 as basic favicon.ico if ImageMagick unavailable
 */
export async function generateICO(
  pngDir: string,
  outputPath: string,
  sizes: number[] = [256, 128, 64, 48, 32, 24, 16]
): Promise<boolean> {
  // Find available PNG files for the requested sizes
  const pngFiles: string[] = [];
  for (const size of sizes) {
    const candidates = [
      join(pngDir, `icon-${size}.png`),
      join(pngDir, `favicon-${size}x${size}.png`),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        pngFiles.push(candidate);
        break;
      }
    }
  }

  if (pngFiles.length === 0) {
    console.log("  Warning: No PNG files found for ICO generation");
    return false;
  }

  // Try ImageMagick convert
  try {
    const proc = Bun.spawnSync(["which", "convert"]);
    if (proc.exitCode === 0) {
      const convertProc = Bun.spawnSync([
        "convert",
        ...pngFiles,
        outputPath,
      ]);
      if (convertProc.exitCode === 0) {
        return true;
      }
    }
  } catch {
    // ImageMagick not available
  }

  // Fallback: copy smallest available PNG as .ico
  // (browsers accept PNG content in .ico files)
  const fallbackPng = pngFiles[pngFiles.length - 1]; // Smallest size
  if (fallbackPng && existsSync(fallbackPng)) {
    await writeFile(outputPath, await readFile(fallbackPng));
    console.log("  Note: ImageMagick not found, using PNG fallback for favicon.ico");
    return true;
  }

  return false;
}

/**
 * Generate ICNS file from iconset directory using macOS iconutil
 */
export async function generateICNS(
  iconsetDir: string,
  outputPath: string
): Promise<boolean> {
  // Verify iconset directory exists and has correct naming
  if (!iconsetDir.endsWith(".iconset")) {
    console.log("  Warning: iconset directory must end with .iconset");
    return false;
  }

  if (!existsSync(iconsetDir)) {
    console.log(`  Warning: iconset directory not found: ${iconsetDir}`);
    return false;
  }

  // Run iconutil
  try {
    const proc = Bun.spawnSync([
      "iconutil",
      "-c",
      "icns",
      iconsetDir,
      "-o",
      outputPath,
    ]);

    if (proc.exitCode === 0) {
      return true;
    } else {
      console.log(`  Warning: iconutil failed: ${proc.stderr.toString()}`);
      return false;
    }
  } catch (err) {
    console.log(`  Warning: iconutil not available (macOS only)`);
    return false;
  }
}

/**
 * Prepare iconset directory for ICNS generation
 */
export async function prepareIconset(
  masterPath: string,
  iconsetDir: string
): Promise<void> {
  await mkdir(iconsetDir, { recursive: true });

  // macOS iconset sizes and filenames
  const iconsetSizes = [
    { size: 16, filename: "icon_16x16.png" },
    { size: 32, filename: "icon_16x16@2x.png" },
    { size: 32, filename: "icon_32x32.png" },
    { size: 64, filename: "icon_32x32@2x.png" },
    { size: 128, filename: "icon_128x128.png" },
    { size: 256, filename: "icon_128x128@2x.png" },
    { size: 256, filename: "icon_256x256.png" },
    { size: 512, filename: "icon_256x256@2x.png" },
    { size: 512, filename: "icon_512x512.png" },
    { size: 1024, filename: "icon_512x512@2x.png" },
  ];

  for (const { size, filename } of iconsetSizes) {
    await sharp(masterPath)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(join(iconsetDir, filename));
  }
}

/**
 * Fill background with solid color (for iOS icons that require no transparency)
 */
export async function fillBackground(
  inputPath: string,
  outputPath: string,
  color: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 }
): Promise<void> {
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions");
  }

  // Create solid background and composite the image on top
  await sharp({
    create: {
      width: metadata.width,
      height: metadata.height,
      channels: 3,
      background: color,
    },
  })
    .composite([
      {
        input: inputPath,
        blend: "over",
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

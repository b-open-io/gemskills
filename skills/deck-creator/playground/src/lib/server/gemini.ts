/**
 * Gemini API utilities for the playground server.
 * Local versions of getApiKey(), callGemini(), callGeminiImage(),
 * callGeminiVideo(), loadImage(), and saveImage() to avoid
 * importing from outside the Next.js project root.
 */

import { GoogleGenAI } from "@google/genai"
import type {
	GenerateContentConfig,
	Image,
	ImageConfig,
	GenerateVideosConfig,
} from "@google/genai"
import { readFile, writeFile, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"

// ---------------------------------------------------------------------------
// Text generation
// ---------------------------------------------------------------------------

export interface GeminiResult {
	content: string
	reasoning?: string
	finishReason?: string
	usage?: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
}

const DEFAULT_TEXT_MODEL = "gemini-3.1-pro-preview"
const DEFAULT_VIDEO_MODEL = "veo-3.1-generate-preview"

export function getTextModel(): string {
	return process.env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL
}

export function getVideoModel(): string {
	return process.env.GEMINI_VIDEO_MODEL || DEFAULT_VIDEO_MODEL
}

export function getApiKey(): string {
	const apiKey = process.env.GEMINI_API_KEY
	if (!apiKey) {
		throw new Error(
			"GEMINI_API_KEY environment variable is not set. Get one at https://aistudio.google.com/apikey",
		)
	}
	return apiKey
}

export async function callGemini(
	apiKey: string,
	prompt: string,
	options: {
		model?: string
		instructions?: string
		maxTokens?: number
		temperature?: number
		topP?: number
	} = {},
): Promise<GeminiResult> {
	const ai = new GoogleGenAI({ apiKey })
	const model = options.model || getTextModel()

	const config: GenerateContentConfig = {
		systemInstruction: options.instructions,
		maxOutputTokens: options.maxTokens,
		temperature: options.temperature,
		topP: options.topP,
	}

	const response = await ai.models.generateContent({
		model,
		contents: prompt,
		config,
	})

	let content = ""
	let reasoning: string | undefined
	const firstCandidate = response.candidates?.[0]
	const finishReason = firstCandidate?.finishReason
		? String(firstCandidate.finishReason)
		: undefined

	if (firstCandidate?.content?.parts) {
		for (const part of firstCandidate.content.parts) {
			if (part.thought) {
				if (part.text) reasoning = (reasoning || "") + part.text
			} else if (part.text) {
				content += part.text
			}
		}
	}

	return {
		content,
		reasoning,
		finishReason,
		usage: response.usageMetadata
			? {
					promptTokens: response.usageMetadata.promptTokenCount || 0,
					completionTokens:
						response.usageMetadata.candidatesTokenCount || 0,
					totalTokens: response.usageMetadata.totalTokenCount || 0,
				}
			: undefined,
	}
}

// ---------------------------------------------------------------------------
// Image loading / saving
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
}

function getMimeType(filePath: string): string {
	const ext = filePath.toLowerCase().split(".").pop() || ""
	return MIME_TYPES[ext] || "image/png"
}

export async function loadImage(filePath: string): Promise<Image | null> {
	if (!existsSync(filePath)) return null
	const buffer = await readFile(filePath)
	return {
		imageBytes: buffer.toString("base64"),
		mimeType: getMimeType(filePath),
	}
}

export async function saveImage(
	data: string,
	mimeType: string,
	outputPath: string,
): Promise<string> {
	const buffer = Buffer.from(data, "base64")
	const wantsPng = outputPath.toLowerCase().endsWith(".png")
	const isPng = mimeType === "image/png"

	if (wantsPng && !isPng) {
		const tempPath = outputPath.replace(/\.png$/i, ".tmp.jpg")
		await writeFile(tempPath, buffer)
		const result = spawnSync(
			"sips",
			["-s", "format", "png", tempPath, "--out", outputPath],
			{ stdio: "pipe" },
		)
		await unlink(tempPath).catch((error: unknown) => {
			const msg = error instanceof Error ? error.message : String(error)
			console.error(`Failed to delete temporary image "${tempPath}": ${msg}`)
		})
		if (result.status !== 0) await writeFile(outputPath, buffer)
	} else {
		await writeFile(outputPath, buffer)
	}

	return outputPath
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

export interface GeminiImageResult {
	text?: string
	images: Array<{ mimeType: string; data: string }>
	usage?: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
}

const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image"

export function getImageModel(): string {
	return process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL
}

export async function callGeminiImage(
	apiKey: string,
	prompt: string,
	options: {
		imageSize?: string
		aspectRatio?: string
		inputImage?: Image
		inputImages?: Image[]
		seed?: number
		instructions?: string
	} = {},
): Promise<GeminiImageResult> {
	const ai = new GoogleGenAI({ apiKey })
	const parts: Array<
		| { text: string }
		| { inlineData: { data: string; mimeType: string } }
	> = []

	if (options.inputImages?.length) {
		for (const img of options.inputImages) {
			if (img.imageBytes)
				parts.push({
					inlineData: {
						data: img.imageBytes,
						mimeType: img.mimeType || "image/png",
					},
				})
		}
	} else if (options.inputImage?.imageBytes) {
		parts.push({
			inlineData: {
				data: options.inputImage.imageBytes,
				mimeType: options.inputImage.mimeType || "image/png",
			},
		})
	}
	parts.push({ text: prompt })

	const imageConfig: ImageConfig = {}
	if (options.imageSize)
		imageConfig.imageSize = options.imageSize as ImageConfig["imageSize"]
	if (options.aspectRatio)
		imageConfig.aspectRatio =
			options.aspectRatio as ImageConfig["aspectRatio"]

	const config: GenerateContentConfig = {
		responseModalities: ["IMAGE", "TEXT"],
		seed: options.seed,
		systemInstruction: options.instructions,
	}
	if (Object.keys(imageConfig).length > 0) config.imageConfig = imageConfig

	const response = await ai.models.generateContent({
		model: getImageModel(),
		contents: [{ role: "user", parts }],
		config,
	})

	const images: Array<{ mimeType: string; data: string }> = []
	let text: string | undefined
	if (response.candidates?.[0]?.content?.parts) {
		for (const part of response.candidates[0].content.parts) {
			if (part.inlineData)
				images.push({
					mimeType: part.inlineData.mimeType || "image/png",
					data: part.inlineData.data || "",
				})
			else if (part.text) text = part.text
		}
	}

	return {
		text,
		images,
		usage: response.usageMetadata
			? {
					promptTokens: response.usageMetadata.promptTokenCount || 0,
					completionTokens:
						response.usageMetadata.candidatesTokenCount || 0,
					totalTokens: response.usageMetadata.totalTokenCount || 0,
				}
			: undefined,
	}
}

// ---------------------------------------------------------------------------
// Video generation
// ---------------------------------------------------------------------------

export interface GeminiVideoResult {
	videoPath: string
	durationSeconds: number
}

export async function callGeminiVideo(
	apiKey: string,
	prompt: string,
	options: {
		image?: Image
		aspectRatio?: "16:9" | "9:16"
		durationSeconds?: "4" | "6" | "8"
		outputPath: string
	},
): Promise<GeminiVideoResult> {
	const ai = new GoogleGenAI({ apiKey })
	const config: GenerateVideosConfig = { numberOfVideos: 1 }
	if (options.aspectRatio) config.aspectRatio = options.aspectRatio
	if (options.durationSeconds)
		config.durationSeconds = parseInt(options.durationSeconds)

	let operation = await ai.models.generateVideos({
		model: getVideoModel(),
		prompt,
		image: options.image,
		config,
	})

	while (!operation.done) {
		await new Promise((resolve) => setTimeout(resolve, 5000))
		operation = await ai.operations.getVideosOperation({ operation })
	}

	if (operation.error)
		throw new Error(
			`Video generation failed: ${JSON.stringify(operation.error)}`,
		)

	const generatedVideos = operation.response?.generatedVideos
	if (!generatedVideos?.length) {
		const resp = operation.response as
			| Record<string, unknown>
			| undefined
		const reasons = (resp?.raiMediaFilteredReasons as string[]) || []
		throw new Error(
			`No video returned${reasons.length ? `: ${reasons.join("; ")}` : ""}`,
		)
	}

	const video = generatedVideos[0]?.video
	if (!video) throw new Error("Video entry exists but has no video data")

	await ai.files.download({ file: video, downloadPath: options.outputPath })

	return {
		videoPath: options.outputPath,
		durationSeconds: parseInt(options.durationSeconds || "8"),
	}
}

// ---------------------------------------------------------------------------
// Image editing (inpaint / edit via Gemini)
// ---------------------------------------------------------------------------

export async function callGeminiEdit(
	apiKey: string,
	prompt: string,
	imageData: Image,
	maskData?: Image,
): Promise<GeminiImageResult> {
	const ai = new GoogleGenAI({ apiKey })

	const parts: Array<
		| { text: string }
		| { inlineData: { data: string; mimeType: string } }
	> = []

	parts.push({
		inlineData: {
			data: imageData.imageBytes!,
			mimeType: imageData.mimeType || "image/png",
		},
	})

	if (maskData) {
		parts.push({
			inlineData: {
				data: maskData.imageBytes!,
				mimeType: maskData.mimeType || "image/png",
			},
		})
	}

	parts.push({ text: prompt })

	const config: GenerateContentConfig = {
		responseModalities: ["IMAGE", "TEXT"],
	}

	const response = await ai.models.generateContent({
		model: getImageModel(),
		contents: [{ role: "user", parts }],
		config,
	})

	const images: Array<{ mimeType: string; data: string }> = []
	if (response.candidates?.[0]?.content?.parts) {
		for (const part of response.candidates[0].content.parts) {
			if (part.inlineData) {
				images.push({
					mimeType: part.inlineData.mimeType || "image/png",
					data: part.inlineData.data || "",
				})
			}
		}
	}

	return { images }
}

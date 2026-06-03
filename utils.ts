import {
  GoogleGenAI,
  ThinkingLevel,
} from "@google/genai";
import type {
  GenerateContentConfig,
  GenerateVideosConfig,
  ImageConfig,
  UpscaleImageConfig,
  Image,
  ThinkingConfig,
} from "@google/genai";
import { QuiverAI } from "@quiverai/sdk";

// Result types for our wrapper functions
export interface GeminiResult {
  content: string;
  reasoning?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface GeminiImageResult {
  text?: string;
  images: Array<{ mimeType: string; data: string }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface GeminiSvgResult {
  svg: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SegmentationMask {
  box_2d: [number, number, number, number];
  mask: string;
  label: string;
}

export interface GeminiSegmentResult {
  masks: SegmentationMask[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Default models - override via environment variables
const DEFAULT_TEXT_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_FLASH_MODEL = 'gemini-3.5-flash';
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_VIDEO_MODEL = 'veo-3.1-generate-preview';
const DEFAULT_SVG_MODEL = 'arrow-preview';

// Model capability registry — authoritative source for what each model supports.
// Reference: https://ai.google.dev/gemini-api/docs/models
// Reference: https://ai.google.dev/gemini-api/docs/image-generation
export type ImageModelCapabilities = {
  imageSizeValues: string[] | null;  // null = not supported
  aspectRatioValues: string[] | null;  // null = not supported
  maxInputImages: number;  // 0 = no img2img
  knownBugs?: string[];
};

export const IMAGE_MODEL_CAPABILITIES: Record<string, ImageModelCapabilities> = {
  'gemini-3.1-flash-image': {
    imageSizeValues: ['512', '1K', '2K', '4K'],
    aspectRatioValues: ['1:1', '1:4', '4:1', '1:8', '8:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    maxInputImages: 14,
    knownBugs: ['imageSize 512 silently ignored, always returns 1K'],
  },
  'gemini-3-pro-image': {
    imageSizeValues: ['1K', '2K', '4K'],
    aspectRatioValues: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    maxInputImages: 14,
    knownBugs: ['imageSize ignored in Node.js SDK, always returns 1K'],
  },
  'imagen-4.0-generate-001': {
    imageSizeValues: ['1K', '2K'],
    aspectRatioValues: ['1:1', '3:4', '4:3', '9:16', '16:9'],
    maxInputImages: 0,
  },
  'imagen-4.0-ultra-generate-001': {
    imageSizeValues: ['1K', '2K'],
    aspectRatioValues: ['1:1', '3:4', '4:3', '9:16', '16:9'],
    maxInputImages: 0,
  },
  'imagen-4.0-fast-generate-001': {
    imageSizeValues: null,
    aspectRatioValues: ['1:1', '3:4', '4:3', '9:16', '16:9'],
    maxInputImages: 0,
  },
};

/**
 * Validate image generation options against the target model's capabilities.
 * Returns null if valid, or an error message string with guidance on how to fix.
 */
export function validateImageOptions(
  model: string,
  options: { imageSize?: string; aspectRatio?: string; inputImages?: unknown[] },
): string | null {
  const caps = IMAGE_MODEL_CAPABILITIES[model];
  if (!caps) {
    const known = Object.keys(IMAGE_MODEL_CAPABILITIES).join(', ');
    return `Unknown image model "${model}". Known models: ${known}. Set GEMINI_IMAGE_MODEL to a known model.`;
  }

  if (options.imageSize) {
    if (!caps.imageSizeValues) {
      return `Model "${model}" does not support imageSize. Remove the --size flag.`;
    }
    if (!caps.imageSizeValues.includes(options.imageSize)) {
      return `Model "${model}" does not support imageSize "${options.imageSize}". Valid sizes: ${caps.imageSizeValues.join(', ')}.`;
    }
  }

  if (options.aspectRatio) {
    if (!caps.aspectRatioValues) {
      return `Model "${model}" does not support aspectRatio. Remove the --aspect flag.`;
    }
    if (!caps.aspectRatioValues.includes(options.aspectRatio)) {
      return `Model "${model}" does not support aspectRatio "${options.aspectRatio}". Valid ratios: ${caps.aspectRatioValues.join(', ')}.`;
    }
  }

  if (options.inputImages && (options.inputImages as unknown[]).length > 0) {
    if (caps.maxInputImages === 0) {
      const img2imgModels = Object.entries(IMAGE_MODEL_CAPABILITIES)
        .filter(([, c]) => c.maxInputImages > 0)
        .map(([m]) => m);
      return `Model "${model}" does not support input/reference images. Remove --input or use a model that supports img2img: ${img2imgModels.join(', ')}.`;
    }
    if ((options.inputImages as unknown[]).length > caps.maxInputImages) {
      return `Model "${model}" supports at most ${caps.maxInputImages} input images. You provided ${(options.inputImages as unknown[]).length}.`;
    }
  }

  return null;
}

export function getTextModel(): string {
  return process.env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL;
}

export function getFlashModel(): string {
  return process.env.GEMINI_FLASH_MODEL || DEFAULT_FLASH_MODEL;
}

export function getImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
}

function getVideoModel(): string {
  return process.env.GEMINI_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
}

function getSvgModel(): string {
  return process.env.SVG_MODEL || DEFAULT_SVG_MODEL;
}

// Text generation
export async function callGemini(
  apiKey: string,
  prompt: string,
  options: {
    model?: string;
    instructions?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    thinkingLevel?: 'low' | 'high';
    includeThoughts?: boolean;
  } = {}
): Promise<GeminiResult> {
  const ai = new GoogleGenAI({ apiKey });
  const model = options.model || getTextModel();

  const config: GenerateContentConfig = {
    systemInstruction: options.instructions,
    maxOutputTokens: options.maxTokens,
    temperature: options.temperature,
    topP: options.topP,
  };

  // Add thinking config if provided
  if (options.thinkingLevel || options.includeThoughts) {
    const thinkingConfig: ThinkingConfig = {};
    if (options.thinkingLevel) {
      thinkingConfig.thinkingLevel = options.thinkingLevel === 'low' ? ThinkingLevel.LOW : ThinkingLevel.HIGH;
    }
    if (options.includeThoughts !== undefined) {
      thinkingConfig.includeThoughts = options.includeThoughts;
    }
    config.thinkingConfig = thinkingConfig;
  }

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config
  });

  let content = '';
  let reasoning: string | undefined;

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.thought) {
        // Thought/reasoning content
        if (part.text) reasoning = (reasoning || '') + part.text;
      } else if (part.text) {
        content += part.text;
      }
    }
  }

  return {
    content,
    reasoning,
    usage: response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      completionTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0
    } : undefined
  };
}

// Messages-based generation
export async function callGeminiWithMessages(
  apiKey: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options: {
    model?: string;
    instructions?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    thinkingLevel?: 'low' | 'high';
    includeThoughts?: boolean;
  } = {}
): Promise<GeminiResult> {
  const ai = new GoogleGenAI({ apiKey });
  const model = options.model || getTextModel();

  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }]
    }));

  const config: GenerateContentConfig = {
    systemInstruction: options.instructions || systemMessage?.content,
    maxOutputTokens: options.maxTokens,
    temperature: options.temperature,
    topP: options.topP,
  };

  // Add thinking config if provided
  if (options.thinkingLevel || options.includeThoughts) {
    const thinkingConfig: ThinkingConfig = {};
    if (options.thinkingLevel) {
      thinkingConfig.thinkingLevel = options.thinkingLevel === 'low' ? ThinkingLevel.LOW : ThinkingLevel.HIGH;
    }
    if (options.includeThoughts !== undefined) {
      thinkingConfig.includeThoughts = options.includeThoughts;
    }
    config.thinkingConfig = thinkingConfig;
  }

  const response = await ai.models.generateContent({
    model,
    contents: chatMessages,
    config
  });

  let content = '';
  let reasoning: string | undefined;

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.thought) {
        // Thought/reasoning content
        if (part.text) reasoning = (reasoning || '') + part.text;
      } else if (part.text) {
        content += part.text;
      }
    }
  }

  return {
    content,
    reasoning,
    usage: response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      completionTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0
    } : undefined
  };
}

// Image generation using Gemini 3 Pro (Nano Banana Pro)
export async function callGeminiImage(
  apiKey: string,
  prompt: string,
  options: {
    imageSize?: ImageConfig['imageSize'];
    aspectRatio?: ImageConfig['aspectRatio'];
    negativePrompt?: string;
    numberOfImages?: number;
    guidanceScale?: number;
    seed?: number;
    inputImage?: Image;
    inputImages?: Image[];  // Multiple reference images (up to 14)
  } = {}
): Promise<GeminiImageResult> {
  const model = getImageModel();

  // Validate options against model capabilities before calling API
  const validationError = validateImageOptions(model, {
    imageSize: options.imageSize as string | undefined,
    aspectRatio: options.aspectRatio as string | undefined,
    inputImages: options.inputImages ?? (options.inputImage ? [options.inputImage] : undefined),
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  // Handle multiple input images
  if (options.inputImages && options.inputImages.length > 0) {
    for (const img of options.inputImages) {
      if (img.imageBytes) {
        parts.push({ inlineData: { data: img.imageBytes, mimeType: img.mimeType || 'image/png' } });
      }
    }
  } else if (options.inputImage?.imageBytes) {
    // Fallback to single image for backwards compatibility
    parts.push({ inlineData: { data: options.inputImage.imageBytes, mimeType: options.inputImage.mimeType || 'image/png' } });
  }
  parts.push({ text: prompt });

  // ImageConfig only supports aspectRatio and imageSize in Gemini API
  const imageConfig: ImageConfig = {};
  if (options.imageSize) imageConfig.imageSize = options.imageSize;
  if (options.aspectRatio) imageConfig.aspectRatio = options.aspectRatio;

  const config: GenerateContentConfig = {
    responseModalities: ['IMAGE', 'TEXT'],
    seed: options.seed,
  };

  if (Object.keys(imageConfig).length > 0) {
    config.imageConfig = imageConfig;
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config
  });

  const images: Array<{ mimeType: string; data: string }> = [];
  let text: string | undefined;

  // Check for content filter blocks
  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason && !['STOP', 'MAX_TOKENS', 'END_TURN'].includes(finishReason)) {
    const safetyRatings = candidate?.safetyRatings?.map(
      (r: { category?: string; probability?: string }) => `${r.category}: ${r.probability}`
    ).join(', ');
    console.error(`[gemini] Generation blocked — finishReason: ${finishReason}`);
    if (safetyRatings) console.error(`[gemini] Safety ratings: ${safetyRatings}`);
  }

  const promptFeedback = (response as Record<string, unknown>).promptFeedback as
    { blockReason?: string; safetyRatings?: Array<{ category?: string; probability?: string }> } | undefined;
  if (promptFeedback?.blockReason) {
    console.error(`[gemini] Prompt blocked — reason: ${promptFeedback.blockReason}`);
  }

  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        images.push({
          mimeType: part.inlineData.mimeType || 'image/png',
          data: part.inlineData.data || ''
        });
      } else if (part.text) {
        text = part.text;
      }
    }
  }

  return {
    text,
    images,
    usage: response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      completionTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0
    } : undefined
  };
}

// Upscale image using Imagen (requires Vertex AI)
export async function callGeminiUpscale(
  imageData: Image,
  options: {
    outputFormat?: 'png' | 'jpeg' | 'webp';
    jpegQuality?: number;
    upscaleFactor?: 'x2' | 'x4';
    // Vertex AI config (required - upscaleImage is Vertex AI only)
    project?: string;
    location?: string;
  } = {}
): Promise<GeminiImageResult> {
  let project = options.project || process.env.GOOGLE_CLOUD_PROJECT;
  const location = options.location || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  // Fallback: try to get project from gcloud config
  if (!project) {
    try {
      const proc = Bun.spawnSync(['gcloud', 'config', 'get-value', 'project']);
      const output = proc.stdout.toString().trim();
      if (output && !output.includes('unset')) {
        project = output;
      }
    } catch {}
  }

  if (!project) {
    throw new Error('Vertex AI required for upscaling. Set GOOGLE_CLOUD_PROJECT environment variable, pass --project option, or configure gcloud CLI.');
  }

  // Initialize with Vertex AI mode (uses Application Default Credentials)
  const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location
  });

  const formatToMime: Record<string, string> = {
    'png': 'image/png',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp'
  };

  const config: UpscaleImageConfig = {};
  if (options.outputFormat) {
    config.outputMimeType = formatToMime[options.outputFormat];
  }
  if (options.jpegQuality !== undefined) {
    config.outputCompressionQuality = options.jpegQuality;
  }

  const response = await ai.models.upscaleImage({
    model: 'imagen-3.0-generate-002',
    image: imageData,
    upscaleFactor: options.upscaleFactor || 'x2',
    config
  });

  const images: Array<{ mimeType: string; data: string }> = [];

  if (response.generatedImages) {
    for (const img of response.generatedImages) {
      if (img.image?.imageBytes) {
        images.push({
          mimeType: img.image.mimeType || 'image/png',
          data: img.image.imageBytes
        });
      }
    }
  }

  return { images };
}

// Edit image using Gemini native image generation (Nano Banana Pro)
export async function callGeminiEdit(
  apiKey: string,
  prompt: string,
  imageData: Image,
  maskData?: Image,
  options: {
    outputFormat?: 'png' | 'jpeg' | 'webp';
    jpegQuality?: number;
    negativePrompt?: string;
    numberOfImages?: number;
    guidanceScale?: number;
    seed?: number;
    editMode?: 'inpaint' | 'outpaint';
    referenceImages?: Image[];
    aspectRatio?: string;
    imageSize?: string;
  } = {}
): Promise<GeminiImageResult> {
  const model = getImageModel();

  // Validate options against model capabilities before calling API
  const validationError = validateImageOptions(model, {
    imageSize: options.imageSize,
    aspectRatio: options.aspectRatio,
    inputImages: [imageData, ...(options.referenceImages ?? [])],
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build prompt parts: image(s) first, then text instruction
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  // Add the source image
  parts.push({
    inlineData: {
      data: imageData.imageBytes!,
      mimeType: imageData.mimeType || 'image/png',
    },
  });

  // Add additional reference images
  if (options.referenceImages) {
    for (const ref of options.referenceImages) {
      parts.push({
        inlineData: {
          data: ref.imageBytes!,
          mimeType: ref.mimeType || 'image/png',
        },
      });
    }
  }

  // If a mask is provided, include it as a visual reference
  if (maskData) {
    parts.push({
      inlineData: {
        data: maskData.imageBytes!,
        mimeType: maskData.mimeType || 'image/png',
      },
    });
  }

  // Build the edit instruction
  let editPrompt = prompt;
  if (options.negativePrompt) {
    editPrompt += ` Avoid: ${options.negativePrompt}.`;
  }

  parts.push({ text: editPrompt });

  const imageConfig: ImageConfig = {};
  if (options.aspectRatio) imageConfig.aspectRatio = options.aspectRatio;
  if (options.imageSize) imageConfig.imageSize = options.imageSize;

  const config: GenerateContentConfig = {
    responseModalities: ['IMAGE', 'TEXT'],
    seed: options.seed,
  };

  if (Object.keys(imageConfig).length > 0) {
    config.imageConfig = imageConfig;
  }

  // Generate multiple variations by making parallel requests
  const count = options.numberOfImages || 1;
  const images: Array<{ mimeType: string; data: string }> = [];

  const requests = Array.from({ length: count }, () =>
    ai.models.generateContent({
      model: getImageModel(),
      contents: [{ role: 'user', parts }],
      config,
    })
  );

  const responses = await Promise.all(requests);

  for (const response of responses) {
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          images.push({
            mimeType: part.inlineData.mimeType || 'image/png',
            data: part.inlineData.data || '',
          });
        }
      }
    }
  }

  return { images };
}

// Generate SVG via chat model
export async function callGeminiSvg(
  apiKey: string,
  prompt: string,
  options: { instructions?: string } = {}
): Promise<GeminiSvgResult> {
  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = options.instructions ||
    'You are an expert SVG designer. Generate clean, optimized SVG code. Output ONLY the SVG code with no markdown fences or explanation. The SVG should be self-contained with proper viewBox and xmlns attributes.';

  const config: GenerateContentConfig = {
    systemInstruction: systemPrompt,
    temperature: 0.7,
  };

  const response = await ai.models.generateContent({
    model: getTextModel(),
    contents: prompt,
    config
  });

  let svg = '';
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) svg += part.text;
    }
  }

  svg = svg.trim();
  if (svg.startsWith('```svg')) svg = svg.slice(6);
  else if (svg.startsWith('```xml')) svg = svg.slice(6);
  else if (svg.startsWith('```')) svg = svg.slice(3);
  if (svg.endsWith('```')) svg = svg.slice(0, -3);
  svg = svg.trim();

  return {
    svg,
    usage: response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      completionTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0
    } : undefined
  };
}

function stripSvgFences(raw: string): string {
  let svg = raw.trim();
  if (svg.startsWith('```svg')) svg = svg.slice(6);
  else if (svg.startsWith('```xml')) svg = svg.slice(6);
  else if (svg.startsWith('```')) svg = svg.slice(3);
  if (svg.endsWith('```')) svg = svg.slice(0, -3);
  return svg.trim();
}

function arrowResultToSvgResult(result: unknown): GeminiSvgResult {
  const r = result as Record<string, unknown>;
  if (!('data' in r)) {
    const err = r as { code: string; message: string };
    throw new Error(`Arrow API error [${err.code}]: ${err.message}`);
  }
  const data = r.data as Array<{ svg: string }>;
  if (!data[0]) throw new Error('Arrow returned no SVG documents');
  const usage = r.usage as { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;
  return {
    svg: stripSvgFences(data[0].svg),
    usage: usage ? {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    } : undefined,
  };
}

function parseReference(ref: string): { url: string } | { base64: string } {
  return (ref.startsWith('http://') || ref.startsWith('https://'))
    ? { url: ref }
    : { base64: ref };
}

// Generate SVG via Arrow (Quiver AI) — text-to-SVG
export async function callArrowSvg(
  apiKey: string,
  prompt: string,
  options: {
    instructions?: string;
    references?: string[];    // Up to 4 image URLs or base64 strings
    n?: number;               // 1–16, default 1
    temperature?: number;     // 0–2, default 1
    topP?: number;            // 0–1, default 1
    presencePenalty?: number; // -2–2, default 0
    maxOutputTokens?: number; // 1–131072
  } = {}
): Promise<GeminiSvgResult> {
  const client = new QuiverAI({ bearerAuth: apiKey, timeoutMs: 300_000 });
  const result = await client.createSVGs.generateSVG({
    model: getSvgModel(),
    prompt,
    instructions: options.instructions,
    references: options.references?.slice(0, 4).map(parseReference),
    n: options.n ?? 1,
    temperature: options.temperature,
    topP: options.topP,
    presencePenalty: options.presencePenalty,
    maxOutputTokens: options.maxOutputTokens ?? 131072,
  });
  return arrowResultToSvgResult(result);
}

// Vectorize image to SVG via Arrow (Quiver AI) — image-to-SVG
export async function callArrowVectorize(
  apiKey: string,
  image: string,  // URL or base64
  options: {
    n?: number;               // 1–16, default 1
    temperature?: number;     // 0–2, default 1
    topP?: number;            // 0–1, default 1
    presencePenalty?: number; // -2–2, default 0
    maxOutputTokens?: number; // 1–131072
    autoCrop?: boolean;       // auto-crop to dominant subject
    targetSize?: number;      // 128–4096, square resize before inference
  } = {}
): Promise<GeminiSvgResult> {
  const client = new QuiverAI({ bearerAuth: apiKey });
  const result = await client.vectorizeSVG.vectorizeSVG({
    model: getSvgModel(),
    image: parseReference(image),
    n: options.n ?? 1,
    temperature: options.temperature,
    topP: options.topP,
    presencePenalty: options.presencePenalty,
    maxOutputTokens: options.maxOutputTokens,
    autoCrop: options.autoCrop,
    targetSize: options.targetSize,
  });
  return arrowResultToSvgResult(result);
}

// Segment image using Gemini 3 Flash
export async function callGeminiSegment(
  apiKey: string,
  imageData: Image,
  prompt?: string
): Promise<GeminiSegmentResult> {
  const ai = new GoogleGenAI({ apiKey });

  const basePrompt = 'Output a JSON list of segmentation masks where each entry contains the 2D bounding box in the key "box_2d", the segmentation mask in key "mask", and the text label in the key "label". Use descriptive labels.';
  const segmentPrompt = prompt
    ? `${prompt}\n\n${basePrompt}`
    : `Give the segmentation masks for all objects in this image.\n\n${basePrompt}`;

  const config: GenerateContentConfig = {
    temperature: 0,
    responseModalities: ['TEXT'],
  };

  const response = await ai.models.generateContent({
    model: getFlashModel(),
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: imageData.imageBytes || '', mimeType: imageData.mimeType || 'image/png' } },
          { text: segmentPrompt }
        ]
      }
    ],
    config
  });

  let jsonText = '';
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) jsonText += part.text;
    }
  }

  jsonText = jsonText.trim();
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  let masks: SegmentationMask[] = [];
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      masks = parsed.map((m: SegmentationMask) => ({
        ...m,
        mask: m.mask?.startsWith('data:') ? m.mask.split(',')[1] : (m.mask || '')
      }));
    }
  } catch (e) {
    console.error('Failed to parse segmentation response:', e);
    console.error('Raw response:', jsonText.slice(0, 500));
  }

  return {
    masks,
    usage: response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      completionTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0
    } : undefined
  };
}

// Video generation using Veo 3.1 or Replicate models
export interface GeminiVideoResult {
  videoPath: string;
  durationSeconds: number;
}

export async function callGeminiVideo(
  apiKey: string,
  prompt: string,
  options: {
    image?: Image;
    aspectRatio?: "16:9" | "9:16";
    resolution?: "720p" | "1080p" | "4k";
    durationSeconds?: "4" | "6" | "8";
    negativePrompt?: string;
    seed?: number;
    outputPath: string;
  }
): Promise<GeminiVideoResult> {
  const ai = new GoogleGenAI({ apiKey });
  const model = getVideoModel();

  const config: GenerateVideosConfig = {
    numberOfVideos: 1,
  };
  if (options.aspectRatio) config.aspectRatio = options.aspectRatio;
  if (options.resolution) config.resolution = options.resolution;
  if (options.durationSeconds) config.durationSeconds = parseInt(options.durationSeconds);
  if (options.negativePrompt) config.negativePrompt = options.negativePrompt;
  if (options.seed !== undefined) config.seed = options.seed;

  let operation = await ai.models.generateVideos({
    model,
    prompt,
    image: options.image,
    config,
  });

  // Poll until done (Veo typically takes 11s-6min)
  const startTime = Date.now();
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    process.stderr.write(".");
    operation = await ai.operations.getVideosOperation({ operation });
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stderr.write(`\n`);

  if (operation.error) {
    throw new Error(`Video generation failed: ${JSON.stringify(operation.error)}`);
  }

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos?.length) {
    const resp = operation.response as Record<string, unknown> | undefined;
    const reasons = (resp?.raiMediaFilteredReasons as string[]) || [];
    const detail = reasons.length ? `: ${reasons.join("; ")}` : "";
    throw new Error(`No video returned from generation${detail}`);
  }
  const video = generatedVideos[0]?.video;
  if (!video) {
    throw new Error("Video entry exists but has no video data");
  }

  // Download the video to the output path
  await ai.files.download({
    file: video,
    downloadPath: options.outputPath,
  });

  const duration = parseInt(options.durationSeconds || "8");
  console.error(`Generated in ${elapsed}s`);

  return {
    videoPath: options.outputPath,
    durationSeconds: duration,
  };
}

// Video generation using Replicate Veo 3.1 (supports reference_images, image, last_frame)
export async function callReplicateVeo(
  apiToken: string,
  prompt: string,
  options: {
    image?: string; // data URI or file path — starting frame (cannot combine with referenceImages)
    referenceImages?: string[]; // 1-3 data URIs or file paths for subject consistency (R2V)
    lastFrame?: string; // data URI or file path — ending frame for interpolation
    aspectRatio?: "16:9" | "9:16";
    resolution?: "720p" | "1080p";
    duration?: 4 | 6 | 8;
    generateAudio?: boolean;
    negativePrompt?: string;
    seed?: number;
    outputPath: string;
  }
): Promise<GeminiVideoResult> {
  const { default: Replicate } = await import("replicate");
  const { readFile } = await import("fs/promises");
  const replicate = new Replicate({ auth: apiToken });

  const toDataUri = async (pathOrUri: string): Promise<string> => {
    if (pathOrUri.startsWith("data:")) return pathOrUri;
    const buf = await readFile(pathOrUri);
    const ext = pathOrUri.endsWith(".png") ? "png" : pathOrUri.endsWith(".webp") ? "webp" : "jpeg";
    return `data:image/${ext};base64,${buf.toString("base64")}`;
  };

  // Validate: image and referenceImages cannot be combined (Replicate API limitation)
  if (options.image && options.referenceImages?.length) {
    throw new Error("Replicate Veo: 'image' and 'reference_images' cannot be used together. Use one or the other.");
  }

  // Reference images require 16:9 and 8s duration
  if (options.referenceImages?.length) {
    if (options.aspectRatio && options.aspectRatio !== "16:9") {
      throw new Error("Replicate Veo: reference_images only work with 16:9 aspect ratio.");
    }
    if (options.duration && options.duration !== 8) {
      throw new Error("Replicate Veo: reference_images only work with 8s duration.");
    }
  }

  const input: Record<string, unknown> = { prompt };
  if (options.aspectRatio) input.aspect_ratio = options.aspectRatio;
  if (options.resolution) input.resolution = options.resolution;
  if (options.duration) input.duration = options.duration;
  if (options.negativePrompt) input.negative_prompt = options.negativePrompt;
  if (options.seed !== undefined) input.seed = options.seed;
  if (options.generateAudio !== undefined) input.generate_audio = options.generateAudio;

  if (options.image) {
    input.image = await toDataUri(options.image);
    console.error("  Mode: image-to-video (starting frame)");
  }
  if (options.referenceImages?.length) {
    input.reference_images = await Promise.all(options.referenceImages.map(toDataUri));
    console.error(`  Mode: reference-to-video (${options.referenceImages.length} reference images)`);
  }
  if (options.lastFrame) {
    input.last_frame = await toDataUri(options.lastFrame);
    console.error("  Last frame: provided (interpolation mode)");
  }

  console.error("Generating video with Veo 3.1 (Replicate)...");
  const startTime = Date.now();

  const output = await replicate.run("google/veo-3.1", { input });

  // Replicate returns the video data directly
  const { writeFile } = await import("fs/promises");
  await writeFile(options.outputPath, output as any);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(`Generated in ${elapsed}s`);

  return {
    videoPath: options.outputPath,
    durationSeconds: options.duration || 8,
  };
}

// Video generation using Replicate (Grok Imagine Video) — third-tier fallback for spicier content
export async function callReplicateGrokVideo(
  apiToken: string,
  prompt: string,
  options: {
    aspectRatio?: string;
    videoInput?: string;
    outputPath: string;
  }
): Promise<GeminiVideoResult> {
  const { default: Replicate } = await import("replicate");
  const { readFile } = await import("fs/promises");
  const replicate = new Replicate({ auth: apiToken });

  const input: Record<string, unknown> = { prompt };
  if (options.aspectRatio) input.aspect_ratio = options.aspectRatio;
  if (options.videoInput) {
    const buf = await readFile(options.videoInput);
    input.video = `data:video/mp4;base64,${buf.toString("base64")}`;
    console.error(`  Video input: ${options.videoInput}`);
  }

  console.error("Generating video with Grok Imagine Video (Replicate)...");
  const startTime = Date.now();

  const output = await replicate.run("xai/grok-imagine-video", { input }) as { url(): string };

  const videoUrl = output.url();
  console.error(`Downloading from ${videoUrl}...`);

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const { writeFile } = await import("fs/promises");
  const buffer = await response.arrayBuffer();
  await writeFile(options.outputPath, Buffer.from(buffer));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(`Generated in ${elapsed}s`);

  return {
    videoPath: options.outputPath,
    durationSeconds: 0, // Grok doesn't report duration
  };
}

// Image generation using Replicate (Grok Imagine Image)
export async function callReplicateImage(
  apiToken: string,
  prompt: string,
  options: {
    outputPath: string;
  }
): Promise<string> {
  const { default: Replicate } = await import("replicate");
  const replicate = new Replicate({ auth: apiToken });

  console.error("Generating image with Grok Imagine Image (Replicate)...");
  const startTime = Date.now();

  const output = await replicate.run("xai/grok-imagine-image", { input: { prompt } }) as { url(): string };

  const imageUrl = output.url();
  console.error(`Downloading from ${imageUrl}...`);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const { writeFile } = await import("fs/promises");
  const buffer = await response.arrayBuffer();
  await writeFile(options.outputPath, Buffer.from(buffer));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(`Generated in ${elapsed}s`);

  return options.outputPath;
}

import {
  GoogleGenAI,
  RawReferenceImage,
  MaskReferenceImage,
} from "@google/genai";
import type {
  GenerateContentConfig,
  ImageConfig,
  UpscaleImageConfig,
  EditImageConfig,
  Image,
  MaskReferenceConfig,
} from "@google/genai";

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
  } = {}
): Promise<GeminiResult> {
  const ai = new GoogleGenAI({ apiKey });
  const model = options.model || 'gemini-3-pro-preview';

  const config: GenerateContentConfig = {
    systemInstruction: options.instructions,
    maxOutputTokens: options.maxTokens,
    temperature: options.temperature,
    topP: options.topP,
  };

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config
  });

  let content = '';
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) content += part.text;
    }
  }

  return {
    content,
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
  } = {}
): Promise<GeminiResult> {
  const ai = new GoogleGenAI({ apiKey });
  const model = options.model || 'gemini-3-pro-preview';

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

  const response = await ai.models.generateContent({
    model,
    contents: chatMessages,
    config
  });

  let content = '';
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) content += part.text;
    }
  }

  return {
    content,
    usage: response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount || 0,
      completionTokens: response.usageMetadata.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata.totalTokenCount || 0
    } : undefined
  };
}

// Image generation using Gemini 3 Pro
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
  } = {}
): Promise<GeminiImageResult> {
  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  if (options.inputImage?.imageBytes) {
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
    model: 'gemini-3-pro-image-preview',
    contents: [{ role: 'user', parts }],
    config
  });

  const images: Array<{ mimeType: string; data: string }> = [];
  let text: string | undefined;

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
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

// Upscale image using Imagen
export async function callGeminiUpscale(
  apiKey: string,
  imageData: Image,
  options: {
    outputFormat?: 'png' | 'jpeg' | 'webp';
    jpegQuality?: number;
    upscaleFactor?: 'x2' | 'x4';
  } = {}
): Promise<GeminiImageResult> {
  const ai = new GoogleGenAI({ apiKey });

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

// Edit image using Imagen
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
  } = {}
): Promise<GeminiImageResult> {
  const ai = new GoogleGenAI({ apiKey });

  const formatToMime: Record<string, string> = {
    'png': 'image/png',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp'
  };

  const config: EditImageConfig = {};
  if (options.outputFormat) {
    config.outputMimeType = formatToMime[options.outputFormat];
  }
  if (options.jpegQuality !== undefined) {
    config.outputCompressionQuality = options.jpegQuality;
  }
  if (options.negativePrompt) config.negativePrompt = options.negativePrompt;
  if (options.numberOfImages) config.numberOfImages = options.numberOfImages;
  if (options.guidanceScale) config.guidanceScale = options.guidanceScale;
  if (options.seed !== undefined) config.seed = options.seed;

  if (options.editMode === 'inpaint') {
    config.editMode = 'EDIT_MODE_INPAINT_INSERTION';
  } else if (options.editMode === 'outpaint') {
    config.editMode = 'EDIT_MODE_OUTPAINT';
  }

  const referenceImages: (RawReferenceImage | MaskReferenceImage)[] = [];

  const rawRef = new RawReferenceImage();
  rawRef.referenceImage = imageData;
  rawRef.referenceId = 1;
  referenceImages.push(rawRef);

  if (maskData) {
    const maskRef = new MaskReferenceImage();
    maskRef.referenceImage = maskData;
    maskRef.referenceId = 2;
    const maskConfig: MaskReferenceConfig = { maskMode: 'MASK_MODE_USER_PROVIDED' };
    maskRef.config = maskConfig;
    referenceImages.push(maskRef);
  }

  const response = await ai.models.editImage({
    model: 'imagen-3.0-capability-001',
    prompt,
    referenceImages,
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
    model: 'gemini-3-pro-preview',
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

// Segment image using Gemini 2.5
export async function callGeminiSegment(
  apiKey: string,
  imageData: Image,
  prompt?: string
): Promise<GeminiSegmentResult> {
  const ai = new GoogleGenAI({ apiKey });

  const segmentPrompt = prompt ||
    'Give the segmentation masks for all objects. Output a JSON list of segmentation masks where each entry contains the 2D bounding box in the key "box_2d", the segmentation mask in key "mask", and the text label in the key "label". Use descriptive labels.';

  const config: GenerateContentConfig = {
    temperature: 0,
    responseModalities: ['TEXT'],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
    masks = parsed.map((m: SegmentationMask) => ({
      ...m,
      mask: m.mask.startsWith('data:') ? m.mask.split(',')[1] : m.mask
    }));
  } catch {
    // If parsing fails, return empty masks
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

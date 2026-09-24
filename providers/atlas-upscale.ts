/** Atlas Cloud image upscaler provider. */

import { readFile } from "fs/promises";
import { basename } from "path";

const ATLAS_BASE = "https://api.atlascloud.ai/api/v1";

export const ATLAS_UPSCALE_MODEL = "atlascloud/image-upscaler";

interface AtlasEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

interface UploadResult {
  download_url: string;
}

interface Prediction {
  id?: string;
  status?: string;
  outputs?: string[];
  output?: string | string[];
  error?: string;
}

export interface AtlasUpscaleResult {
  data: string;
  mimeType: string;
  model: string;
}

export interface AtlasUpscaleOptions {
  factor?: "x2" | "x4";
  outputFormat?: "jpeg" | "png" | "webp" | "jpg";
  pollIntervalMs?: number;
  maxPolls?: number;
}

function requireAtlasKey(): string {
  const key = process.env.ATLASCLOUD_API_KEY;
  if (!key) {
    throw new Error(
      "ATLASCLOUD_API_KEY environment variable is not set. Get a key at https://www.atlascloud.ai/",
    );
  }
  return key;
}

async function parseResponse<T>(res: Response, operation: string): Promise<T> {
  const text = await res.text();
  let json: AtlasEnvelope<T> & T;
  try {
    json = text ? JSON.parse(text) : ({} as AtlasEnvelope<T> & T);
  } catch {
    throw new Error(`Atlas Cloud ${operation}: HTTP ${res.status}`);
  }

  if (!res.ok || (typeof json.code === "number" && json.code !== 200)) {
    throw new Error(
      `Atlas Cloud ${operation}: ${json.message || `HTTP ${res.status}`}`,
    );
  }

  return (json.data ?? json) as T;
}

async function uploadImage(filePath: string, key: string): Promise<string> {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), basename(filePath));

  const res = await fetch(`${ATLAS_BASE}/model/uploadMedia`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const upload = await parseResponse<UploadResult>(res, "upload");
  if (!upload.download_url) throw new Error("Atlas Cloud upload returned no URL");
  return upload.download_url;
}

async function submitUpscale(
  imageUrl: string,
  key: string,
  factor: "x2" | "x4",
  outputFormat: "jpeg" | "png" | "webp" | "jpg",
): Promise<string> {
  const res = await fetch(`${ATLAS_BASE}/model/generateImage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ATLAS_UPSCALE_MODEL,
      image: imageUrl,
      outscale: factor === "x4" ? 4 : 2,
      output_format: outputFormat,
    }),
    signal: AbortSignal.timeout(50_000),
  });
  const prediction = await parseResponse<Prediction>(res, "submit");
  if (!prediction.id) throw new Error("Atlas Cloud submit returned no prediction ID");
  return prediction.id;
}

async function waitForOutput(
  predictionId: string,
  key: string,
  pollIntervalMs: number,
  maxPolls: number,
): Promise<string> {
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    if (attempt > 0 || pollIntervalMs > 0) {
      await Bun.sleep(pollIntervalMs);
    }
    const res = await fetch(`${ATLAS_BASE}/model/prediction/${predictionId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });
    const prediction = await parseResponse<Prediction>(res, "poll");
    const status = prediction.status?.toLowerCase();
    if (status === "completed" || status === "succeeded") {
      const raw = prediction.outputs ?? prediction.output ?? [];
      const outputs = Array.isArray(raw) ? raw : [raw];
      if (!outputs[0]) throw new Error("Atlas Cloud prediction returned no output URL");
      return outputs[0];
    }
    if (status === "failed") {
      throw new Error(`Atlas Cloud prediction failed: ${prediction.error || "unknown error"}`);
    }
  }
  throw new Error("Atlas Cloud prediction timed out");
}

export async function atlasUpscale(
  filePath: string,
  options: AtlasUpscaleOptions = {},
): Promise<AtlasUpscaleResult> {
  const key = requireAtlasKey();
  const factor = options.factor ?? "x2";
  const outputFormat = options.outputFormat ?? "png";

  const imageUrl = await uploadImage(filePath, key);
  const predictionId = await submitUpscale(imageUrl, key, factor, outputFormat);
  const outputUrl = await waitForOutput(
    predictionId,
    key,
    options.pollIntervalMs ?? 2_000,
    options.maxPolls ?? 90,
  );

  const output = await fetch(outputUrl, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!output.ok) throw new Error(`Atlas Cloud output download: HTTP ${output.status}`);
  const mimeType = output.headers.get("content-type")?.split(";")[0]
    || `image/${outputFormat === "jpg" ? "jpeg" : outputFormat}`;
  const data = Buffer.from(await output.arrayBuffer()).toString("base64");
  return { data, mimeType, model: ATLAS_UPSCALE_MODEL };
}

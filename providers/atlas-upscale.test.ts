import { afterEach, describe, expect, test } from "bun:test";
import { atlasUpscale } from "./atlas-upscale";

const originalFetch = globalThis.fetch;
const originalKey = process.env.ATLASCLOUD_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ATLASCLOUD_API_KEY;
  else process.env.ATLASCLOUD_API_KEY = originalKey;
});

describe("atlasUpscale", () => {
  test("uploads once, submits once, polls, and downloads the output", async () => {
    process.env.ATLASCLOUD_API_KEY = "test-key";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      new Response(JSON.stringify({ code: 200, data: { download_url: "https://input.test/image.png" } })),
      new Response(JSON.stringify({ code: 200, data: { id: "prediction-1", status: "created" } })),
      new Response(JSON.stringify({ code: 200, data: { id: "prediction-1", status: "processing" } })),
      new Response(JSON.stringify({ code: 200, data: { id: "prediction-1", status: "completed", outputs: ["https://output.test/upscaled.png"] } })),
      new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }),
    ];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input.toString(), init });
      return responses.shift()!;
    }) as unknown as typeof fetch;

    const temp = `${import.meta.dir}/atlas-upscale-test-input.png`;
    await Bun.write(temp, new Uint8Array([137, 80, 78, 71]));
    try {
      const result = await atlasUpscale(temp, {
        factor: "x4",
        outputFormat: "png",
        pollIntervalMs: 0,
        maxPolls: 3,
      });

      expect(result.model).toBe("atlascloud/image-upscaler");
      expect(result.mimeType).toBe("image/png");
      expect(calls.filter((call) => call.url.endsWith("/model/uploadMedia"))).toHaveLength(1);
      expect(calls.filter((call) => call.url.endsWith("/model/generateImage"))).toHaveLength(1);
      const submit = calls.find((call) => call.url.endsWith("/model/generateImage"))!;
      expect(JSON.parse(submit.init!.body as string)).toEqual({
        model: "atlascloud/image-upscaler",
        image: "https://input.test/image.png",
        outscale: 4,
        output_format: "png",
      });
    } finally {
      await Bun.file(temp).delete();
    }
  });

  test("does not retry a failed generation submission", async () => {
    process.env.ATLASCLOUD_API_KEY = "test-key";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ code: 200, data: { download_url: "https://input.test/image.png" } }));
      }
      return new Response(JSON.stringify({ message: "insufficient balance" }), { status: 402 });
    }) as unknown as typeof fetch;

    const temp = `${import.meta.dir}/atlas-upscale-test-input.png`;
    await Bun.write(temp, new Uint8Array([137, 80, 78, 71]));
    try {
      await expect(atlasUpscale(temp, { pollIntervalMs: 0 })).rejects.toThrow("insufficient balance");
      expect(calls).toBe(2);
    } finally {
      await Bun.file(temp).delete();
    }
  });
});

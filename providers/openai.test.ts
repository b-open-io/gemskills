import { afterEach, describe, expect, test } from "bun:test";
import {
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_VARIANTS,
  isOpenAIImageVariant,
  resolveImageModelFlag,
  resolveOpenAIImageModel,
} from "./openai";
import { CAPABILITIES, RANKINGS, supports } from "./types";

const envKey = "OPENAI_IMAGE_MODEL";
const prior = process.env[envKey];

afterEach(() => {
  if (prior === undefined) delete process.env[envKey];
  else process.env[envKey] = prior;
});

describe("OPENAI_IMAGE_VARIANTS", () => {
  test("flare and sunburst are direct API ids", () => {
    expect(OPENAI_IMAGE_VARIANTS.flare).toBe("gpt-image-2.5-flare");
    expect(OPENAI_IMAGE_VARIANTS.sunburst).toBe("gpt-image-2.5-sunburst");
    expect(OPENAI_IMAGE_MODEL).not.toStartWith("openai/");
  });
});

describe("resolveOpenAIImageModel", () => {
  test("aliases and ids", () => {
    expect(resolveOpenAIImageModel("flare")).toBe("gpt-image-2.5-flare");
    expect(resolveOpenAIImageModel("sunburst")).toBe("gpt-image-2.5-sunburst");
    expect(resolveOpenAIImageModel("gpt-image-2.5-flare")).toBe("gpt-image-2.5-flare");
    expect(resolveOpenAIImageModel("gpt-image-2.5-sunburst")).toBe("gpt-image-2.5-sunburst");
  });

  test("strips docs-only gateway prefix", () => {
    expect(resolveOpenAIImageModel("openai/gpt-image-2.5-flare")).toBe("gpt-image-2.5-flare");
    expect(resolveOpenAIImageModel("openai/gpt-image-2.5-sunburst")).toBe("gpt-image-2.5-sunburst");
    expect(isOpenAIImageVariant("openai/gpt-image-2.5-flare")).toBe(true);
  });

  test("does not invent other 2.5 names", () => {
    expect(resolveOpenAIImageModel("gpt-image-3")).toBe("gpt-image-3");
    expect(isOpenAIImageVariant("gpt-image-3")).toBe(false);
    expect(isOpenAIImageVariant("gpt-image-2")).toBe(false);
  });
});

describe("resolveImageModelFlag", () => {
  test("flare/sunburst select openai + API model", () => {
    expect(resolveImageModelFlag("flare")).toEqual({
      provider: "openai",
      openaiModel: "gpt-image-2.5-flare",
    });
    expect(resolveImageModelFlag("sunburst")).toEqual({
      provider: "openai",
      openaiModel: "gpt-image-2.5-sunburst",
    });
    expect(resolveImageModelFlag("gpt-image-2.5-sunburst")).toEqual({
      provider: "openai",
      openaiModel: "gpt-image-2.5-sunburst",
    });
  });

  test("legacy provider aliases are deprecated", () => {
    expect(resolveImageModelFlag("gemini")).toEqual({ provider: "gemini", deprecatedAlias: true });
    expect(resolveImageModelFlag("openai")).toEqual({ provider: "openai", deprecatedAlias: true });
    expect(resolveImageModelFlag("xai")).toEqual({ provider: "xai", deprecatedAlias: true });
    expect(resolveImageModelFlag("grok")).toEqual({ provider: "xai", deprecatedAlias: true });
  });
});

describe("capabilities", () => {
  test("openai image/edit support transparency; negative and styleTile stay Gemini", () => {
    expect(supports("image", "openai", ["transparent"])).toBe(true);
    expect(supports("edit", "openai", ["transparent"])).toBe(true);
    expect(supports("image", "openai", ["negative"])).toBe(false);
    expect(supports("image", "openai", ["styleTile"])).toBe(false);
    expect(supports("image", "gemini", ["negative", "styleTile"])).toBe(true);
    expect(CAPABILITIES.image.openai).toContain("transparent");
    expect(CAPABILITIES.edit.openai).toContain("transparent");
  });

  test("image ranking is unchanged", () => {
    expect(RANKINGS.image).toEqual(["openai", "gemini", "xai"]);
  });
});

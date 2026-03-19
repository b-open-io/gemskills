import { NextResponse } from "next/server";
import { callGemini, getApiKey } from "@/lib/server/gemini";

interface BootstrapRequest {
	title?: string;
	audience?: string;
	purpose?: string;
	context?: string;
	keyMessage?: string;
	tone?: string;
	slideCount?: number;
}

interface BootstrapSlide {
	index: number;
	title: string;
	type: string;
	headline: string;
	content: string;
	visualConcept: string;
	backgroundMode: "transparent" | "opaque" | "solid" | "gradient";
	renderMode: "image" | "html";
	filename: string;
}

function extractJsonObject(text: string): string {
	const fenced = text.match(/```json\s*([\s\S]*?)```/i);
	if (fenced?.[1]) return fenced[1].trim();
	const first = text.indexOf("{");
	const last = text.lastIndexOf("}");
	if (first >= 0 && last > first) return text.slice(first, last + 1).trim();
	return text.trim();
}

function cleanText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeContent(value: unknown): string {
	const raw = cleanText(value);
	if (!raw) return "";
	return raw
		.split("\n")
		.map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
		.filter(Boolean)
		.slice(0, 5)
		.join("\n");
}

function normalizeSlides(
	rawSlides: unknown[],
	count: number,
): BootstrapSlide[] {
	const slides: BootstrapSlide[] = [];
	for (let i = 0; i < count; i++) {
		const row = (rawSlides[i] as Record<string, unknown>) || {};
		const index = i + 1;
		const renderMode = row.renderMode === "html" ? "html" : "image";
		const backgroundMode =
			row.backgroundMode === "transparent" ? "transparent" : "opaque";
		const title =
			cleanText(row.title) || (index === 1 ? "Title Slide" : `Slide ${index}`);
		const headline = cleanText(row.headline) || title;
		const type =
			cleanText(row.type) ||
			(index === 1 ? "Title" : index === count ? "Closing" : "Content");
		const content = normalizeContent(row.content);
		const visualConcept = cleanText(row.visualConcept);
		slides.push({
			index,
			title,
			type,
			headline,
			content,
			visualConcept,
			backgroundMode,
			renderMode,
			filename: `${String(index).padStart(2, "0")}-slide.${
				renderMode === "html" ? "html" : "png"
			}`,
		});
	}
	return slides;
}

function buildBootstrapPrompt(input: {
	title: string;
	audience: string;
	purpose: string;
	context: string;
	keyMessage: string;
	tone: string;
	slideCount: number;
}): string {
	return [
		`Create a complete ${input.slideCount}-slide deck blueprint.`,
		"",
		"Deck inputs:",
		`- Title: ${input.title}`,
		`- Audience: ${input.audience || "General audience"}`,
		`- Purpose: ${input.purpose || "Persuade"}`,
		`- Context: ${input.context || "Not specified"}`,
		`- Key message: ${input.keyMessage || "Not specified"}`,
		`- Tone: ${input.tone || "Confident"}`,
		"",
		"Return strict JSON only with this shape:",
		`{"slides":[{"index":1,"title":"...","type":"...","headline":"...","content":"line1\\nline2\\nline3","visualConcept":"...","backgroundMode":"opaque","renderMode":"image"}]}`,
		"",
		`Constraints:`,
		`- Exactly ${input.slideCount} slides.`,
		"- Narrative arc from setup -> problem -> solution -> proof -> close.",
		"- One clear headline per slide.",
		"- Content must be concise and presentation-ready.",
		"- visualConcept is per-slide composition direction only (no global theme/aesthetic instructions).",
		'- backgroundMode defaults to "opaque". Use "transparent" only for HTML slides that should intentionally let global background media show through.',
		'- renderMode should normally be "image" unless a slide strongly benefits from "html".',
		"- No markdown. No code fences. JSON object only.",
	].join("\n");
}

const BOOTSTRAP_SYSTEM_INSTRUCTIONS = [
	"You are an elite pitch-deck strategist.",
	"Generate complete slide COPY and structure, not image prompts.",
	"Return strict JSON object only.",
	"Do not include commentary or markdown.",
].join("\n");

export async function POST(req: Request) {
	try {
		const body = (await req.json()) as BootstrapRequest;
		const title = cleanText(body.title);
		if (!title) {
			return NextResponse.json(
				{ ok: false, error: "title is required" },
				{ status: 400 },
			);
		}
		const slideCount = Math.max(1, Math.min(30, Number(body.slideCount) || 8));

		const apiKey = getApiKey();
		const prompt = buildBootstrapPrompt({
			title,
			audience: cleanText(body.audience),
			purpose: cleanText(body.purpose) || "Persuade",
			context: cleanText(body.context),
			keyMessage: cleanText(body.keyMessage),
			tone: cleanText(body.tone) || "Confident",
			slideCount,
		});

		const result = await callGemini(apiKey, prompt, {
			instructions: BOOTSTRAP_SYSTEM_INSTRUCTIONS,
			temperature: 0.7,
		});
		const parsedText = extractJsonObject(result.content || "");
		let parsed: unknown;
		try {
			parsed = JSON.parse(parsedText);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			return NextResponse.json(
				{
					ok: false,
					error: `Failed to parse bootstrap JSON: ${msg}`,
					rawOutput: result.content,
					finishReason: result.finishReason,
				},
				{ status: 500 },
			);
		}

		const rawSlides = Array.isArray((parsed as { slides?: unknown[] }).slides)
			? ((parsed as { slides: unknown[] }).slides ?? [])
			: [];
		if (rawSlides.length === 0) {
			return NextResponse.json(
				{
					ok: false,
					error: "Model returned no slides in bootstrap output",
					rawOutput: result.content,
					finishReason: result.finishReason,
				},
				{ status: 500 },
			);
		}

		const slides = normalizeSlides(rawSlides, slideCount);
		return NextResponse.json({
			ok: true,
			slideCount,
			slides,
			finishReason: result.finishReason,
		});
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return NextResponse.json({ ok: false, error: msg }, { status: 500 });
	}
}

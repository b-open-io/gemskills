export type StyleGenerationRole =
	| "image-slide"
	| "html-slide"
	| "image-asset"
	| "video-background";

interface StyleRecipeDefinition {
	id: string;
	name: string;
	description: string;
	instructions?: string;
	promptByRole: Partial<Record<StyleGenerationRole | "all", string>>;
}

export interface StyleRecipeInfo {
	id: string;
	name: string;
	description: string;
	instructions?: string;
}

const BUILT_IN_STYLE_RECIPES: StyleRecipeDefinition[] = [
	{
		id: "twitter-liquid-glass-v1",
		name: "Glass Deck (Original)",
		description:
			"Original liquid-glass deck aesthetic: liquid-glass cards, strong contrast, and no shadows.",
		instructions:
			"Liquid-glass presentation treatment with crisp hierarchy, translucent surfaces, and shadowless depth.",
		promptByRole: {
			all: "Use Plus Jakarta Sans whenever typography can be controlled. Keep color usage anchored to the active theme palette; do not inject style-default colors. Use responsive clamp() typography and percentage/vw/vh spacing. No shadows anywhere: never use box-shadow, text-shadow, filter: drop-shadow, glow, or emboss effects. Use liquid-glass surfaces with backdrop-filter blur(24px) saturate(1.4), translucent linear gradients, subtle borders, and top-left radial specular highlights.",
			"html-slide":
				"Output premium presentation markup with composition tuned to the selected aspect ratio, smooth hierarchy, and glass cards only where content needs structure. Never add CSS shadows. Keep spacing proportional and responsive.",
			"image-slide":
				"Render as a cinematic presentation slide, not a poster. Preserve clean hierarchy and glass-card layering without any shadow treatment.",
			"image-asset":
				"Generate a background or supporting image plate that matches the liquid-glass atmosphere while respecting the active theme palette and avoiding shadow effects.",
			"video-background":
				"Generate an ambient seamless loop suitable behind slides. Keep mood elegant with gradient depth, reflections, and motion energy, stay within the active theme palette, and avoid text overlays or shadow-heavy lighting motifs.",
		},
	},
	{
		id: "twitter-liquid-glass-presenter-v2",
		name: "Cinematic Presenter Framework",
		description:
			"Full-screen narrator-first presentation framework with responsive typography, percentage spacing, and video-first composition guidance.",
		instructions:
			"Live-presentation treatment with crisp hierarchy, projection-safe contrast, and narrative-first composition.",
		promptByRole: {
			all: "Treat this as a live presentation canvas, not a poster. Keep the scene dark with high-contrast readable typography. Prefer Plus Jakarta Sans when typography can be controlled. Use clamp() typography and percentage/vw/vh spacing so composition scales cleanly. Never use heavy shadow effects (box-shadow, text-shadow, drop-shadow, glow, emboss).",
			"html-slide":
				"Create production-ready HTML/CSS slide content with strong verbal-narration hierarchy (headline, subheadline, support stats/cards). Keep layout responsive and presentation-safe at distance. If backdrop media is provided, keep the slide wrapper transparent so media can show through cleanly.",
			"image-slide":
				"Render a polished keynote-style slide with dark cinematic grounding, clean typography hierarchy, and glass-card structure. Maintain readability first, style second.",
			"image-asset":
				"Generate a dark premium background plate suitable for overlays: abstract protocol mesh, subtle connection points, and clean depth gradients without embedded text.",
			"video-background":
				"Generate an ambient seamless loop for slide backdrops: elegant dark motion, subtle protocol-mesh or node-field movement, no text/logos, no harsh strobing, and no shadow-heavy lighting motifs.",
		},
	},
	{
		id: "protocol-mesh-cinematic-loop-v1",
		name: "Galaxy Drift Loop",
		description:
			"Galaxy/nebula-inspired cinematic motion language tuned for animated background media and transparent HTML overlays.",
		instructions:
			"Reference stills (mood only): https://pbs.twimg.com/media/HBpypQYbgAExSZG?format=jpg&name=4096x4096 and https://pbs.twimg.com/media/HBpyr40bgAEWS3M?format=jpg&name=4096x4096",
		promptByRole: {
			all: "Use a dark cinematic galaxy/nebula language with deep-space gradients, subtle star fields, restrained glow, and strong foreground readability. Keep theme palette constraints authoritative and avoid heavy stylistic noise.",
			"html-slide":
				"Prioritize transparent or low-opacity foreground surfaces when appropriate so backdrop media can carry atmosphere. Keep text blocks clear, readable, and hierarchy-first.",
			"image-slide":
				"Compose a presentation-grade slide scene that harmonizes with galaxy/nebula backdrops while preserving legibility and clean information architecture.",
			"image-asset":
				"Generate a still background plate with galaxy/nebula depth, abstract cosmic texture, and clean gradients suitable behind slide content; no readable text.",
			"video-background":
				"Generate a seamless loop with slow camera drift through galaxy/nebula atmosphere and subtle starlight pulses. Mood should match the reference stills, but never copy literal text or logos.",
		},
	},
	{
		id: "animated-glitch-text-v1",
		name: "Animated Glitch Text",
		description:
			"High-contrast kinetic typography with RGB channel split, scan jitter, and intermittent distortion pulses.",
		instructions:
			"Glitch-driven typography aesthetic with animated text treatment and restrained visual noise.",
		promptByRole: {
			all: "Keep the active theme palette authoritative while applying a glitch typography treatment: channel-shift edges, scanline rhythm, and momentary distortion bursts. Prioritize readability first, then controlled chaos. Use clean spacing and intentional hierarchy so text remains legible at presentation distance.",
			"html-slide":
				"Implement glitch animation directly in CSS (no JS required): keyframes for RGB split, subtle horizontal jitter, and periodic clip/mask displacement on headline text. Prefer pseudo-elements for chromatic offsets and keep animation durations staggered so motion feels alive, not noisy. Ensure body copy remains mostly stable while headline carries the effect.",
			"image-slide":
				"Render the slide as a frozen frame from a premium glitch-typography animation: sharp text with chromatic edge offsets, scanline texture, and controlled distortion artifacts. Keep hierarchy clean and projection-readable.",
			"image-asset":
				"Generate a supporting plate for glitch typography overlays: abstract digital interference, scanline texture, and subtle pixel drift with no readable text baked into the asset.",
			"video-background":
				"Generate a seamless loop with subtle digital interference: scanline drift, channel-offset pulses, and light glitch bursts that support overlaid text without becoming visually overwhelming.",
		},
	},
];

const BUILT_IN_STYLE_RECIPE_IDS = new Set(
	BUILT_IN_STYLE_RECIPES.map((recipe) => recipe.id),
);

export const DEFAULT_STYLE_RECIPE_ID = BUILT_IN_STYLE_RECIPES[0]?.id ?? "";

function normalizeCustomStyleRecipes(
	styleRecipes?: StyleRecipeInfo[] | null,
): StyleRecipeInfo[] {
	if (!Array.isArray(styleRecipes)) return [];

	const out: StyleRecipeInfo[] = [];
	const seen = new Set<string>();

	for (const recipe of styleRecipes) {
		if (!recipe || typeof recipe !== "object") continue;
		const id = recipe.id?.trim();
		const name = recipe.name?.trim();
		const description = recipe.description?.trim();
		if (!id || !name || !description) continue;
		if (BUILT_IN_STYLE_RECIPE_IDS.has(id)) continue;
		if (seen.has(id)) continue;
		seen.add(id);
		out.push({
			id,
			name,
			description,
			instructions: recipe.instructions?.trim() || undefined,
		});
	}

	return out;
}

function buildCustomPromptByRole(
	recipe: StyleRecipeInfo,
): StyleRecipeDefinition {
	const intent =
		recipe.instructions?.trim() || recipe.description || recipe.name;
	return {
		id: recipe.id,
		name: recipe.name,
		description: recipe.description,
		instructions: recipe.instructions,
		promptByRole: {
			all: `Apply this custom style recipe as the global aesthetic treatment: ${intent}. Keep the active theme palette authoritative and maintain presentation-grade readability.`,
			"html-slide":
				"Translate this custom style into production-ready HTML/CSS using responsive layout, clear hierarchy, and tasteful animation where appropriate. Keep effects deliberate and avoid visual clutter.",
			"image-slide":
				"Render a polished keynote slide that clearly expresses this custom style while preserving clean hierarchy, readability, and theme color constraints.",
			"image-asset":
				"Generate a supporting image plate that matches this custom style and can sit behind slide content without hurting legibility.",
			"video-background":
				"Generate a seamless looping background that reflects this custom style, supports overlaid slide content, and avoids overpowering motion.",
		},
	};
}

function getRecipeDefinitions(
	styleRecipes?: StyleRecipeInfo[] | null,
): StyleRecipeDefinition[] {
	const custom = normalizeCustomStyleRecipes(styleRecipes).map(
		buildCustomPromptByRole,
	);
	return [...BUILT_IN_STYLE_RECIPES, ...custom];
}

export function isBuiltInStyleRecipeId(id: string): boolean {
	return BUILT_IN_STYLE_RECIPE_IDS.has(id);
}

export function getStyleRecipeById(params: {
	id: string | null | undefined;
	styleRecipes?: StyleRecipeInfo[] | null;
}): StyleRecipeDefinition | null {
	const recipes = getRecipeDefinitions(params.styleRecipes);
	if (!recipes.length) return null;
	if (params.id === null || params.id === "") return null;
	if (typeof params.id === "undefined") return null;
	return recipes.find((recipe) => recipe.id === params.id) ?? null;
}

export function isKnownStyleRecipeId(
	id: string,
	styleRecipes?: StyleRecipeInfo[] | null,
): boolean {
	return getRecipeDefinitions(styleRecipes).some((recipe) => recipe.id === id);
}

export function getStyleRecipeOptions(
	customStyleRecipes?: StyleRecipeInfo[] | null,
): StyleRecipeInfo[] {
	const builtIns = BUILT_IN_STYLE_RECIPES.map(
		({ id, name, description, instructions }) => ({
			id,
			name,
			description,
			instructions,
		}),
	);
	return [...builtIns, ...normalizeCustomStyleRecipes(customStyleRecipes)];
}

export function composeStyleInstructionsForRole(params: {
	role: StyleGenerationRole;
	styleRecipeId?: string | null;
	customPrompt?: string | null;
	styleRecipes?: StyleRecipeInfo[] | null;
}): string {
	const applyStyleRecipe = params.role === "html-slide";
	const recipe = getStyleRecipeById({
		id: params.styleRecipeId,
		styleRecipes: params.styleRecipes,
	});
	const sections: string[] = [];

	if (applyStyleRecipe && recipe) {
		const globalRules = recipe.promptByRole.all?.trim();
		const roleRules = recipe.promptByRole[params.role]?.trim();
		if (globalRules || roleRules) {
			const lines = [
				`Style recipe: ${recipe.name}`,
				`Intent: ${recipe.description}`,
			];
			if (globalRules) {
				lines.push(`Global directives: ${globalRules}`);
			}
			if (roleRules) {
				lines.push(`Role directives: ${roleRules}`);
			}
			sections.push(lines.join("\n"));
		}
	}

	const custom = params.customPrompt?.trim();
	if (applyStyleRecipe && custom) {
		sections.push(
			`Custom style directives for this generation role: ${custom}`,
		);
	}

	return sections.join("\n\n").trim();
}

export function styleInstructionsDisallowShadows(
	instructions: string | null | undefined,
): boolean {
	if (!instructions) return false;
	return (
		/\bno\s+shadows?\b/i.test(instructions) ||
		/\bno\s+box-shadow\b/i.test(instructions) ||
		/\bno\s+text-shadow\b/i.test(instructions) ||
		/\bnever\s+use\s+box-shadow\b/i.test(instructions) ||
		/\bnever\s+use\s+text-shadow\b/i.test(instructions) ||
		/\bdrop-shadow\b/i.test(instructions)
	);
}

const SYSTEM_FONT_STACK =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const GOOGLE_FONT_IMPORTS: Record<string, string> = {
	Geist:
		"https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap",
	"Geist Mono":
		"https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;700&display=swap",
	"Geist Pixel":
		"https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap",
	Silkscreen:
		"https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap",
	Inter:
		"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
	"Inter Tight":
		"https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&display=swap",
	"Space Grotesk":
		"https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap",
	"Space Mono":
		"https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap",
	"DM Sans":
		"https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap",
	"DM Serif Display":
		"https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap",
	"DM Mono":
		"https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap",
	"IBM Plex Sans":
		"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
	"IBM Plex Serif":
		"https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:wght@400;500;600;700&display=swap",
	"IBM Plex Mono":
		"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap",
	"JetBrains Mono":
		"https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap",
	Outfit:
		"https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap",
	Sora: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap",
	Manrope:
		"https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
	"Plus Jakarta Sans":
		"https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
	"Instrument Sans":
		"https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&display=swap",
	"Instrument Serif":
		"https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap",
	Satoshi:
		"https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap",
};

export function getSystemFontStack(): string {
	return SYSTEM_FONT_STACK;
}

function extractPrimaryFontName(fontFamily?: string): string | undefined {
	const selected = fontFamily?.trim();
	if (!selected) return undefined;
	const first = selected.split(",")[0]?.trim();
	if (!first) return undefined;
	return first.replace(/^['"]|['"]$/g, "");
}

export function getPreferredFontStack(fontFamily?: string): string {
	const selected = fontFamily?.trim();
	if (!selected) return SYSTEM_FONT_STACK;
	if (selected.includes(",")) {
		return `${selected}, ${SYSTEM_FONT_STACK}`;
	}
	if (selected === "Geist Pixel") {
		// Explicit implementation detail: Geist Pixel style is backed by Silkscreen.
		return `'Geist Pixel', 'Silkscreen', ${SYSTEM_FONT_STACK}`;
	}
	return `'${selected}', ${SYSTEM_FONT_STACK}`;
}

export function getGoogleFontImportUrl(
	fontFamily?: string,
): string | undefined {
	const primary = extractPrimaryFontName(fontFamily);
	if (!primary) return undefined;
	return GOOGLE_FONT_IMPORTS[primary];
}

export function isSupportedFontFamily(fontFamily?: string): boolean {
	const primary = extractPrimaryFontName(fontFamily);
	if (!primary) return false;
	return primary in GOOGLE_FONT_IMPORTS;
}

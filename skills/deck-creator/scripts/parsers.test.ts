import { describe, expect, test } from "bun:test";
import { parseTheme } from "./parsers";

describe("parseTheme", () => {
	test("strips human-readable annotations from hex theme colors", () => {
		const parsed = parseTheme(`
## Theme Variables (Dark)
- background: #0a0f1a (deep navy-charcoal)
- foreground: #fff (white)
- primary: #11223344 (translucent blue)

Slide Mode: dark
`);

		expect(parsed.themeConfig.background).toBe("#0a0f1a");
		expect(parsed.themeConfig.foreground).toBe("#fff");
		expect(parsed.themeConfig.primary).toBe("#11223344");
	});

	test("preserves non-annotated CSS values", () => {
		const parsed = parseTheme(`
- background: oklch(0.2 0.01 250)
- primary: var(--brand-primary)
- accent: #123456
`);

		expect(parsed.themeConfig.background).toBe("oklch(0.2 0.01 250)");
		expect(parsed.themeConfig.primary).toBe("var(--brand-primary)");
		expect(parsed.themeConfig.accent).toBe("#123456");
	});

	test("does not truncate malformed or compound hex values", () => {
		const parsed = parseTheme(`
- background: #123456 / 50%
- primary: #abcdef (label) trailing
- accent: #12345 (not a valid CSS hex color)
`);

		expect(parsed.themeConfig.background).toBe("#123456 / 50%");
		expect(parsed.themeConfig.primary).toBe("#abcdef (label) trailing");
		expect(parsed.themeConfig.accent).toBe(
			"#12345 (not a valid CSS hex color)",
		);
	});
});

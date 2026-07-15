import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("presenter export mode", () => {
	test("fills the exact browser viewport used for PDF capture", () => {
		const template = readFileSync(
			resolve(import.meta.dir, "../assets/presenter.html"),
			"utf8",
		);

		expect(template).toContain(`body.exporting .stage {
      width: 100vw;
      height: 100vh;
      max-width: none;
      max-height: none;
    }`);
	});
});

import { describe, expect, it } from "vitest";
import { notePathFor, sanitizeFileName } from "./paths";

describe("sanitizeFileName", () => {
	it("strips Windows-invalid characters", () => {
		expect(sanitizeFileName('Lab 3: Query <Errors>?')).toBe("Lab 3 Query Errors");
	});

	it("preserves Unicode letters, em dashes, and normal spaces", () => {
		expect(sanitizeFileName("Café Notes — Übung")).toBe("Café Notes — Übung");
	});

	it("collapses repeated whitespace and trims", () => {
		expect(sanitizeFileName("  too   many   spaces  ")).toBe("too many spaces");
	});

	it("falls back to Untitled for an empty result", () => {
		expect(sanitizeFileName('???')).toBe("Untitled");
	});

	it("appends a suffix to reserved Windows device names", () => {
		expect(sanitizeFileName("CON")).toBe("CON_");
	});
});

describe("notePathFor", () => {
	it("joins folder and sanitized title into a .md path", () => {
		expect(notePathFor("03 - ITSE 1350/02 - Assignments", "Survey: Part I")).toBe(
			"03 - ITSE 1350/02 - Assignments/Survey Part I.md"
		);
	});
});

import { describe, expect, it } from "vitest";
import { extractTaskLines, extractTasksDueDate } from "./tasks";

describe("extractTasksDueDate", () => {
	it("extracts a Tasks-plugin due-date emoji", () => {
		expect(extractTasksDueDate("Submit in Canvas 📅 2026-09-18")).toBe("2026-09-18");
	});

	it("returns null when there is no due-date emoji", () => {
		expect(extractTasksDueDate("Submit in Canvas")).toBeNull();
	});
});

describe("extractTaskLines", () => {
	it("extracts checked and unchecked lines with their due dates", () => {
		const text = [
			"- [ ] Read instructions completely 📅 2026-09-15",
			"- [x] Set up required files",
			"Not a task line",
		].join("\n");
		const lines = extractTaskLines(text);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toEqual({ text: "Read instructions completely 📅 2026-09-15", checked: false, due: "2026-09-15" });
		expect(lines[1]).toEqual({ text: "Set up required files", checked: true, due: null });
	});
});

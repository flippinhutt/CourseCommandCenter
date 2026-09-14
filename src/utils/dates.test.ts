import { describe, expect, it } from "vitest";
import { compareDueDates, dueState, formatIsoDate, parseLocalDate } from "./dates";

describe("parseLocalDate", () => {
	it("parses a plain ISO date as a local date", () => {
		const date = parseLocalDate("2026-09-18");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2026);
		expect(date?.getMonth()).toBe(8);
		expect(date?.getDate()).toBe(18);
	});

	it("returns null for garbage input", () => {
		expect(parseLocalDate("not a date")).toBeNull();
		expect(parseLocalDate(undefined)).toBeNull();
		expect(parseLocalDate("")).toBeNull();
	});

	it("rejects invalid calendar dates like Feb 30", () => {
		expect(parseLocalDate("2026-02-30")).toBeNull();
	});
});

describe("formatIsoDate", () => {
	it("round-trips through parseLocalDate", () => {
		const iso = "2026-01-05";
		const date = parseLocalDate(iso);
		expect(formatIsoDate(date as Date)).toBe(iso);
	});
});

describe("dueState", () => {
	it("treats a due date as due through end of local day: not overdue on the due day itself", () => {
		const today = formatIsoDate(new Date());
		expect(dueState(today, 7)).toBe("today");
	});

	it("classifies a past date as overdue", () => {
		const pastDate = new Date();
		pastDate.setDate(pastDate.getDate() - 3);
		expect(dueState(formatIsoDate(pastDate), 7)).toBe("overdue");
	});

	it("classifies a date inside the window as upcoming", () => {
		const future = new Date();
		future.setDate(future.getDate() + 3);
		expect(dueState(formatIsoDate(future), 7)).toBe("upcoming");
	});

	it("classifies a date outside the window as later", () => {
		const future = new Date();
		future.setDate(future.getDate() + 30);
		expect(dueState(formatIsoDate(future), 7)).toBe("later");
	});

	it("returns none when there is no due date", () => {
		expect(dueState(undefined, 7)).toBe("none");
	});
});

describe("compareDueDates", () => {
	it("sorts notes without a due date after notes with one", () => {
		expect(compareDueDates(undefined, "2026-01-01")).toBeGreaterThan(0);
		expect(compareDueDates("2026-01-01", undefined)).toBeLessThan(0);
	});

	it("orders earlier dates first", () => {
		expect(compareDueDates("2026-01-01", "2026-02-01")).toBeLessThan(0);
	});
});

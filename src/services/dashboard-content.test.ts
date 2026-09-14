import { describe, expect, it } from "vitest";
import { buildDashboardLines, buildDashboardMarkdown, buildPastDueLines, isWithinDays } from "./dashboard-content";
import { formatIsoDate } from "../utils/dates";
import type { CanvasSyncMatch, CourseConfig, IndexedNote } from "../types";

function course(overrides: Partial<CourseConfig> = {}): CourseConfig {
	return {
		id: "c1",
		code: "ITSE 1350",
		displayName: "System Analysis and Design",
		delivery: "hybrid",
		rootFolder: "Course",
		meetingDays: "",
		meetingTime: "",
		location: "",
		canvasUrl: "",
		active: true,
		folderMap: {},
		...overrides,
	};
}

function note(overrides: Partial<IndexedNote> = {}): IndexedNote {
	return {
		path: "Course/Note.md",
		basename: "Note",
		ctime: 0,
		mtime: 0,
		props: {},
		courseId: "c1",
		...overrides,
	};
}

function daysFromNowIso(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return formatIsoDate(date);
}

describe("isWithinDays", () => {
	it("treats overdue dates as within any non-negative window", () => {
		expect(isWithinDays(daysFromNowIso(-5), 2)).toBe(true);
	});

	it("treats today as within a 0-day window", () => {
		expect(isWithinDays(daysFromNowIso(0), 0)).toBe(true);
	});

	it("excludes a date beyond the window", () => {
		expect(isWithinDays(daysFromNowIso(10), 2)).toBe(false);
	});

	it("returns false for an unparseable date", () => {
		expect(isWithinDays("not-a-date", 7)).toBe(false);
	});
});

describe("buildDashboardLines", () => {
	it("includes an active-status note with a due date", () => {
		const notes = [note({ props: { due: daysFromNowIso(3), status: "in-progress" } })];
		const lines = buildDashboardLines(notes, [course()]);
		expect(lines).toHaveLength(1);
		expect(lines[0].linkPath).toBe("Course/Note.md");
		expect(lines[0].courseLabel).toBe("System Analysis and Design");
	});

	it("excludes a note with no due date", () => {
		const notes = [note({ props: { status: "in-progress" } })];
		expect(buildDashboardLines(notes, [course()])).toEqual([]);
	});

	it("excludes a completed or submitted note", () => {
		const notes = [
			note({ path: "a.md", props: { due: daysFromNowIso(1), status: "complete" } }),
			note({ path: "b.md", props: { due: daysFromNowIso(1), status: "submitted" } }),
		];
		expect(buildDashboardLines(notes, [course()])).toEqual([]);
	});

	it("gives an unmatched Canvas event a wikilink to where its note would be created, plus a Canvas link", () => {
		const match: CanvasSyncMatch = {
			event: { uid: "u1", title: "Homework 4", due: daysFromNowIso(2), courseCodeHint: "ITSE 1350", url: "https://canvas.example/x" },
			matchedCourse: course(),
			matchedNote: null,
		};
		const lines = buildDashboardLines([], [course()], [match]);
		expect(lines).toHaveLength(1);
		expect(lines[0].canvasUrl).toBe("https://canvas.example/x");
		expect(lines[0].linkPath).toBe("Course/Homework 4.md");
	});

	it("excludes a Canvas event that already has a matched note (avoids duplicates)", () => {
		const matchedNote = note({ props: { due: daysFromNowIso(2), status: "in-progress" } });
		const match: CanvasSyncMatch = {
			event: { uid: "u1", title: "Homework 4", due: daysFromNowIso(2), courseCodeHint: "ITSE 1350", url: null },
			matchedCourse: course(),
			matchedNote,
		};
		const lines = buildDashboardLines([matchedNote], [course()], [match]);
		expect(lines).toHaveLength(1);
		expect(lines[0].linkPath).toBe(matchedNote.path);
	});

	it("sorts by due date ascending", () => {
		const notes = [
			note({ path: "later.md", props: { due: daysFromNowIso(10) } }),
			note({ path: "sooner.md", props: { due: daysFromNowIso(1) } }),
		];
		const lines = buildDashboardLines(notes, [course()]);
		expect(lines.map((l) => l.linkPath)).toEqual(["sooner.md", "later.md"]);
	});

	it("excludes a note due yesterday but keeps one due today", () => {
		const notes = [
			note({ path: "yesterday.md", props: { due: daysFromNowIso(-1), status: "in-progress" } }),
			note({ path: "today.md", props: { due: daysFromNowIso(0), status: "in-progress" } }),
		];
		const lines = buildDashboardLines(notes, [course()]);
		expect(lines.map((l) => l.linkPath)).toEqual(["today.md"]);
	});

	it("excludes a past-due unmatched Canvas event", () => {
		const match: CanvasSyncMatch = {
			event: { uid: "u1", title: "Old Quiz", due: daysFromNowIso(-3), courseCodeHint: "ITSE 1350", url: null },
			matchedCourse: course(),
			matchedNote: null,
		};
		expect(buildDashboardLines([], [course()], [match])).toEqual([]);
	});

	it("marks a real note as an existing note and an unmatched Canvas event as not", () => {
		const notes = [note({ props: { due: daysFromNowIso(1), status: "in-progress" } })];
		const match: CanvasSyncMatch = {
			event: { uid: "u1", title: "Homework 4", due: daysFromNowIso(1), courseCodeHint: "ITSE 1350", url: null },
			matchedCourse: course(),
			matchedNote: null,
		};
		const lines = buildDashboardLines(notes, [course()], [match]);
		expect(lines.find((l) => l.linkPath === "Course/Note.md")?.isExistingNote).toBe(true);
		expect(lines.find((l) => l.linkPath === "Course/Homework 4.md")?.isExistingNote).toBe(false);
	});
});

describe("buildPastDueLines", () => {
	it("includes an overdue note and an overdue unmatched Canvas event, excludes today and future", () => {
		const notes = [
			note({ path: "overdue.md", props: { due: daysFromNowIso(-3), status: "in-progress" } }),
			note({ path: "today.md", props: { due: daysFromNowIso(0), status: "in-progress" } }),
			note({ path: "future.md", props: { due: daysFromNowIso(2), status: "in-progress" } }),
		];
		const match: CanvasSyncMatch = {
			event: { uid: "u1", title: "Old Quiz", due: daysFromNowIso(-1), courseCodeHint: "ITSE 1350", url: null },
			matchedCourse: course(),
			matchedNote: null,
		};
		const lines = buildPastDueLines(notes, [course()], [match]);
		expect(lines.map((l) => l.linkPath)).toEqual(["overdue.md", "Course/Old Quiz.md"]);
	});

	it("sorts oldest (most overdue) first", () => {
		const notes = [
			note({ path: "a.md", props: { due: daysFromNowIso(-1), status: "in-progress" } }),
			note({ path: "b.md", props: { due: daysFromNowIso(-10), status: "in-progress" } }),
		];
		const lines = buildPastDueLines(notes, [course()]);
		expect(lines.map((l) => l.linkPath)).toEqual(["b.md", "a.md"]);
	});

	it("excludes a completed overdue note", () => {
		const notes = [note({ props: { due: daysFromNowIso(-1), status: "complete" } })];
		expect(buildPastDueLines(notes, [course()])).toEqual([]);
	});
});

describe("buildDashboardMarkdown with past due", () => {
	it("renders a Past due section, checkbox included, separate from Deadlines", () => {
		const notes = [note({ path: "overdue.md", basename: "Overdue", props: { due: daysFromNowIso(-2), status: "in-progress" } })];
		const lines = buildDashboardLines(notes, [course()]);
		const pastDue = buildPastDueLines(notes, [course()]);
		const markdown = buildDashboardMarkdown(lines, 2, 7, "2026-09-14", pastDue);

		const pastDueSection = markdown.split("## Past due")[1];
		expect(pastDueSection).toContain("- [ ] [[overdue|Overdue]]");
		expect(markdown.split("## Deadlines")[1].split("## Upcoming")[0]).not.toContain("Overdue");
	});

	it("defaults to an empty Past due section when no pastDueLines argument is passed", () => {
		const markdown = buildDashboardMarkdown([], 2, 7, "2026-09-14");
		expect(markdown).toContain("## Past due");
		expect(markdown.split("## Past due")[1]).toContain("*Nothing here.*");
	});
});

describe("buildDashboardMarkdown", () => {
	it("renders overlapping sections: an urgent item appears in Do next, Upcoming, and Deadlines", () => {
		const notes = [note({ props: { due: daysFromNowIso(1), status: "in-progress" } })];
		const lines = buildDashboardLines(notes, [course()]);
		const markdown = buildDashboardMarkdown(lines, 2, 7, "2026-09-14");

		const occurrences = markdown.split("[[Course/Note|Note]]").length - 1;
		expect(occurrences).toBe(3);
	});

	it("renders the auto-generated marker and an empty-state message for empty sections", () => {
		const markdown = buildDashboardMarkdown([], 2, 7, "2026-09-14");
		expect(markdown).toContain("Auto-generated by Course Command Center");
		expect(markdown).toContain("*Nothing here.*");
	});

	it("links a vault-note line as a wikilink without the .md extension", () => {
		const notes = [note({ path: "Course/Assignment 1.md", basename: "Assignment 1", props: { due: daysFromNowIso(1) } })];
		const lines = buildDashboardLines(notes, [course()]);
		const markdown = buildDashboardMarkdown(lines, 2, 7, "2026-09-14");
		expect(markdown).toContain("[[Course/Assignment 1|Assignment 1]]");
	});

	it("renders an unmatched Canvas-only line as a create-note wikilink plus a secondary Canvas link", () => {
		const match: CanvasSyncMatch = {
			event: { uid: "u1", title: "Homework 4", due: daysFromNowIso(1), courseCodeHint: "ITSE 1350", url: "https://canvas.example/x" },
			matchedCourse: course(),
			matchedNote: null,
		};
		const lines = buildDashboardLines([], [course()], [match]);
		const markdown = buildDashboardMarkdown(lines, 2, 7, "2026-09-14");
		expect(markdown).toContain("[[Course/Homework 4|Homework 4]]");
		expect(markdown).toContain("([Canvas](https://canvas.example/x))");
	});

	it("renders a real note's line as a checkbox", () => {
		const notes = [note({ props: { due: daysFromNowIso(1), status: "in-progress" } })];
		const lines = buildDashboardLines(notes, [course()]);
		const markdown = buildDashboardMarkdown(lines, 2, 7, "2026-09-14");
		expect(markdown).toContain("- [ ] [[Course/Note|Note]]");
	});

	it("renders an unmatched Canvas-only line as a checkbox too", () => {
		const match: CanvasSyncMatch = {
			event: { uid: "u1", title: "Homework 4", due: daysFromNowIso(1), courseCodeHint: "ITSE 1350", url: null },
			matchedCourse: course(),
			matchedNote: null,
		};
		const lines = buildDashboardLines([], [course()], [match]);
		const markdown = buildDashboardMarkdown(lines, 2, 7, "2026-09-14");
		expect(markdown).toContain("- [ ] [[Course/Homework 4|Homework 4]]");
	});

	it("puts a note due today under Due today but not one due tomorrow", () => {
		const notes = [
			note({ path: "today.md", basename: "Today", props: { due: daysFromNowIso(0), status: "in-progress" } }),
			note({ path: "tomorrow.md", basename: "Tomorrow", props: { due: daysFromNowIso(1), status: "in-progress" } }),
		];
		const lines = buildDashboardLines(notes, [course()]);
		const markdown = buildDashboardMarkdown(lines, 2, 7, "2026-09-14");
		const dueTodaySection = markdown.split("## Due today")[1];
		expect(dueTodaySection).toContain("[[today|Today]]");
		expect(dueTodaySection).not.toContain("[[tomorrow|Tomorrow]]");
	});
});

import { describe, expect, it } from "vitest";
import { matchCanvasEvents, pendingCanvasNotePath } from "./canvas-match";
import type { CanvasSyncMatch, CourseConfig, IcsEvent, IndexedNote } from "../types";

function course(overrides: Partial<CourseConfig> = {}): CourseConfig {
	return {
		id: "itse-1350",
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
		path: "note.md",
		basename: "Homework 3",
		ctime: 0,
		mtime: 0,
		props: {},
		courseId: "itse-1350",
		...overrides,
	};
}

function event(overrides: Partial<IcsEvent> = {}): IcsEvent {
	return {
		uid: "uid-1",
		title: "Homework 3",
		due: "2026-09-18",
		courseCodeHint: "ITSE 1350",
		url: null,
		...overrides,
	};
}

describe("matchCanvasEvents", () => {
	it("drops an event whose course hint matches no configured course", () => {
		const result = matchCanvasEvents([event({ courseCodeHint: "MATH 1414" })], [], [course()]);
		expect(result).toEqual([]);
	});

	it("matches a note by a previously stamped id, regardless of title", () => {
		const notes = [note({ basename: "Different Title", props: { id: "uid-1" }, courseId: "itse-1350" })];
		const result = matchCanvasEvents([event()], notes, [course()]);
		expect(result[0].matchedNote?.path).toBe("note.md");
	});

	it("falls back to a same-course, normalized-title match when no id match exists", () => {
		const notes = [note({ basename: "  Homework   3  ", courseId: "itse-1350" })];
		const result = matchCanvasEvents([event()], notes, [course()]);
		expect(result[0].matchedNote?.basename).toBe("  Homework   3  ");
	});

	it("does not title-match a note in a different course", () => {
		const notes = [note({ basename: "Homework 3", courseId: "other-course" })];
		const result = matchCanvasEvents([event()], notes, [course()]);
		expect(result[0].matchedNote).toBeNull();
	});

	it("leaves matchedNote null when nothing matches, but keeps the matched course", () => {
		const result = matchCanvasEvents([event()], [], [course()]);
		expect(result[0].matchedNote).toBeNull();
		expect(result[0].matchedCourse?.id).toBe("itse-1350");
	});
});

describe("pendingCanvasNotePath", () => {
	function match(overrides: Partial<CanvasSyncMatch> = {}): CanvasSyncMatch {
		return { event: event(), matchedCourse: course(), matchedNote: null, ...overrides };
	}

	it("computes the assignment-folder path for the event's title", () => {
		expect(pendingCanvasNotePath(match())).toBe("Course/Homework 3.md");
	});

	it("uses the course's mapped assignment folder when one is configured", () => {
		const c = course({ folderMap: { assignment: "Course/Assignments" } });
		expect(pendingCanvasNotePath(match({ matchedCourse: c }))).toBe("Course/Assignments/Homework 3.md");
	});

	it("returns null when there is no matched course", () => {
		expect(pendingCanvasNotePath(match({ matchedCourse: null }))).toBeNull();
	});

	it("sanitizes a title with Windows-invalid characters", () => {
		expect(pendingCanvasNotePath(match({ event: event({ title: "Quiz: Ch 1?" }) }))).toBe("Course/Quiz Ch 1.md");
	});
});

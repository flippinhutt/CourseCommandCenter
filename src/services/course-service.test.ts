import { describe, expect, it } from "vitest";
import { deriveQuickActions, folderForArtifact, humanizeType, matchCourseByCode } from "./course-service";
import type { CourseConfig } from "../types";

function course(overrides: Partial<CourseConfig> = {}): CourseConfig {
	return {
		id: "c1",
		code: "ITSE 1350",
		displayName: "System Analysis and Design",
		delivery: "hybrid",
		rootFolder: "03 - ITSE 1350",
		meetingDays: "Thu",
		meetingTime: "6:00 PM",
		location: "",
		canvasUrl: "",
		active: true,
		folderMap: {},
		...overrides,
	};
}

const courses = [
	course({ id: "itse-1350", code: "ITSE 1350" }),
	course({ id: "itse-2309", code: "ITSE 2309", displayName: "Database Programming SQL" }),
];

describe("matchCourseByCode", () => {
	it("matches an exact course code", () => {
		expect(matchCourseByCode("ITSE 1350", courses)?.id).toBe("itse-1350");
	});

	it("matches a course code followed by descriptive text", () => {
		expect(matchCourseByCode("ITSE 2309 — Database Programming SQL", courses)?.id).toBe("itse-2309");
	});

	it("is case-insensitive and whitespace-tolerant", () => {
		expect(matchCourseByCode("  itse   1350  ", courses)?.id).toBe("itse-1350");
	});

	it("returns null for an unknown course value", () => {
		expect(matchCourseByCode("MATH 1414", courses)).toBeNull();
	});

	it("returns null when the value is missing", () => {
		expect(matchCourseByCode(undefined, courses)).toBeNull();
	});
});

describe("folderForArtifact", () => {
	it("returns the mapped folder for a configured type", () => {
		const c = course({ folderMap: { assignment: "Assignments" } });
		expect(folderForArtifact(c, "assignment")).toBe("Assignments");
	});

	it("falls back to the course root folder for an unmapped type", () => {
		const c = course({ folderMap: {} });
		expect(folderForArtifact(c, "assignment")).toBe(c.rootFolder);
	});

	it("works for a fully custom type name", () => {
		const c = course({ folderMap: { "lab-report": "Lab Reports" } });
		expect(folderForArtifact(c, "lab-report")).toBe("Lab Reports");
	});
});

describe("humanizeType", () => {
	it("title-cases the first word and lowercases the rest", () => {
		expect(humanizeType("sql-lab")).toBe("Sql lab");
		expect(humanizeType("data-dictionary")).toBe("Data dictionary");
	});

	it("handles a single-word type", () => {
		expect(humanizeType("quiz")).toBe("Quiz");
	});
});

describe("deriveQuickActions", () => {
	it("derives one action per folder-map entry, sorted by type", () => {
		const c = course({ folderMap: { quiz: "Quizzes", assignment: "Assignments" } });
		const actions = deriveQuickActions(c);
		expect(actions.map((a) => a.artifactType)).toEqual(["assignment", "quiz"]);
		expect(actions[0].label).toBe("Create Assignment");
	});

	it("returns no actions for a course with an empty folder map", () => {
		expect(deriveQuickActions(course({ folderMap: {} }))).toEqual([]);
	});

	it("derives an action for a fully custom type name", () => {
		const actions = deriveQuickActions(course({ folderMap: { "lab-report": "Lab Reports" } }));
		expect(actions).toEqual([{ id: "lab-report", label: "Create Lab report", artifactType: "lab-report" }]);
	});
});

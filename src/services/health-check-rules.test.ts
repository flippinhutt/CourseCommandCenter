import { describe, expect, it } from "vitest";
import {
	checkDatabaseDesignMissingLinks,
	checkDiscussionNoInitialPost,
	checkDueSoonNotStarted,
	checkInProgressNoWork,
	checkModuleNoTasks,
	checkOverdue,
	checkRequirementNoAcceptanceCriteria,
	checkRubricIncomplete,
	checkSqlLabNoFence,
	checkStaleLectures,
	type NoteFacts,
} from "./health-check-rules";
import { formatIsoDate } from "../utils/dates";
import type { NoteProperties } from "../types";

function facts(props: NoteProperties, overrides: Partial<NoteFacts> = {}): NoteFacts {
	return {
		path: "note.md",
		props,
		hasChecklistTasks: false,
		hasOutgoingLinks: false,
		rubric: null,
		hasSqlFence: false,
		hasAcceptanceCriteriaSection: false,
		hasInitialPostCheckedComplete: false,
		linkedTitles: [],
		...overrides,
	};
}

function daysAgoIso(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return formatIsoDate(date);
}

function daysFromNowIso(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return formatIsoDate(date);
}

describe("checkOverdue", () => {
	it("flags an overdue assignment that is not submitted or complete", () => {
		const result = checkOverdue(facts({ type: "assignment", status: "in-progress", due: daysAgoIso(2) }), 7);
		expect(result?.severity).toBe("action-needed");
	});

	it("does not flag an overdue assignment that is already submitted", () => {
		expect(checkOverdue(facts({ type: "assignment", status: "submitted", due: daysAgoIso(2) }), 7)).toBeNull();
	});

	it("ignores non-assignment note types", () => {
		expect(checkOverdue(facts({ type: "lecture", due: daysAgoIso(2) }), 7)).toBeNull();
	});
});

describe("checkDueSoonNotStarted", () => {
	it("flags a not-started assignment due within the window", () => {
		const result = checkDueSoonNotStarted(facts({ type: "assignment", status: "not-started", due: daysFromNowIso(3) }), 7);
		expect(result?.severity).toBe("warning");
	});

	it("does not flag a due date outside the window", () => {
		expect(checkDueSoonNotStarted(facts({ type: "assignment", status: "not-started", due: daysFromNowIso(30) }), 7)).toBeNull();
	});
});

describe("checkInProgressNoWork", () => {
	it("flags an in-progress assignment with no tasks and no links", () => {
		const result = checkInProgressNoWork(facts({ type: "assignment", status: "in-progress" }));
		expect(result?.severity).toBe("warning");
	});

	it("does not flag when checklist tasks exist", () => {
		expect(checkInProgressNoWork(facts({ type: "assignment", status: "in-progress" }, { hasChecklistTasks: true }))).toBeNull();
	});
});

describe("checkRubricIncomplete", () => {
	it("flags a rubric with an incomplete row", () => {
		const result = checkRubricIncomplete(
			facts(
				{ type: "assignment" },
				{
					rubric: {
						heading: "Rubric",
						rows: [{ criterion: "a", requirement: "b", evidenceRaw: "", evidenceLinks: [], complete: false, missingEvidence: true }],
					},
				}
			)
		);
		expect(result?.severity).toBe("warning");
	});

	it("does not flag a fully complete rubric", () => {
		const result = checkRubricIncomplete(
			facts(
				{ type: "assignment" },
				{
					rubric: {
						heading: "Rubric",
						rows: [{ criterion: "a", requirement: "b", evidenceRaw: "[[X]]", evidenceLinks: ["X"], complete: true, missingEvidence: false }],
					},
				}
			)
		);
		expect(result).toBeNull();
	});
});

describe("checkModuleNoTasks", () => {
	it("flags a module with a due date and no checklist", () => {
		expect(checkModuleNoTasks(facts({ type: "module", due: daysFromNowIso(2) }))?.severity).toBe("warning");
	});

	it("does not flag a module without a due date", () => {
		expect(checkModuleNoTasks(facts({ type: "module" }))).toBeNull();
	});
});

describe("checkDiscussionNoInitialPost", () => {
	it("flags a discussion with a due date and no completed initial post", () => {
		expect(checkDiscussionNoInitialPost(facts({ type: "discussion", due: daysFromNowIso(2) }))?.severity).toBe("warning");
	});

	it("does not flag once the initial post is checked complete", () => {
		expect(
			checkDiscussionNoInitialPost(facts({ type: "discussion", due: daysFromNowIso(2) }, { hasInitialPostCheckedComplete: true }))
		).toBeNull();
	});
});

describe("checkSqlLabNoFence", () => {
	it("flags an sql lab with no fenced sql block", () => {
		expect(checkSqlLabNoFence(facts({ type: "sql-lab" }))?.severity).toBe("warning");
	});

	it("does not flag when an sql fence is present", () => {
		expect(checkSqlLabNoFence(facts({ type: "sql-lab" }, { hasSqlFence: true }))).toBeNull();
	});
});

describe("checkDatabaseDesignMissingLinks", () => {
	it("flags a packet with no ERD/data-dictionary/normalization links", () => {
		expect(checkDatabaseDesignMissingLinks(facts({ type: "database-design" }, { linkedTitles: ["Some Other Note"] }))?.severity).toBe(
			"warning"
		);
	});

	it("does not flag when a matching link is present", () => {
		expect(
			checkDatabaseDesignMissingLinks(facts({ type: "database-design" }, { linkedTitles: ["ERD - Project"] }))
		).toBeNull();
	});
});

describe("checkRequirementNoAcceptanceCriteria", () => {
	it("flags a requirement with no acceptance-criteria section", () => {
		expect(checkRequirementNoAcceptanceCriteria(facts({ type: "requirement" }))?.severity).toBe("warning");
	});

	it("does not flag when the section is present", () => {
		expect(
			checkRequirementNoAcceptanceCriteria(facts({ type: "requirement" }, { hasAcceptanceCriteriaSection: true }))
		).toBeNull();
	});
});

describe("checkStaleLectures", () => {
	it("flags a course with no lecture notes at all", () => {
		expect(checkStaleLectures("ITSE 1350", "hub.md", null, 10)?.severity).toBe("info");
	});

	it("flags a course whose most recent lecture is older than the window", () => {
		expect(checkStaleLectures("ITSE 1350", "hub.md", 15, 10)).not.toBeNull();
	});

	it("does not flag a course with a recent lecture note", () => {
		expect(checkStaleLectures("ITSE 1350", "hub.md", 2, 10)).toBeNull();
	});
});

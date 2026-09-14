import type { HealthCheckResult, NoteProperties, RubricTable } from "../types";
import { dueState } from "../utils/dates";

/** Content-derived facts about a note, gathered once per health-check run so
 * the rule functions below stay pure and independently testable. */
export interface NoteFacts {
	path: string;
	props: NoteProperties;
	hasChecklistTasks: boolean;
	hasOutgoingLinks: boolean;
	rubric: RubricTable | null;
	hasSqlFence: boolean;
	hasAcceptanceCriteriaSection: boolean;
	hasInitialPostCheckedComplete: boolean;
	linkedTitles: string[];
}

function isType(facts: NoteFacts, type: string): boolean {
	return facts.props.type === type;
}

export function checkOverdue(facts: NoteFacts, windowDays: number): HealthCheckResult | null {
	if (!isType(facts, "assignment") && !isType(facts, "project-deliverable")) return null;
	if (facts.props.status === "submitted" || facts.props.status === "complete") return null;
	if (dueState(facts.props.due, windowDays) !== "overdue") return null;
	return { severity: "action-needed", message: `Overdue and not submitted or complete: ${facts.path}`, notePath: facts.path };
}

export function checkDueSoonNotStarted(facts: NoteFacts, windowDays: number): HealthCheckResult | null {
	if (!isType(facts, "assignment") && !isType(facts, "project-deliverable")) return null;
	if (facts.props.status !== "not-started") return null;
	const state = dueState(facts.props.due, windowDays);
	if (state !== "today" && state !== "upcoming") return null;
	return { severity: "warning", message: `Due soon and not started: ${facts.path}`, notePath: facts.path };
}

export function checkInProgressNoWork(facts: NoteFacts): HealthCheckResult | null {
	if (!isType(facts, "assignment") && !isType(facts, "project-deliverable")) return null;
	if (facts.props.status !== "in-progress") return null;
	if (facts.hasChecklistTasks || facts.hasOutgoingLinks) return null;
	return {
		severity: "warning",
		message: `In progress with no checklist tasks or outgoing links: ${facts.path}`,
		notePath: facts.path,
	};
}

export function checkRubricIncomplete(facts: NoteFacts): HealthCheckResult | null {
	if (!isType(facts, "assignment") && !isType(facts, "project-deliverable")) return null;
	if (!facts.rubric || facts.rubric.rows.length === 0) return null;
	const incomplete = facts.rubric.rows.filter((r) => !r.complete || r.missingEvidence);
	if (incomplete.length === 0) return null;
	return {
		severity: "warning",
		message: `Rubric has ${incomplete.length} incomplete or evidence-missing row(s): ${facts.path}`,
		notePath: facts.path,
	};
}

export function checkModuleNoTasks(facts: NoteFacts): HealthCheckResult | null {
	if (!isType(facts, "module")) return null;
	if (!facts.props.due) return null;
	if (facts.hasChecklistTasks) return null;
	return { severity: "warning", message: `Module has a due date but no checklist tasks: ${facts.path}`, notePath: facts.path };
}

export function checkDiscussionNoInitialPost(facts: NoteFacts): HealthCheckResult | null {
	if (!isType(facts, "discussion")) return null;
	if (!facts.props.due) return null;
	if (facts.hasInitialPostCheckedComplete) return null;
	return {
		severity: "warning",
		message: `Discussion has a due date but "Initial post submitted" is not checked: ${facts.path}`,
		notePath: facts.path,
	};
}

export function checkSqlLabNoFence(facts: NoteFacts): HealthCheckResult | null {
	if (!isType(facts, "sql-lab")) return null;
	if (facts.hasSqlFence) return null;
	return { severity: "warning", message: `SQL lab has no fenced sql code block: ${facts.path}`, notePath: facts.path };
}

export function checkDatabaseDesignMissingLinks(facts: NoteFacts): HealthCheckResult | null {
	if (!isType(facts, "database-design")) return null;
	const needles = ["erd", "data dictionary", "normalization"];
	const hasMatch = facts.linkedTitles.some((title) => needles.some((n) => title.toLowerCase().includes(n)));
	if (hasMatch) return null;
	return {
		severity: "warning",
		message: `Database design packet has no links matching ERD, data dictionary, or normalization notes: ${facts.path}`,
		notePath: facts.path,
	};
}

export function checkRequirementNoAcceptanceCriteria(facts: NoteFacts): HealthCheckResult | null {
	if (!isType(facts, "requirement")) return null;
	if (facts.hasAcceptanceCriteriaSection) return null;
	return { severity: "warning", message: `Requirement has no acceptance-criteria section: ${facts.path}`, notePath: facts.path };
}

export function evaluatePerNoteRules(facts: NoteFacts, windowDays: number): HealthCheckResult[] {
	const results = [
		checkOverdue(facts, windowDays),
		checkDueSoonNotStarted(facts, windowDays),
		checkInProgressNoWork(facts),
		checkRubricIncomplete(facts),
		checkModuleNoTasks(facts),
		checkDiscussionNoInitialPost(facts),
		checkSqlLabNoFence(facts),
		checkDatabaseDesignMissingLinks(facts),
		checkRequirementNoAcceptanceCriteria(facts),
	];
	return results.filter((r): r is HealthCheckResult => r !== null);
}

/** In-person/hybrid courses with no lecture note created in the last
 * `windowDays` calendar days. `mostRecentLectureAgeDays` is null when there
 * are no lecture notes at all for the course. */
export function checkStaleLectures(
	courseLabel: string,
	courseHubPath: string,
	mostRecentLectureAgeDays: number | null,
	windowDays: number
): HealthCheckResult | null {
	if (mostRecentLectureAgeDays !== null && mostRecentLectureAgeDays <= windowDays) return null;
	const detail = mostRecentLectureAgeDays === null ? "no lecture notes found" : `most recent lecture note is ${mostRecentLectureAgeDays} day(s) old`;
	return {
		severity: "info",
		message: `${courseLabel}: no lecture note in the last ${windowDays} days (${detail})`,
		notePath: courseHubPath,
	};
}

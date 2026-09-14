import { type App, TFile } from "obsidian";
import type { CourseConfig, HealthCheckResult, IndexedNote } from "../types";
import { extractChecklistItems, extractWikilinks, hasFencedCodeBlock, parseRubricTable } from "../utils/markdown";
import { daysFromToday, parseLocalDate } from "../utils/dates";
import { isInPersonLike } from "./course-service";
import {
	type NoteFacts,
	checkStaleLectures,
	evaluatePerNoteRules,
} from "./health-check-rules";

const RELEVANT_TYPES = new Set([
	"assignment",
	"project-deliverable",
	"module",
	"discussion",
	"sql-lab",
	"database-design",
	"requirement",
]);

async function buildNoteFacts(app: App, note: IndexedNote): Promise<NoteFacts | null> {
	if (!note.props.type || !RELEVANT_TYPES.has(note.props.type)) return null;
	const file = app.vault.getAbstractFileByPath(note.path);
	if (!(file instanceof TFile)) return null;
	const content = await app.vault.cachedRead(file);

	const checklist = extractChecklistItems(content);
	const initialPostItem = checklist.find((item) => /initial post submitted/i.test(item.text));

	return {
		path: note.path,
		props: note.props,
		hasChecklistTasks: checklist.length > 0,
		hasOutgoingLinks: extractWikilinks(content).length > 0,
		rubric: parseRubricTable(content),
		hasSqlFence: hasFencedCodeBlock(content, "sql"),
		hasAcceptanceCriteriaSection: /^##\s+acceptance criteria/im.test(content),
		hasInitialPostCheckedComplete: Boolean(initialPostItem?.checked),
		linkedTitles: extractWikilinks(content),
	};
}

export async function runHealthCheck(
	app: App,
	notes: IndexedNote[],
	courses: CourseConfig[],
	upcomingDeadlineWindowDays: number,
	staleLectureWindowDays: number
): Promise<HealthCheckResult[]> {
	const results: HealthCheckResult[] = [];

	for (const note of notes) {
		const facts = await buildNoteFacts(app, note);
		if (!facts) continue;
		results.push(...evaluatePerNoteRules(facts, upcomingDeadlineWindowDays));
	}

	for (const course of courses) {
		if (!course.active || !isInPersonLike(course)) continue;
		const lectureNotes = notes.filter((n) => n.courseId === course.id && n.props.type === "lecture");
		let mostRecentAgeDays: number | null = null;
		for (const lectureNote of lectureNotes) {
			const created = parseLocalDate(lectureNote.props.created) ?? new Date(lectureNote.ctime);
			const age = -daysFromToday(created);
			if (mostRecentAgeDays === null || age < mostRecentAgeDays) mostRecentAgeDays = age;
		}
		const hub = notes.find((n) => n.courseId === course.id && n.props.type === "course-hub");
		const result = checkStaleLectures(
			course.displayName,
			hub?.path ?? course.rootFolder,
			mostRecentAgeDays,
			staleLectureWindowDays
		);
		if (result) results.push(result);
	}

	const severityRank: Record<HealthCheckResult["severity"], number> = { "action-needed": 0, warning: 1, info: 2 };
	return results.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

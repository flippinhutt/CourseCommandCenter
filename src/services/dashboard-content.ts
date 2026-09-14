import type { CanvasSyncMatch, CourseConfig, IndexedNote } from "../types";
import { compareDueDates, daysFromToday, isPastDue, parseLocalDate } from "../utils/dates";
import { DASHBOARD_FILE_MARKER } from "../constants";
import { getCourseById } from "./course-service";
import { pendingCanvasNotePath } from "./canvas-match";

const ACTIVE_STATUSES = new Set(["not-started", "in-progress", "blocked", "reviewing"]);

/** One row in the generated dashboard file. `linkPath` is always the
 * wikilink target: an existing note's path, or — for a Canvas event with no
 * note yet — the path a note for it *would* get, so clicking the link
 * creates it (Obsidian's native unresolved-link behavior; the plugin then
 * populates the blank note it creates). `canvasUrl`, when present, is
 * always a secondary "view on Canvas" link shown alongside. Every line
 * renders as a checkbox, including not-yet-created Canvas items — checking
 * one there is purely visual and resets on the next Refresh, since the
 * whole file is regenerated wholesale. `isExistingNote` is kept for callers
 * that need to distinguish a real note from a pending Canvas event. */
export interface DashboardLine {
	label: string;
	due: string;
	courseLabel: string | null;
	linkPath: string | null;
	canvasUrl: string | null;
	isExistingNote: boolean;
}

function fromNote(note: IndexedNote, courses: CourseConfig[]): DashboardLine | null {
	if (!note.props.due || !parseLocalDate(note.props.due)) return null;
	if (note.props.status && !ACTIVE_STATUSES.has(note.props.status)) return null;
	const course = note.courseId ? getCourseById(note.courseId, courses) : null;
	return {
		label: note.basename,
		due: note.props.due,
		courseLabel: course?.displayName ?? null,
		linkPath: note.path,
		canvasUrl: null,
		isExistingNote: true,
	};
}

function fromUnmatchedCanvasEvent(match: CanvasSyncMatch): DashboardLine | null {
	if (match.matchedNote || !match.event.due) return null;
	return {
		label: match.event.title,
		due: match.event.due,
		courseLabel: match.matchedCourse?.displayName ?? null,
		linkPath: pendingCanvasNotePath(match),
		canvasUrl: match.event.url,
		isExistingNote: false,
	};
}

/** The shared pool behind both buildDashboardLines and buildPastDueLines:
 * every active (non-complete/submitted) vault note with a due date, plus
 * any Canvas event that doesn't have a matching note yet. Unsorted,
 * unfiltered by past/future — each caller applies its own isPastDue split
 * and ordering. */
function collectLines(notes: IndexedNote[], courses: CourseConfig[], canvasMatches: CanvasSyncMatch[]): DashboardLine[] {
	const lines: DashboardLine[] = [];
	for (const note of notes) {
		const line = fromNote(note, courses);
		if (line) lines.push(line);
	}
	for (const match of canvasMatches) {
		const line = fromUnmatchedCanvasEvent(match);
		if (line) lines.push(line);
	}
	return lines;
}

/** Builds the full, chronologically-sorted "Deadlines" pool — excluding
 * anything due before today. "Past due" means strictly before today; a due
 * date of today still counts as current, not past. Pure — no Obsidian
 * API. */
export function buildDashboardLines(notes: IndexedNote[], courses: CourseConfig[], canvasMatches: CanvasSyncMatch[] = []): DashboardLine[] {
	return collectLines(notes, courses, canvasMatches)
		.filter((l) => !isPastDue(l.due))
		.sort((a, b) => compareDueDates(a.due, b.due));
}

/** Mirror of buildDashboardLines for the "Past due" section: the same pool,
 * but only entries strictly before today, oldest (most overdue) first —
 * checking one off there is exactly as valid a completion as checking off
 * anything else, it just wasn't done on time. Pure — no Obsidian API. */
export function buildPastDueLines(notes: IndexedNote[], courses: CourseConfig[], canvasMatches: CanvasSyncMatch[] = []): DashboardLine[] {
	return collectLines(notes, courses, canvasMatches)
		.filter((l) => isPastDue(l.due))
		.sort((a, b) => compareDueDates(a.due, b.due));
}

/** True if `due` is today, in the past (overdue), or within the next `days`
 * calendar days. */
export function isWithinDays(due: string, days: number): boolean {
	const date = parseLocalDate(due);
	if (!date) return false;
	return daysFromToday(date) <= days;
}

function formatLine(line: DashboardLine): string {
	const course = line.courseLabel ? ` (${line.courseLabel})` : "";
	const primary = line.linkPath ? `[[${line.linkPath.replace(/\.md$/i, "")}|${line.label}]]` : line.label;
	const canvasSuffix = line.canvasUrl ? ` ([Canvas](${line.canvasUrl}))` : "";
	return `- [ ] ${primary}${canvasSuffix} — due ${line.due}${course}`;
}

function section(title: string, items: DashboardLine[]): string {
	const body = items.length === 0 ? "*Nothing here.*" : items.map(formatLine).join("\n");
	return `## ${title}\n\n${body}\n\n`;
}

/** Renders the full dashboard note: Deadlines (everything), Upcoming (due
 * within upcomingWindowDays), Do next (due within doNextWindowDays), Due
 * today (due exactly today — the narrowest forward-looking zoom level), and
 * Past due (overdue, from buildPastDueLines) at the very bottom. Sections
 * overlap on purpose — Due today's items also show in Do next, Upcoming,
 * and Deadlines, so each section is a self-contained view at its own zoom
 * level. Past due is the one exception: it's disjoint from every section
 * above it (they all exclude anything overdue), kept separate so
 * forward-planning sections stay about what's still coming up. */
export function buildDashboardMarkdown(
	lines: DashboardLine[],
	doNextWindowDays: number,
	upcomingWindowDays: number,
	updated: string,
	pastDueLines: DashboardLine[] = []
): string {
	const upcoming = lines.filter((l) => isWithinDays(l.due, upcomingWindowDays));
	const doNext = lines.filter((l) => isWithinDays(l.due, doNextWindowDays));
	const dueToday = lines.filter((l) => isWithinDays(l.due, 0));

	return (
		`---\ntype: dashboard\nupdated: ${updated}\n---\n\n` +
		`# Dashboard\n\n*${DASHBOARD_FILE_MARKER} — edits here are overwritten on the next update.*\n\n` +
		section("Deadlines", lines) +
		section(`Upcoming (due within ${upcomingWindowDays} days)`, upcoming) +
		section(`Do next (due within ${doNextWindowDays} days)`, doNext) +
		section("Due today", dueToday) +
		section("Past due", pastDueLines)
	);
}

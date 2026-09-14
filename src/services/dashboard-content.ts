import type { CanvasSyncMatch, CourseConfig, IndexedNote } from "../types";
import { compareDueDates, daysFromToday, parseLocalDate } from "../utils/dates";
import { DASHBOARD_FILE_MARKER } from "../constants";
import { getCourseById } from "./course-service";
import { pendingCanvasNotePath } from "./canvas-match";

const ACTIVE_STATUSES = new Set(["not-started", "in-progress", "blocked", "reviewing"]);

/** One row in the generated dashboard file. `linkPath` is always the
 * wikilink target: an existing note's path, or — for a Canvas event with no
 * note yet — the path a note for it *would* get, so clicking the link
 * creates it (Obsidian's native unresolved-link behavior; the plugin then
 * populates the blank note it creates). `canvasUrl`, when present, is
 * always a secondary "view on Canvas" link shown alongside. */
export interface DashboardLine {
	label: string;
	due: string;
	courseLabel: string | null;
	linkPath: string | null;
	canvasUrl: string | null;
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
	};
}

/** Builds the full, chronologically-sorted "Deadlines" pool: every active
 * (non-complete/submitted) vault note with a due date, plus any Canvas
 * events that don't have a matching note yet. Pure — no Obsidian API. */
export function buildDashboardLines(notes: IndexedNote[], courses: CourseConfig[], canvasMatches: CanvasSyncMatch[] = []): DashboardLine[] {
	const lines: DashboardLine[] = [];
	for (const note of notes) {
		const line = fromNote(note, courses);
		if (line) lines.push(line);
	}
	for (const match of canvasMatches) {
		const line = fromUnmatchedCanvasEvent(match);
		if (line) lines.push(line);
	}
	return lines.sort((a, b) => compareDueDates(a.due, b.due));
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
	return `- ${primary}${canvasSuffix} — due ${line.due}${course}`;
}

function section(title: string, items: DashboardLine[]): string {
	const body = items.length === 0 ? "*Nothing here.*" : items.map(formatLine).join("\n");
	return `## ${title}\n\n${body}\n\n`;
}

/** Renders the full dashboard note: Deadlines (everything), Current work
 * (due within currentWorkWindowDays), Do next (due within doNextWindowDays).
 * Sections overlap on purpose — Do next items also show in Current work and
 * Deadlines, so each section is a self-contained view at its own zoom
 * level. */
export function buildDashboardMarkdown(lines: DashboardLine[], doNextWindowDays: number, currentWorkWindowDays: number, updated: string): string {
	const currentWork = lines.filter((l) => isWithinDays(l.due, currentWorkWindowDays));
	const doNext = lines.filter((l) => isWithinDays(l.due, doNextWindowDays));

	return (
		`---\ntype: dashboard\nupdated: ${updated}\n---\n\n` +
		`# Dashboard\n\n*${DASHBOARD_FILE_MARKER} — edits here are overwritten on the next update.*\n\n` +
		section("Deadlines", lines) +
		section(`Current work (due within ${currentWorkWindowDays} days)`, currentWork) +
		section(`Do next (due within ${doNextWindowDays} days)`, doNext)
	);
}

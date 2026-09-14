import type { CanvasSyncMatch, CourseConfig, IcsEvent, IndexedNote } from "../types";
import { matchCourseByCode } from "./course-service";

function normalizeTitle(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Matches parsed Canvas events against configured courses and already-
 * indexed vault notes. An event whose "[Course Code]" hint doesn't match any
 * configured course is dropped — the plugin has nowhere to route it. A note
 * is matched first by a prior sync's stamped `id` (the Canvas UID, most
 * reliable across renames), falling back to a same-course, normalized-title
 * match for a note that predates any sync. No Obsidian API dependency, so
 * this stays independently testable outside the Obsidian runtime. */
export function matchCanvasEvents(events: IcsEvent[], notes: IndexedNote[], courses: CourseConfig[]): CanvasSyncMatch[] {
	const matches: CanvasSyncMatch[] = [];
	for (const event of events) {
		const matchedCourse = event.courseCodeHint ? matchCourseByCode(event.courseCodeHint, courses) : null;
		if (!matchedCourse) continue;

		const byId = notes.find((n) => n.props.id === event.uid) ?? null;
		const byTitle =
			byId ??
			notes.find((n) => n.courseId === matchedCourse.id && normalizeTitle(n.basename) === normalizeTitle(event.title)) ??
			null;

		matches.push({ event, matchedCourse, matchedNote: byTitle });
	}
	return matches;
}

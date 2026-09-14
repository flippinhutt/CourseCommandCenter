import type { CanvasSyncMatch, CourseConfig, IcsEvent, IndexedNote } from "../types";
import { folderForArtifact, matchCourseByCode } from "./course-service";
import { notePathFor } from "../utils/paths";

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

/** The vault path a note for this (still-unmatched) event would get if
 * created as an "assignment" in its matched course — i.e. where clicking a
 * wikilink to it would create a blank note. Both the dashboard file's link
 * target and the plugin's pending-note cache key come from this one
 * function so they can never drift apart. Only meaningful when
 * matchedCourse is set; returns null otherwise. */
export function pendingCanvasNotePath(match: CanvasSyncMatch): string | null {
	if (!match.matchedCourse) return null;
	const folder = folderForArtifact(match.matchedCourse, "assignment");
	return notePathFor(folder, match.event.title);
}

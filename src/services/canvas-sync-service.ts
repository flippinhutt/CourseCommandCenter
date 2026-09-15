import { type App, requestUrl, TFile } from "obsidian";
import type { CanvasSyncMatch, IcsEvent } from "../types";
import { parseIcsEvents } from "../utils/ics";
import { createNoteFromTemplate } from "./template-service";

export { matchCanvasEvents } from "./canvas-match";

export async function fetchCanvasEvents(icsUrl: string): Promise<IcsEvent[]> {
	const response = await requestUrl({ url: icsUrl });
	return parseIcsEvents(response.text);
}

/** Applies a matched event's due date (and backfills `id` if not already
 * set) onto its matched note via processFrontMatter. Only ever touches
 * `due` and `id` — never any other field, and never creates or deletes a
 * file. */
export async function applyCanvasDueDate(app: App, match: CanvasSyncMatch): Promise<boolean> {
	if (!match.matchedNote || !match.event.due) return false;
	const file = app.vault.getAbstractFileByPath(match.matchedNote.path);
	if (!(file instanceof TFile)) return false;

	await app.fileManager.processFrontMatter(file, (fm: { due?: string; id?: string }) => {
		fm.due = match.event.due ?? undefined;
		if (!fm.id) fm.id = match.event.uid;
	});
	return true;
}

/** Creates a new assignment note for an unmatched Canvas event, in the
 * matched course's configured folder for the "assignment" type. */
export async function createNoteForCanvasEvent(
	app: App,
	match: CanvasSyncMatch,
	folder: string,
	templatesFolder: string,
	templaterInstalled: boolean,
	isInPersonLike: boolean
): Promise<TFile> {
	if (!match.matchedCourse) throw new Error("Canvas event has no matched course.");
	return createNoteFromTemplate(app, {
		folder,
		title: match.event.title,
		course: match.matchedCourse,
		artifactType: "assignment",
		due: match.event.due ?? undefined,
		id: match.event.uid,
		templatesFolder,
		templaterInstalled,
		isInPersonLike,
	});
}

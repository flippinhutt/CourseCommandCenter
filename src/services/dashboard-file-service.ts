import { type App, normalizePath, TFile } from "obsidian";
import type { CanvasSyncMatch, CourseConfig, IndexedNote, PluginSettings } from "../types";
import { buildDashboardLines, buildDashboardMarkdown } from "./dashboard-content";
import { DASHBOARD_FILE_MARKER } from "../constants";
import { formatIsoDate } from "../utils/dates";

export class DashboardFileConflictError extends Error {
	constructor(public path: string) {
		super(`"${path}" already exists and doesn't look like a Course Command Center dashboard file.`);
	}
}

/** Regenerates the configured dashboard file from the current note index
 * (plus any Canvas events passed in that have no matching note yet). Fully
 * overwrites the file's content every time — that's the point, it's meant
 * to always reflect current state — but refuses to touch a pre-existing
 * file that wasn't written by this feature, to avoid clobbering an
 * unrelated note if the configured path collides with one. */
export async function updateDashboardFile(
	app: App,
	notes: IndexedNote[],
	courses: CourseConfig[],
	settings: PluginSettings,
	canvasMatches: CanvasSyncMatch[] = []
): Promise<void> {
	const path = normalizePath(settings.dashboardFilePath.trim());
	if (!path) return;

	const lines = buildDashboardLines(notes, courses, canvasMatches);
	const content = buildDashboardMarkdown(lines, settings.doNextWindowDays, settings.upcomingDeadlineWindowDays, formatIsoDate(new Date()));

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		const currentContent = await app.vault.cachedRead(existing);
		if (!currentContent.includes(DASHBOARD_FILE_MARKER)) {
			throw new DashboardFileConflictError(path);
		}
		await app.vault.modify(existing, content);
	} else {
		await app.vault.create(path, content);
	}
}

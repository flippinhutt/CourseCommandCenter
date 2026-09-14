import { type App, TFile } from "obsidian";
import type { CourseConfig, IndexedNote, PluginSettings } from "../types";
import { readNoteProperties } from "../utils/frontmatter";
import { matchCourseByCode } from "./course-service";

const DEBOUNCE_MS = 500;

/** Builds and maintains an index of vault notes from Obsidian's metadata
 * cache, rather than re-reading file contents. Refreshes are debounced so
 * rapid successive metadata-cache events (typing, bulk edits) collapse into
 * one rebuild instead of a rescan per keystroke. */
export class NoteIndexService {
	private notes: IndexedNote[] = [];
	private debounceTimer: number | null = null;
	private listeners: Array<() => void> = [];

	constructor(private app: App, private getSettings: () => PluginSettings) {}

	getNotes(): IndexedNote[] {
		return this.notes;
	}

	onChange(listener: () => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	rebuildNow(): void {
		const settings = this.getSettings();
		const courses = settings.courses;
		const files = this.app.vault.getMarkdownFiles();
		const scanRoots = settings.scanEntireVault ? null : courses.map((c) => c.rootFolder);

		const notes: IndexedNote[] = [];
		for (const file of files) {
			if (scanRoots && !scanRoots.some((root) => file.path === root || file.path.startsWith(root + "/"))) {
				continue;
			}
			notes.push(this.indexFile(file, courses));
		}
		this.notes = notes;
		for (const listener of this.listeners) listener();
	}

	requestRefresh(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = window.setTimeout(() => {
			this.debounceTimer = null;
			this.rebuildNow();
		}, DEBOUNCE_MS);
	}

	private indexFile(file: TFile, courses: CourseConfig[]): IndexedNote {
		const cache = this.app.metadataCache.getFileCache(file);
		const props = readNoteProperties(cache?.frontmatter as Record<string, unknown> | undefined);
		const course = matchCourseByCode(props.course, courses);
		return {
			path: file.path,
			basename: file.basename,
			ctime: file.stat.ctime,
			mtime: file.stat.mtime,
			props,
			courseId: course?.id ?? null,
		};
	}
}

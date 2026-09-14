import { Editor, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { CourseCommandCenterView } from "./src/views/course-command-center-view";
import { CourseCommandCenterSettingTab } from "./src/settings";
import { DEFAULT_SETTINGS, PLUGIN_VIEW_TYPE } from "./src/constants";
import type { PluginSettings } from "./src/types";
import { NoteIndexService } from "./src/services/note-index-service";
import { detectOptionalPlugins } from "./src/services/optional-plugin-service";
import { runHealthCheck } from "./src/services/health-check-service";
import { HealthCheckModal } from "./src/modals/health-check-modal";
import { CreateNoteModal } from "./src/modals/create-note-modal";
import { DashboardInsertModal, buildDashboardBlock } from "./src/modals/dashboard-insert-modal";
import { CanvasSyncModal } from "./src/modals/canvas-sync-modal";
import { activeCourses, deriveQuickActions, isInPersonLike } from "./src/services/course-service";
import { updateDashboardFile } from "./src/services/dashboard-file-service";
import { matchCanvasEvents, pendingCanvasNotePath } from "./src/services/canvas-match";
import { populateExistingNote } from "./src/services/template-service";
import type { CanvasSyncMatch, OptionalPluginStatus } from "./src/types";

/** A just-created file is only ever "upgraded" from a pending Canvas-event
 * placeholder if its content is at most this long — a cheap guard against
 * clobbering something unrelated that coincidentally landed at the exact
 * same path at the exact same moment. */
const MAX_BLANK_NOTE_LENGTH_TO_UPGRADE = 200;

export default class CourseCommandCenterPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	noteIndex!: NoteIndexService;
	private optionalPluginStatus: OptionalPluginStatus | null = null;
	/** Vault path -> the Canvas event a note there would represent, for
	 * events with no matching note yet. Populated whenever the dashboard
	 * file is regenerated with fresh Canvas data. Lets clicking the
	 * dashboard file's wikilink for such an event (which makes Obsidian
	 * create a blank note) trigger populating that note properly instead of
	 * leaving it blank. */
	private pendingCanvasNotes = new Map<string, CanvasSyncMatch>();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.noteIndex = new NoteIndexService(this.app, () => this.settings);

		this.registerView(PLUGIN_VIEW_TYPE, (leaf) => new CourseCommandCenterView(leaf, this));

		this.addRibbonIcon("graduation-cap", "Open Course Command Center", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-course-command-center",
			name: "Open Course Command Center",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "run-course-health-check",
			name: "Run course health check",
			callback: () => void this.runHealthCheckCommand(),
		});

		this.addCommand({
			id: "insert-course-command-center-block",
			name: "Insert Course Command Center block into current note",
			editorCallback: (editor) => this.insertDashboardBlock(editor),
		});

		this.addCommand({
			id: "sync-canvas-calendar",
			name: "Sync Canvas calendar",
			callback: () => this.syncCanvasCalendar(),
		});

		this.registerQuickActionCommands();
		this.addSettingTab(new CourseCommandCenterSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.optionalPluginStatus = detectOptionalPlugins(this.app);
			this.noteIndex.rebuildNow();
			if (this.settings.openAtStartup) void this.activateView();
		});

		this.registerEvent(this.app.metadataCache.on("changed", () => this.noteIndex.requestRefresh()));
		this.registerEvent(this.app.vault.on("delete", () => this.noteIndex.requestRefresh()));
		this.registerEvent(this.app.vault.on("rename", () => this.noteIndex.requestRefresh()));
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile) void this.handlePossibleCanvasNoteCreation(file);
			})
		);
	}

	onunload(): void {
		// Views are torn down by Obsidian; nothing else to release.
	}

	getOptionalPluginStatus(): OptionalPluginStatus {
		if (!this.optionalPluginStatus) this.optionalPluginStatus = detectOptionalPlugins(this.app);
		return this.optionalPluginStatus;
	}

	requestIndexRefresh(): void {
		this.noteIndex.requestRefresh();
	}

	/** The current picture of Canvas data: the last sync's raw events,
	 * re-matched against the *current* note index and course list every time
	 * this is called. Never re-fetches — that only happens in
	 * syncCanvasCalendar. This is what makes Refresh (and everything else)
	 * durable: a note created or deleted since the last sync is reflected
	 * immediately, and nothing needs a network call to redraw correctly.
	 * Returns [] if there's never been a successful sync. */
	getCurrentCanvasMatches(): CanvasSyncMatch[] {
		if (this.settings.lastCanvasEvents.length === 0) return [];
		return matchCanvasEvents(this.settings.lastCanvasEvents, this.noteIndex.getNotes(), activeCourses(this.settings.courses));
	}

	/** Regenerates the dashboard file, if one is configured, and refreshes
	 * the pending-notes cache used by handlePossibleCanvasNoteCreation —
	 * both always derived fresh from getCurrentCanvasMatches(), so calling
	 * this after a plain Refresh (no new Canvas fetch) still includes
	 * whatever the last sync found instead of wiping it. Never throws:
	 * returns a status the caller can inspect, and also shows a Notice on
	 * failure for callers that don't check the return value. */
	async updateDashboardFileIfConfigured(): Promise<{ status: "disabled" | "written" | "error"; message?: string }> {
		const canvasMatches = this.getCurrentCanvasMatches();
		this.pendingCanvasNotes = new Map(
			canvasMatches
				.filter((match) => !match.matchedNote)
				.map((match) => [pendingCanvasNotePath(match), match] as const)
				.filter((entry): entry is [string, CanvasSyncMatch] => entry[0] !== null)
		);

		if (!this.settings.dashboardFilePath.trim()) return { status: "disabled" };
		try {
			await updateDashboardFile(this.app, this.noteIndex.getNotes(), activeCourses(this.settings.courses), this.settings, canvasMatches);
			return { status: "written" };
		} catch (error) {
			const message = error instanceof Error ? error.message : "unknown error";
			new Notice(`Could not update the dashboard file: ${message}`);
			console.error("Course Command Center: dashboard file update failed", error);
			return { status: "error", message };
		}
	}

	/** Fires on every new file in the vault. If it lands exactly where a
	 * pending Canvas event's note would go — i.e. the user just clicked that
	 * event's wikilink in the dashboard file, and Obsidian created the
	 * resulting blank note — populate it with the real frontmatter/template
	 * content instead of leaving it blank, then refresh. One-shot: the
	 * pending entry is consumed whether or not the upgrade succeeds, so a
	 * second file at the same path (after a rename/delete) is never
	 * re-upgraded from stale data. */
	private async handlePossibleCanvasNoteCreation(file: TFile): Promise<void> {
		const match = this.pendingCanvasNotes.get(file.path);
		this.pendingCanvasNotes.delete(file.path);
		if (!match || !match.matchedCourse) return;

		try {
			const content = await this.app.vault.cachedRead(file);
			if (content.trim().length > MAX_BLANK_NOTE_LENGTH_TO_UPGRADE) return;

			await populateExistingNote(this.app, file, {
				folder: "", // unused by populateExistingNote — the file's path is already fixed.
				title: match.event.title,
				course: match.matchedCourse,
				artifactType: "assignment",
				due: match.event.due ?? undefined,
				id: match.event.uid,
				templatesFolder: this.settings.templatesFolder,
				templaterInstalled: this.getOptionalPluginStatus().templater,
				isInPersonLike: isInPersonLike(match.matchedCourse),
			});

			this.noteIndex.rebuildNow();
			void this.updateDashboardFileIfConfigured();
			new Notice(`Filled in "${match.event.title}" from Canvas.`);
		} catch (error) {
			console.error("Course Command Center: failed to populate note created from a dashboard-file link", error);
		}
	}

	/** Re-registers quick-action commands from the current course/folder-map
	 * settings. Obsidian's command registry keys by id, so calling this again
	 * after editing settings updates existing entries and adds new ones;
	 * a command for a type/course that was since removed only disappears
	 * after Obsidian is reloaded. Call after any settings change that adds,
	 * removes, or remaps a course's folder map. */
	registerQuickActionCommands(): void {
		for (const course of this.settings.courses) {
			for (const action of deriveQuickActions(course)) {
				this.addCommand({
					id: `quick-action-${course.id}-${action.id}`,
					name: `${course.displayName}: ${action.label}`,
					callback: () => {
						new CreateNoteModal(this.app, course, action, this.settings, this.getOptionalPluginStatus().templater, () =>
							this.noteIndex.requestRefresh()
						).open();
					},
				});
			}
		}
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<PluginSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...stored, courses: stored?.courses ?? DEFAULT_SETTINGS.courses };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async resetSettingsToDefault(): Promise<void> {
		this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
		await this.saveSettings();
		this.noteIndex.requestRefresh();
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(PLUGIN_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: PLUGIN_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	syncCanvasCalendar(): void {
		if (!this.settings.canvasIcsUrl.trim()) {
			new Notice("Add your Canvas calendar feed URL in Settings → Course Command Center first.");
			return;
		}
		new CanvasSyncModal(this.app, this).open();
	}

	private async runHealthCheckCommand(): Promise<void> {
		const results = await runHealthCheck(
			this.app,
			this.noteIndex.getNotes(),
			activeCourses(this.settings.courses),
			this.settings.upcomingDeadlineWindowDays,
			this.settings.staleLectureWindowDays
		);
		new HealthCheckModal(this.app, results).open();
	}

	private insertDashboardBlock(editor: Editor): void {
		const status = this.getOptionalPluginStatus();
		const courses = activeCourses(this.settings.courses);

		if (!status.tasks && !status.dataview) {
			editor.replaceSelection(buildDashboardBlock(courses, "plain"));
			return;
		}

		new DashboardInsertModal(this.app, status.tasks, status.dataview, (choice) => {
			editor.replaceSelection(buildDashboardBlock(courses, choice));
		}).open();
	}
}

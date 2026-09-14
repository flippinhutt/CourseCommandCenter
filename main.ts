import { Editor, Plugin, WorkspaceLeaf } from "obsidian";
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
import { activeCourses, deriveQuickActions } from "./src/services/course-service";
import type { OptionalPluginStatus } from "./src/types";

export default class CourseCommandCenterPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	noteIndex!: NoteIndexService;
	private optionalPluginStatus: OptionalPluginStatus | null = null;

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

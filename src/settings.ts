import { App, PluginSettingTab, Setting } from "obsidian";
import type CourseCommandCenterPlugin from "../main";
import type { CourseConfig, Delivery } from "./types";
import { KNOWN_ARTIFACT_TYPES } from "./constants";

const ARTIFACT_TYPE_DATALIST_ID = "course-command-center-artifact-type-suggestions";

export class CourseCommandCenterSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CourseCommandCenterPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("course-command-center-settings");

		new Setting(containerEl).setName("Course Command Center").setHeading();

		const datalist = containerEl.createEl("datalist", { attr: { id: ARTIFACT_TYPE_DATALIST_ID } });
		for (const type of KNOWN_ARTIFACT_TYPES) datalist.createEl("option", { value: type });

		new Setting(containerEl)
			.setName("Open at startup")
			.setDesc("Open the Course Command Center view automatically when Obsidian starts.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.openAtStartup).onChange(async (value) => {
					this.plugin.settings.openAtStartup = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Scan entire vault")
			.setDesc("Off (default): only scan configured course root folders. On: scan every Markdown note in the vault.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.scanEntireVault).onChange(async (value) => {
					this.plugin.settings.scanEntireVault = value;
					await this.plugin.saveSettings();
					this.plugin.requestIndexRefresh();
				})
			);

		new Setting(containerEl)
			.setName("Recent notes count")
			.setDesc("How many notes to show in the Recently created section.")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.recentNotesCount)).onChange(async (value) => {
					const num = Number(value);
					if (Number.isFinite(num) && num > 0) {
						this.plugin.settings.recentNotesCount = Math.floor(num);
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName("Upcoming deadline window (days)")
			.setDesc(
				"How many days ahead counts as an upcoming deadline. Also drives the dashboard file's \"Upcoming\" section."
			)
			.addText((text) =>
				text.setValue(String(this.plugin.settings.upcomingDeadlineWindowDays)).onChange(async (value) => {
					const num = Number(value);
					if (Number.isFinite(num) && num >= 0) {
						this.plugin.settings.upcomingDeadlineWindowDays = Math.floor(num);
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName("Stale lecture window (days)")
			.setDesc("Health check flags an in-person/hybrid course with no lecture note created in this many days.")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.staleLectureWindowDays)).onChange(async (value) => {
					const num = Number(value);
					if (Number.isFinite(num) && num >= 0) {
						this.plugin.settings.staleLectureWindowDays = Math.floor(num);
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName("Include checkbox tasks")
			.setDesc("Include incomplete Markdown checkbox tasks in the dashboard.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeCheckboxTasks).onChange(async (value) => {
					this.plugin.settings.includeCheckboxTasks = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Templates folder")
			.addText((text) =>
				text.setValue(this.plugin.settings.templatesFolder).onChange(async (value) => {
					this.plugin.settings.templatesFolder = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Daily note folder")
			.addText((text) =>
				text.setValue(this.plugin.settings.dailyNoteFolder).onChange(async (value) => {
					this.plugin.settings.dailyNoteFolder = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Weekly review folder")
			.addText((text) =>
				text.setValue(this.plugin.settings.weeklyReviewFolder).onChange(async (value) => {
					this.plugin.settings.weeklyReviewFolder = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Inbox path")
			.addText((text) =>
				text.setValue(this.plugin.settings.inboxPath).onChange(async (value) => {
					this.plugin.settings.inboxPath = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName("Dashboard file (optional)").setHeading();
		containerEl.createEl("p", {
			text:
				"Leave the path empty to disable. When set, this note is fully regenerated (Deadlines / Upcoming / " +
				"Do next sections) every time you click Refresh in the view, and after a Canvas sync — never automatically " +
				"in the background. Manual edits to it are overwritten on the next update.",
			cls: "setting-item-description",
		});
		new Setting(containerEl)
			.setName("Dashboard file path")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Dashboard.md")
					.setValue(this.plugin.settings.dashboardFilePath)
					.onChange(async (value) => {
						this.plugin.settings.dashboardFilePath = value.trim();
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Do next window (days)")
			.setDesc('The dashboard file\'s "Do next" section: due today, overdue, or within this many days.')
			.addText((text) =>
				text.setValue(String(this.plugin.settings.doNextWindowDays)).onChange(async (value) => {
					const num = Number(value);
					if (Number.isFinite(num) && num >= 0) {
						this.plugin.settings.doNextWindowDays = Math.floor(num);
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl).setName("Canvas calendar sync (optional)").setHeading();
		containerEl.createEl("p", {
			text:
				"The plugin makes no network calls except this one, and only when you explicitly click Sync — " +
				"never automatically. Find your feed URL in Canvas: Calendar → Calendar Feed (bottom-left), then copy the ICS link. " +
				"Treat it like a password — anyone with the URL can see your Canvas calendar.",
			cls: "setting-item-description",
		});
		new Setting(containerEl)
			.setName("Canvas calendar feed URL")
			.addText((text) =>
				text
					.setPlaceholder("https://<school>.instructure.com/feeds/calendars/user_....ics")
					.setValue(this.plugin.settings.canvasIcsUrl)
					.onChange(async (value) => {
						this.plugin.settings.canvasIcsUrl = value.trim();
						await this.plugin.saveSettings();
					})
			);

		const dismissedCount = this.plugin.settings.completedCanvasEventUids.length;
		new Setting(containerEl)
			.setName("Checked-off Canvas items")
			.setDesc(
				`${dismissedCount} unmatched Canvas item${dismissedCount === 1 ? "" : "s"} currently checked off without a note. ` +
					"Clearing brings them all back into Do next / Due today / Upcoming."
			)
			.addButton((button) =>
				button
					.setButtonText("Clear checked-off items")
					.setDisabled(dismissedCount === 0)
					.onClick(async () => {
						await this.plugin.clearCompletedCanvasEvents();
						this.display();
					})
			);

		new Setting(containerEl).setName("Courses").setHeading();

		for (const course of this.plugin.settings.courses) {
			this.renderCourse(containerEl, course);
		}

		new Setting(containerEl).addButton((button) =>
			button.setButtonText("Add course").onClick(async () => {
				this.plugin.settings.courses.push({
					id: `course-${Date.now()}`,
					code: "",
					displayName: "New Course",
					delivery: "online",
					rootFolder: "",
					meetingDays: "",
					meetingTime: "",
					location: "",
					canvasUrl: "",
					active: true,
					folderMap: {},
				});
				await this.plugin.saveSettings();
				this.plugin.registerQuickActionCommands();
				this.display();
			})
		);

		new Setting(containerEl).setName("Optional plugin detection").setHeading();
		const statusEl = containerEl.createDiv({ cls: "course-command-center-plugin-status" });
		const status = this.plugin.getOptionalPluginStatus();
		for (const [key, installed] of Object.entries(status)) {
			statusEl.createEl("div", { text: `${key}: ${installed ? "installed" : "not installed"}` });
		}

		new Setting(containerEl).setName("Reset").setHeading();
		new Setting(containerEl)
			.setName("Reset to defaults")
			.setDesc("Restores default courses and settings. This does not touch any notes.")
			.addButton((button) =>
				button
					.setButtonText("Reset")
					.setDestructive()
					.onClick(async () => {
						if (!confirm("Reset Course Command Center settings to defaults? This does not affect vault notes.")) {
							return;
						}
						await this.plugin.resetSettingsToDefault();
						this.display();
					})
			);
	}

	private renderCourse(containerEl: HTMLElement, course: CourseConfig): void {
		const wrapper = containerEl.createDiv({ cls: "course-command-center-course-editor" });
		new Setting(wrapper).setName(course.displayName || course.code || "Course").setHeading();

		new Setting(wrapper).setName("Course code").addText((text) =>
			text.setValue(course.code).onChange(async (value) => {
				course.code = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(wrapper).setName("Display name").addText((text) =>
			text.setValue(course.displayName).onChange(async (value) => {
				course.displayName = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(wrapper).setName("Delivery").addDropdown((dropdown) => {
			dropdown.addOption("online", "Online");
			dropdown.addOption("in-person", "In person");
			dropdown.addOption("hybrid", "Hybrid");
			dropdown.setValue(course.delivery).onChange(async (value) => {
				course.delivery = value as Delivery;
				await this.plugin.saveSettings();
			});
		});

		new Setting(wrapper).setName("Root folder").addText((text) =>
			text.setValue(course.rootFolder).onChange(async (value) => {
				course.rootFolder = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(wrapper).setName("Meeting days").addText((text) =>
			text.setValue(course.meetingDays).onChange(async (value) => {
				course.meetingDays = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(wrapper).setName("Meeting time").addText((text) =>
			text.setValue(course.meetingTime).onChange(async (value) => {
				course.meetingTime = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(wrapper).setName("Location").addText((text) =>
			text.setValue(course.location).onChange(async (value) => {
				course.location = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(wrapper).setName("Canvas URL").addText((text) =>
			text.setValue(course.canvasUrl).onChange(async (value) => {
				course.canvasUrl = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(wrapper).setName("Active").addToggle((toggle) =>
			toggle.setValue(course.active).onChange(async (value) => {
				course.active = value;
				await this.plugin.saveSettings();
			})
		);

		const folderMapEl = wrapper.createDiv({ cls: "course-command-center-folder-map" });
		folderMapEl.createEl("div", {
			text: "Artifact types (each one gets a \"Create <type>\" quick action and command)",
			cls: "setting-item-name",
		});

		const entries = Object.entries(course.folderMap).sort(([a], [b]) => a.localeCompare(b));
		if (entries.length === 0) {
			folderMapEl.createEl("p", { text: "No artifact types yet — add one below.", cls: "course-command-center-empty" });
		}
		for (const [type, folder] of entries) {
			new Setting(folderMapEl)
				.setName(type)
				.addText((text) =>
					text.setValue(folder).onChange(async (value) => {
						if (value) course.folderMap[type] = value;
						else delete course.folderMap[type];
						await this.plugin.saveSettings();
						this.plugin.registerQuickActionCommands();
					})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip(`Remove "${type}"`)
						.onClick(async () => {
							delete course.folderMap[type];
							await this.plugin.saveSettings();
							this.plugin.registerQuickActionCommands();
							this.display();
						})
				);
		}

		let newTypeValue = "";
		let newFolderValue = "";
		new Setting(folderMapEl)
			.setName("Add artifact type")
			.setDesc("Type any name (e.g. \"lab-report\") and a folder, or pick one of the built-in suggestions.")
			.addText((text) => {
				text.setPlaceholder("Type name").onChange((value) => {
					newTypeValue = value.trim();
				});
				text.inputEl.setAttribute("list", ARTIFACT_TYPE_DATALIST_ID);
			})
			.addText((text) =>
				text.setPlaceholder("Folder path").onChange((value) => {
					newFolderValue = value.trim();
				})
			)
			.addButton((button) =>
				button.setButtonText("Add").onClick(async () => {
					if (!newTypeValue || !newFolderValue) return;
					course.folderMap[newTypeValue] = newFolderValue;
					await this.plugin.saveSettings();
					this.plugin.registerQuickActionCommands();
					this.display();
				})
			);

		new Setting(wrapper).addButton((button) =>
			button
				.setButtonText("Remove course")
				.setDestructive()
				.onClick(async () => {
					if (!confirm(`Remove ${course.displayName || course.code} from Course Command Center? This does not delete any notes.`)) {
						return;
					}
					this.plugin.settings.courses = this.plugin.settings.courses.filter((c) => c.id !== course.id);
					await this.plugin.saveSettings();
					this.plugin.registerQuickActionCommands();
					this.display();
				})
		);
	}
}

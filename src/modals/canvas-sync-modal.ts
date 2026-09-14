import { App, Modal, Notice, Setting } from "obsidian";
import type CourseCommandCenterPlugin from "../../main";
import type { CanvasSyncMatch } from "../types";
import { applyCanvasDueDate, createNoteForCanvasEvent, fetchCanvasEvents, matchCanvasEvents } from "../services/canvas-sync-service";
import { activeCourses, folderForArtifact, isInPersonLike } from "../services/course-service";

export class CanvasSyncModal extends Modal {
	constructor(app: App, private plugin: CourseCommandCenterPlugin) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass("course-command-center-modal");
		contentEl.createEl("h2", { text: "Sync Canvas calendar" });
		const statusEl = contentEl.createEl("p", { text: "Fetching your Canvas calendar feed…" });

		try {
			const courses = activeCourses(this.plugin.settings.courses);
			const events = await fetchCanvasEvents(this.plugin.settings.canvasIcsUrl.trim());
			const matches = matchCanvasEvents(events, this.plugin.noteIndex.getNotes(), courses);

			const matched = matches.filter((m) => m.matchedNote);
			const unmatched = matches.filter((m) => !m.matchedNote);

			let updatedCount = 0;
			for (const match of matched) {
				const applied = await applyCanvasDueDate(this.app, match);
				if (applied) updatedCount++;
			}

			// Rebuild synchronously (not the debounced requestRefresh) so the
			// dashboard-file update below reads the due dates just applied,
			// not a stale pre-sync snapshot.
			if (updatedCount > 0) this.plugin.noteIndex.rebuildNow();

			const dashboardResult = await this.plugin.updateDashboardFileIfConfigured(unmatched);
			const dashboardStatus =
				dashboardResult.status === "written"
					? `Dashboard file (${this.plugin.settings.dashboardFilePath}) updated.`
					: dashboardResult.status === "error"
						? `Dashboard file update failed: ${dashboardResult.message}.`
						: "Dashboard file not configured.";

			const skipped = events.length - matches.length;
			statusEl.empty();
			statusEl.createEl("div", {
				text: `Fetched ${events.length} event(s) — ${matches.length} matched a configured course, ${skipped} skipped (no matching course).`,
			});
			statusEl.createEl("div", { text: `Updated ${updatedCount} due date(s) on existing notes.` });
			statusEl.createEl("div", { text: dashboardStatus });

			this.renderUnmatched(contentEl, unmatched);
		} catch (error) {
			statusEl.setText("Could not fetch or parse the Canvas calendar feed. Check the URL in Settings.");
			console.error("Course Command Center: Canvas sync failed", error);
		}
	}

	private renderUnmatched(container: HTMLElement, unmatched: CanvasSyncMatch[]): void {
		container.createEl("h3", { text: `Not yet in your vault (${unmatched.length})` });
		if (unmatched.length === 0) {
			container.createEl("p", { text: "Every Canvas item matched an existing note.", cls: "course-command-center-empty" });
			return;
		}
		if (this.plugin.settings.dashboardFilePath.trim()) {
			container.createEl("p", {
				text: "These are already listed in your dashboard file — create a note here only if you want a full note for one.",
				cls: "course-command-center-empty",
			});
		}

		const list = container.createDiv({ cls: "course-command-center-canvas-unmatched-list" });
		for (const match of unmatched) {
			this.renderUnmatchedRow(list, match);
		}
	}

	private renderUnmatchedRow(list: HTMLElement, match: CanvasSyncMatch): void {
		const label = `${match.matchedCourse?.displayName ?? "Unknown course"} — ${match.event.title}${match.event.due ? ` (due ${match.event.due})` : ""}`;
		const row = new Setting(list).setName(label);
		if (match.event.url) {
			row.addExtraButton((btn) =>
				btn
					.setIcon("external-link")
					.setTooltip("Open in Canvas")
					.onClick(() => window.open(match.event.url as string, "_blank"))
			);
		}
		row.addButton((button) =>
			button
				.setButtonText("Create note")
				.setCta()
				.onClick(async () => {
					if (!match.matchedCourse) return;
					try {
						const folder = folderForArtifact(match.matchedCourse, "assignment");
						await createNoteForCanvasEvent(
							this.app,
							match,
							folder,
							this.plugin.settings.templatesFolder,
							this.plugin.getOptionalPluginStatus().templater,
							isInPersonLike(match.matchedCourse)
						);
						this.plugin.noteIndex.rebuildNow();
						void this.plugin.updateDashboardFileIfConfigured();
						button.setButtonText("Created").setDisabled(true);
						new Notice(`Created "${match.event.title}"`);
					} catch (error) {
						new Notice("Could not create the note. See console for details.");
						console.error("Course Command Center: Canvas note creation failed", error);
					}
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

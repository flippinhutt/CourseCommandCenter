import { App, Modal, Notice, Setting } from "obsidian";
import type { CanvasSyncMatch, CourseConfig, IndexedNote } from "../types";
import { applyCanvasDueDate, createNoteForCanvasEvent, fetchCanvasEvents, matchCanvasEvents } from "../services/canvas-sync-service";
import { folderForArtifact, isInPersonLike } from "../services/course-service";

export interface CanvasSyncModalParams {
	icsUrl: string;
	notes: IndexedNote[];
	courses: CourseConfig[];
	templatesFolder: string;
	templaterInstalled: boolean;
	onSynced: () => void;
}

export class CanvasSyncModal extends Modal {
	constructor(app: App, private params: CanvasSyncModalParams) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass("course-command-center-modal");
		contentEl.createEl("h2", { text: "Sync Canvas calendar" });
		const statusEl = contentEl.createEl("p", { text: "Fetching your Canvas calendar feed…" });

		try {
			const events = await fetchCanvasEvents(this.params.icsUrl);
			const matches = matchCanvasEvents(events, this.params.notes, this.params.courses);

			const matched = matches.filter((m) => m.matchedNote);
			const unmatched = matches.filter((m) => !m.matchedNote);

			let updatedCount = 0;
			for (const match of matched) {
				const applied = await applyCanvasDueDate(this.app, match);
				if (applied) updatedCount++;
			}
			if (updatedCount > 0) this.params.onSynced();

			const skipped = events.length - matches.length;
			statusEl.setText(
				`Updated ${updatedCount} due date(s) on existing notes.` +
					(skipped > 0 ? ` Skipped ${skipped} event(s) with no matching configured course.` : "")
			);

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
							this.params.templatesFolder,
							this.params.templaterInstalled,
							isInPersonLike(match.matchedCourse)
						);
						this.params.onSynced();
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

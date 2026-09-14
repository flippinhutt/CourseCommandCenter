import { App, Modal, Notice, Setting } from "obsidian";
import type { CourseConfig, QuickAction } from "../types";
import { createNoteFromTemplate, NoteAlreadyExistsError } from "../services/template-service";
import { folderForArtifact, isInPersonLike } from "../services/course-service";
import type { PluginSettings } from "../types";

export class CreateNoteModal extends Modal {
	private title = "";
	private due = "";
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private course: CourseConfig,
		private action: QuickAction,
		private settings: PluginSettings,
		private templaterInstalled: boolean,
		private onCreated: (path: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("course-command-center-modal");
		contentEl.createEl("h2", { text: this.action.label });

		new Setting(contentEl).setName("Title").addText((text) => {
			text.setPlaceholder("Note title").onChange((value) => {
				this.title = value;
			});
			text.inputEl.focus();
		});

		new Setting(contentEl).setName("Due date").setDesc("Optional, format YYYY-MM-DD.").addText((text) => {
			text.setPlaceholder("YYYY-MM-DD").onChange((value) => {
				this.due = value.trim();
			});
		});

		this.errorEl = contentEl.createDiv({ cls: "course-command-center-modal-error" });

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText("Create")
				.setCta()
				.onClick(() => void this.submit())
		);
	}

	private async submit(): Promise<void> {
		const trimmedTitle = this.title.trim();
		if (!trimmedTitle) {
			this.showError("Enter a title.");
			return;
		}
		if (this.due && !/^\d{4}-\d{2}-\d{2}$/.test(this.due)) {
			this.showError("Due date must be in YYYY-MM-DD format.");
			return;
		}

		const folder = folderForArtifact(this.course, this.action.artifactType);
		try {
			const file = await createNoteFromTemplate(this.app, {
				folder,
				title: trimmedTitle,
				course: this.course,
				artifactType: this.action.artifactType,
				due: this.due || undefined,
				templatesFolder: this.settings.templatesFolder,
				templaterInstalled: this.templaterInstalled,
				isInPersonLike: isInPersonLike(this.course),
			});
			this.close();
			await this.app.workspace.getLeaf(false).openFile(file);
			this.onCreated(file.path);
			new Notice(`Created "${file.basename}"`);
		} catch (error) {
			if (error instanceof NoteAlreadyExistsError) {
				this.showError(`A note already exists at "${error.path}". Choose a different title.`);
			} else {
				this.showError("Could not create the note. See console for details.");
				console.error("Course Command Center: note creation failed", error);
			}
		}
	}

	private showError(message: string): void {
		if (this.errorEl) this.errorEl.setText(message);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

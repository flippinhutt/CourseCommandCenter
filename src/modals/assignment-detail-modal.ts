import { App, Modal, Setting, TFile } from "obsidian";
import type { IndexedNote, NoteStatus } from "../types";
import { extractChecklistItems, extractWikilinks } from "../utils/markdown";
import { readRubricTable, summarizeRubric } from "../services/rubric-service";
import { formatHumanDate, parseLocalDate } from "../utils/dates";

const STATUS_OPTIONS: NoteStatus[] = ["not-started", "in-progress", "blocked", "reviewing", "submitted", "complete"];

function statusLabel(status: NoteStatus): string {
	return status
		.split("-")
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(" ");
}

export class AssignmentDetailModal extends Modal {
	/** `onStatusChange` fires only after the user explicitly picks a new
	 * status from the dropdown below — never as a side effect of opening
	 * this modal, per the plugin's frontmatter-write rule. */
	constructor(app: App, private note: IndexedNote, private onStatusChange?: () => void) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass("course-command-center-modal");
		contentEl.addClass("course-command-center-assignment-detail");

		const file = this.app.vault.getAbstractFileByPath(this.note.path);
		if (!(file instanceof TFile)) {
			contentEl.createEl("p", { text: "This note could not be found." });
			return;
		}

		contentEl.createEl("h2", { text: this.note.basename });

		const summary = contentEl.createDiv({ cls: "course-command-center-detail-summary" });
		this.addField(summary, "Course", this.note.props.course);
		this.addField(summary, "Due", this.formatDue());
		this.addStatusDropdown(contentEl, file);
		this.addField(summary, "Priority", this.note.props.priority);
		this.addField(summary, "Module", this.note.props.module);
		if (this.note.props.points_possible != null || this.note.props.points_earned != null) {
			this.addField(
				summary,
				"Points",
				`${this.note.props.points_earned ?? "—"} / ${this.note.props.points_possible ?? "—"}`
			);
		}
		if (this.note.props.grade) this.addField(summary, "Grade", this.note.props.grade);

		new Setting(contentEl).addButton((button) =>
			button.setButtonText("Open note").onClick(() => {
				this.close();
				void this.app.workspace.getLeaf(false).openFile(file);
			})
		);

		const content = await this.app.vault.cachedRead(file);

		const checklist = extractChecklistItems(content);
		contentEl.createEl("h3", { text: `Tasks (${checklist.filter((c) => !c.checked).length} open)` });
		if (checklist.length === 0) {
			contentEl.createEl("p", { text: "No checklist items found.", cls: "course-command-center-empty" });
		} else {
			const list = contentEl.createEl("ul");
			for (const item of checklist) {
				const li = list.createEl("li", { text: item.text });
				if (item.checked) li.addClass("course-command-center-task-done");
			}
		}

		const links = extractWikilinks(content).filter((l, i, arr) => arr.indexOf(l) === i);
		contentEl.createEl("h3", { text: "Linked notes" });
		this.renderLinkedNotes(contentEl, links);

		const rubric = await readRubricTable(this.app, file);
		contentEl.createEl("h3", { text: "Rubric" });
		if (!rubric || rubric.rows.length === 0) {
			contentEl.createEl("p", { text: "No rubric table found.", cls: "course-command-center-empty" });
		} else {
			contentEl.createEl("p", { text: summarizeRubric(rubric), cls: "course-command-center-rubric-summary" });
			const table = contentEl.createEl("table", { cls: "course-command-center-rubric-table" });
			const head = table.createEl("tr");
			for (const h of ["Criterion", "Requirement", "Evidence", "Complete"]) head.createEl("th", { text: h });
			for (const row of rubric.rows) {
				const tr = table.createEl("tr");
				tr.createEl("td", { text: row.criterion });
				tr.createEl("td", { text: row.requirement });
				const evidenceCell = tr.createEl("td");
				if (row.missingEvidence) {
					evidenceCell.createEl("span", { text: "Missing evidence", cls: "course-command-center-missing-evidence" });
				} else {
					this.renderLinkedNotes(evidenceCell, row.evidenceLinks);
				}
				tr.createEl("td", { text: row.complete ? "Yes" : "No" });
			}
		}
	}

	private formatDue(): string | undefined {
		const date = parseLocalDate(this.note.props.due);
		return date ? formatHumanDate(date) : this.note.props.due;
	}

	private addStatusDropdown(container: HTMLElement, file: TFile): void {
		new Setting(container)
			.setName("Status")
			.addDropdown((dropdown) => {
				for (const status of STATUS_OPTIONS) dropdown.addOption(status, statusLabel(status));
				dropdown.setValue(this.note.props.status ?? "not-started").onChange(async (value) => {
					await this.app.fileManager.processFrontMatter(file, (fm) => {
						fm.status = value as NoteStatus;
					});
					this.note.props.status = value as NoteStatus;
					this.onStatusChange?.();
				});
			});
	}

	private addField(container: HTMLElement, label: string, value: string | undefined): void {
		if (!value) return;
		const row = container.createDiv({ cls: "course-command-center-detail-field" });
		row.createEl("span", { text: `${label}: `, cls: "course-command-center-detail-label" });
		row.createEl("span", { text: value });
	}

	private renderLinkedNotes(container: HTMLElement, titles: string[]): void {
		if (titles.length === 0) {
			container.createEl("span", { text: "None", cls: "course-command-center-empty" });
			return;
		}
		const list = container.createEl("ul", { cls: "course-command-center-link-list" });
		for (const title of titles) {
			const li = list.createEl("li");
			const link = li.createEl("a", { text: title, cls: "internal-link" });
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				const target = this.app.metadataCache.getFirstLinkpathDest(title, this.note.path);
				if (target) {
					this.close();
					void this.app.workspace.getLeaf(false).openFile(target);
				}
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

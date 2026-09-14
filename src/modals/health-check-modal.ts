import { App, Modal, TFile } from "obsidian";
import type { HealthCheckResult } from "../types";

const SEVERITY_LABEL: Record<HealthCheckResult["severity"], string> = {
	"action-needed": "Action needed",
	warning: "Warning",
	info: "Info",
};

export class HealthCheckModal extends Modal {
	constructor(app: App, private results: HealthCheckResult[]) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("course-command-center-modal");
		contentEl.createEl("h2", { text: "Course health check" });

		if (this.results.length === 0) {
			contentEl.createEl("p", { text: "No issues found.", cls: "course-command-center-empty" });
			return;
		}

		contentEl.createEl("p", { text: `${this.results.length} result(s).` });

		const list = contentEl.createEl("div", { cls: "course-command-center-health-list" });
		for (const result of this.results) {
			const row = list.createDiv({ cls: `course-command-center-health-row course-command-center-severity-${result.severity}` });
			row.createEl("span", { text: SEVERITY_LABEL[result.severity], cls: "course-command-center-severity-badge" });
			const link = row.createEl("a", { text: result.message, cls: "course-command-center-health-message" });
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				const file = this.app.vault.getAbstractFileByPath(result.notePath);
				if (file instanceof TFile) {
					this.close();
					void this.app.workspace.getLeaf(false).openFile(file);
				}
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

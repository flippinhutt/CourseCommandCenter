import { App, Modal, Setting } from "obsidian";
import type { CourseConfig } from "../types";

export type DashboardInsertChoice = "plain" | "tasks" | "dataview" | "tasks-dataview";

interface ChoiceOption {
	id: DashboardInsertChoice;
	label: string;
}

/** Presents the insertion-format choice. Only offers Tasks/Dataview options
 * when those plugins are actually installed; nothing is inserted until the
 * user picks an option. */
export class DashboardInsertModal extends Modal {
	constructor(
		app: App,
		private tasksInstalled: boolean,
		private dataviewInstalled: boolean,
		private onChoose: (choice: DashboardInsertChoice) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("course-command-center-modal");
		contentEl.createEl("h2", { text: "Insert Course Command Center block" });

		const options: ChoiceOption[] = [{ id: "plain", label: "Plain Markdown only" }];
		if (this.tasksInstalled) options.push({ id: "tasks", label: "Tasks blocks" });
		if (this.dataviewInstalled) options.push({ id: "dataview", label: "Dataview blocks" });
		if (this.tasksInstalled && this.dataviewInstalled) options.push({ id: "tasks-dataview", label: "Tasks + Dataview blocks" });

		for (const option of options) {
			new Setting(contentEl).setName(option.label).addButton((button) =>
				button.setButtonText("Insert").onClick(() => {
					this.close();
					this.onChoose(option.id);
				})
			);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function buildDashboardBlock(courses: CourseConfig[], choice: DashboardInsertChoice): string {
	const lines: string[] = ["<!-- course-command-center:start -->", "### Course Command Center", ""];

	for (const course of courses.filter((c) => c.active)) {
		lines.push(`- [[${course.rootFolder}/${course.rootFolder.replace(/^\d+\s*-\s*/, "")}|${course.displayName}]] (${course.code}, ${course.delivery})`);
	}
	lines.push("");

	if (choice === "tasks" || choice === "tasks-dataview") {
		lines.push("#### Open tasks (Tasks plugin)", "```tasks", "not done", "```", "");
	}
	if (choice === "dataview" || choice === "tasks-dataview") {
		lines.push(
			"#### Upcoming assignments (Dataview)",
			"```dataview",
			'table due, status from "" where type = "assignment" and status != "complete" sort due asc',
			"```",
			""
		);
	}

	lines.push("<!-- course-command-center:end -->");
	return lines.join("\n");
}

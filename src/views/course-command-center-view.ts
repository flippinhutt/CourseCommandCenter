import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type CourseCommandCenterPlugin from "../../main";
import { CSS_PREFIX, PLUGIN_VIEW_TYPE } from "../constants";
import type { CourseConfig, IndexedNote } from "../types";
import { activeCourses, deriveQuickActions } from "../services/course-service";
import { compareDueDates, dueState, formatHumanDate, parseLocalDate } from "../utils/dates";
import { CreateNoteModal } from "../modals/create-note-modal";
import { AssignmentDetailModal } from "../modals/assignment-detail-modal";
import { runHealthCheck } from "../services/health-check-service";
import { HealthCheckModal } from "../modals/health-check-modal";

const ALL_COURSES = "__all__";

const CURRENT_WORK_TYPES: string[] = ["assignment", "project-deliverable", "module", "sql-lab", "discussion", "lecture"];
const ACTIVE_STATUSES = new Set(["not-started", "in-progress", "blocked", "reviewing"]);

export class CourseCommandCenterView extends ItemView {
	private selectedCourseId: string = ALL_COURSES;
	private collapsed = new Set<string>();
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: CourseCommandCenterPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return PLUGIN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Course Command Center";
	}

	getIcon(): string {
		return "graduation-cap";
	}

	async onOpen(): Promise<void> {
		this.unsubscribe = this.plugin.noteIndex.onChange(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
	}

	private notes(): IndexedNote[] {
		return this.plugin.noteIndex.getNotes();
	}

	private currentCourses(): CourseConfig[] {
		return activeCourses(this.plugin.settings.courses);
	}

	private notesForSelection(): IndexedNote[] {
		const notes = this.notes();
		if (this.selectedCourseId === ALL_COURSES) return notes;
		return notes.filter((n) => n.courseId === this.selectedCourseId);
	}

	render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass(CSS_PREFIX);

		this.renderHeader(container);
		this.renderSummary(container);
		this.renderQuickActions(container);
		this.renderSection(container, "do-next", "Do next", this.buildDoNext());
		this.renderSection(container, "current-work", "Current work", this.buildCurrentWork());
		this.renderSection(container, "upcoming", "Upcoming deadlines", this.buildUpcoming());
		this.renderSection(container, "recent", "Recently created", this.buildRecent());
		this.renderSection(container, "feedback", "Feedback to process", this.buildFeedback());
		this.renderArtifactsSection(container);
	}

	private renderHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: `${CSS_PREFIX}-header` });

		const select = header.createEl("select", { cls: `${CSS_PREFIX}-course-select`, attr: { "aria-label": "Select course" } });
		select.createEl("option", { text: "All courses", value: ALL_COURSES });
		for (const course of this.currentCourses()) {
			select.createEl("option", { text: course.displayName, value: course.id });
		}
		select.value = this.selectedCourseId;
		select.addEventListener("change", () => {
			this.selectedCourseId = select.value;
			this.render();
		});

		const buttons = header.createDiv({ cls: `${CSS_PREFIX}-header-buttons` });
		const refreshBtn = buttons.createEl("button", { text: "Refresh", attr: { "aria-label": "Refresh Course Command Center" } });
		refreshBtn.addEventListener("click", () => this.plugin.noteIndex.rebuildNow());

		const healthBtn = buttons.createEl("button", { text: "Run course health check", attr: { "aria-label": "Run course health check" } });
		healthBtn.addEventListener("click", () => void this.runHealthCheck());
	}

	private async runHealthCheck(): Promise<void> {
		const results = await runHealthCheck(
			this.app,
			this.notes(),
			this.currentCourses(),
			this.plugin.settings.upcomingDeadlineWindowDays,
			this.plugin.settings.staleLectureWindowDays
		);
		new HealthCheckModal(this.app, results).open();
	}

	private renderSummary(container: HTMLElement): void {
		const summary = container.createDiv({ cls: `${CSS_PREFIX}-summary` });
		const notes = this.notesForSelection();
		const windowDays = this.plugin.settings.upcomingDeadlineWindowDays;

		const overdue = notes.filter((n) => dueState(n.props.due, windowDays) === "overdue").length;
		const dueSoon = notes.filter((n) => {
			const state = dueState(n.props.due, windowDays);
			return state === "today" || state === "upcoming";
		}).length;
		const activeAssignments = notes.filter(
			(n) => (n.props.type === "assignment" || n.props.type === "project-deliverable") && ACTIVE_STATUSES.has(n.props.status ?? "")
		).length;
		const feedbackToProcess = notes.filter((n) => n.props.type === "feedback" && n.props.status !== "complete").length;

		const selectedCourse =
			this.selectedCourseId === ALL_COURSES ? null : this.currentCourses().find((c) => c.id === this.selectedCourseId) ?? null;

		this.summaryStat(summary, "Date", formatHumanDate(new Date()));
		this.summaryStat(summary, "Course", selectedCourse ? `${selectedCourse.displayName} (${selectedCourse.delivery})` : "All courses");
		this.summaryStat(summary, "Overdue", String(overdue));
		this.summaryStat(summary, `Due in ${windowDays}d`, String(dueSoon));
		this.summaryStat(summary, "Active assignments", String(activeAssignments));
		this.summaryStat(summary, "Feedback to process", String(feedbackToProcess));
	}

	private summaryStat(container: HTMLElement, label: string, value: string): void {
		const stat = container.createDiv({ cls: `${CSS_PREFIX}-stat` });
		stat.createEl("div", { text: value, cls: `${CSS_PREFIX}-stat-value` });
		stat.createEl("div", { text: label, cls: `${CSS_PREFIX}-stat-label` });
	}

	private renderQuickActions(container: HTMLElement): void {
		if (this.selectedCourseId === ALL_COURSES) return;
		const course = this.currentCourses().find((c) => c.id === this.selectedCourseId);
		if (!course) return;
		const quickActions = deriveQuickActions(course);
		if (quickActions.length === 0) return;

		const actionsEl = container.createDiv({ cls: `${CSS_PREFIX}-quick-actions` });
		actionsEl.createEl("div", { text: "Quick actions", cls: `${CSS_PREFIX}-section-heading` });
		const buttonsEl = actionsEl.createDiv({ cls: `${CSS_PREFIX}-quick-action-buttons` });
		for (const action of quickActions) {
			const btn = buttonsEl.createEl("button", { text: action.label, attr: { "aria-label": action.label } });
			btn.addEventListener("click", () => {
				new CreateNoteModal(
					this.app,
					course,
					action,
					this.plugin.settings,
					this.plugin.getOptionalPluginStatus().templater,
					() => this.plugin.noteIndex.requestRefresh()
				).open();
			});
		}
	}

	private renderSection(container: HTMLElement, id: string, title: string, items: IndexedNote[]): void {
		const section = container.createDiv({ cls: `${CSS_PREFIX}-section` });
		const heading = section.createEl("button", {
			cls: `${CSS_PREFIX}-section-toggle`,
			attr: { "aria-expanded": String(!this.collapsed.has(id)) },
		});
		heading.setText(`${this.collapsed.has(id) ? "▸" : "▾"} ${title} (${items.length})`);
		heading.addEventListener("click", () => {
			if (this.collapsed.has(id)) this.collapsed.delete(id);
			else this.collapsed.add(id);
			this.render();
		});

		if (this.collapsed.has(id)) return;

		const body = section.createDiv({ cls: `${CSS_PREFIX}-section-body` });
		if (items.length === 0) {
			body.createEl("p", { text: "Nothing here.", cls: `${CSS_PREFIX}-empty` });
			return;
		}

		const list = body.createEl("ul");
		for (const note of items) {
			const li = list.createEl("li");
			const link = li.createEl("a", { text: this.describeNote(note), cls: "internal-link" });
			this.bindNoteClick(link, note);
		}
	}

	private bindNoteClick(link: HTMLElement, note: IndexedNote): void {
		link.addEventListener("click", (evt) => {
			evt.preventDefault();
			if (evt.shiftKey && (note.props.type === "assignment" || note.props.type === "project-deliverable")) {
				new AssignmentDetailModal(this.app, note).open();
				return;
			}
			const file = this.app.vault.getAbstractFileByPath(note.path);
			if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
		});
		link.setAttribute("title", "Click to open. Shift-click an assignment to see its detail panel.");
	}

	private describeNote(note: IndexedNote): string {
		const due = note.props.due ? ` — due ${note.props.due}` : "";
		const status = note.props.status ? ` [${note.props.status}]` : "";
		return `${note.basename}${due}${status}`;
	}

	private buildDoNext(): IndexedNote[] {
		const windowDays = this.plugin.settings.upcomingDeadlineWindowDays;
		const notes = this.notesForSelection();
		const overdue = notes.filter((n) => dueState(n.props.due, windowDays) === "overdue");
		const dueToday = notes.filter((n) => dueState(n.props.due, windowDays) === "today");
		const dueSoon = notes.filter((n) => dueState(n.props.due, windowDays) === "upcoming");
		const noDueInProgress = notes.filter((n) => !n.props.due && n.props.status === "in-progress");

		const seen = new Set<string>();
		const ordered: IndexedNote[] = [];
		for (const group of [overdue, dueToday, dueSoon, noDueInProgress]) {
			for (const note of group.sort((a, b) => compareDueDates(a.props.due, b.props.due))) {
				if (seen.has(note.path)) continue;
				seen.add(note.path);
				ordered.push(note);
			}
		}
		return ordered;
	}

	private buildCurrentWork(): IndexedNote[] {
		return this.notesForSelection().filter(
			(n) => n.props.type && CURRENT_WORK_TYPES.includes(n.props.type) && ACTIVE_STATUSES.has(n.props.status ?? "")
		);
	}

	private buildUpcoming(): IndexedNote[] {
		return this.notesForSelection()
			.filter((n) => Boolean(parseLocalDate(n.props.due)))
			.sort((a, b) => compareDueDates(a.props.due, b.props.due));
	}

	private buildRecent(): IndexedNote[] {
		return this.notesForSelection()
			.slice()
			.sort((a, b) => b.ctime - a.ctime)
			.slice(0, this.plugin.settings.recentNotesCount);
	}

	private buildFeedback(): IndexedNote[] {
		return this.notesForSelection().filter((n) => n.props.type === "feedback" && n.props.status !== "complete");
	}

	private renderArtifactsSection(container: HTMLElement): void {
		const id = "artifacts";
		const section = container.createDiv({ cls: `${CSS_PREFIX}-section` });
		const heading = section.createEl("button", { cls: `${CSS_PREFIX}-section-toggle` });
		heading.setText(`${this.collapsed.has(id) ? "▸" : "▾"} Course artifacts`);
		heading.addEventListener("click", () => {
			if (this.collapsed.has(id)) this.collapsed.delete(id);
			else this.collapsed.add(id);
			this.render();
		});
		if (this.collapsed.has(id)) return;

		const body = section.createDiv({ cls: `${CSS_PREFIX}-section-body` });
		const courses = this.selectedCourseId === ALL_COURSES ? this.currentCourses() : this.currentCourses().filter((c) => c.id === this.selectedCourseId);
		if (courses.length === 0) {
			body.createEl("p", { text: "Nothing here.", cls: `${CSS_PREFIX}-empty` });
			return;
		}

		for (const course of courses) {
			const courseEl = body.createDiv({ cls: `${CSS_PREFIX}-course-artifacts` });
			courseEl.createEl("div", { text: course.displayName, cls: `${CSS_PREFIX}-section-heading` });
			const entries = Object.entries(course.folderMap).sort(([a], [b]) => a.localeCompare(b));
			if (entries.length === 0) {
				courseEl.createEl("p", { text: "No artifact folders configured yet.", cls: `${CSS_PREFIX}-empty` });
				continue;
			}
			const links = courseEl.createEl("ul");
			for (const [type, folder] of entries) {
				const li = links.createEl("li");
				const link = li.createEl("a", { text: `${type} (${folder})`, cls: "internal-link" });
				link.addEventListener("click", (evt) => {
					evt.preventDefault();
					const abstractFile = this.app.vault.getAbstractFileByPath(folder);
					if (abstractFile) this.app.workspace.trigger("reveal-file-in-explorer" as any, abstractFile);
				});
			}
		}
	}
}

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type CourseCommandCenterPlugin from "../../main";
import { CSS_PREFIX, PLUGIN_VIEW_TYPE } from "../constants";
import type { CanvasSyncMatch, CourseConfig, IndexedNote } from "../types";
import { activeCourses, deriveQuickActions, folderForArtifact, isInPersonLike } from "../services/course-service";
import { compareDueDates, dueState, formatHumanDate, isPastDue, parseLocalDate } from "../utils/dates";
import { CreateNoteModal } from "../modals/create-note-modal";
import { AssignmentDetailModal } from "../modals/assignment-detail-modal";
import { runHealthCheck } from "../services/health-check-service";
import { HealthCheckModal } from "../modals/health-check-modal";
import { createNoteForCanvasEvent } from "../services/canvas-sync-service";

const ALL_COURSES = "__all__";

const CURRENT_WORK_TYPES: string[] = ["assignment", "project-deliverable", "module", "sql-lab", "discussion", "lecture"];
const ACTIVE_STATUSES = new Set(["not-started", "in-progress", "blocked", "reviewing"]);
/** Narrower than ACTIVE_STATUSES on purpose: a freshly created note defaults
 * to "not-started", so that alone shouldn't count as "current work" until
 * you've actually started it. "in-progress" does belong here — it also
 * shows in "Do next" when due soon, and that overlap is intentional, same
 * as every other pair of sections in this view. */
const CURRENT_WORK_STATUSES = new Set(["in-progress", "blocked", "reviewing"]);
const DONE_STATUSES = new Set(["complete", "submitted"]);

/** A row shown in a due-date-driven section: either a real vault note, or a
 * Canvas event with no note yet. "Current work"/"Recently created"/
 * "Feedback to process" only ever contain "note" items — Canvas-only items
 * have no type/status until a note is created for them, which is exactly
 * what clicking one does. */
type DisplayItem = { kind: "note"; note: IndexedNote } | { kind: "canvas"; match: CanvasSyncMatch };

function noteItem(note: IndexedNote): { kind: "note"; note: IndexedNote } {
	return { kind: "note", note };
}

function itemDue(item: DisplayItem): string | undefined {
	return item.kind === "note" ? item.note.props.due : (item.match.event.due ?? undefined);
}

function itemKey(item: DisplayItem): string {
	return item.kind === "note" ? item.note.path : `canvas:${item.match.event.uid}`;
}

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

	/** Canvas events with no matching vault note yet, for the current course
	 * selection. Re-derived from the plugin's persisted Canvas data every
	 * render — no separate fetch, so this stays correct across a plain
	 * Refresh and reflects notes created since the last sync. */
	private canvasItemsForSelection(): CanvasSyncMatch[] {
		const unmatched = this.plugin.getCurrentCanvasMatches().filter((m) => !m.matchedNote);
		if (this.selectedCourseId === ALL_COURSES) return unmatched;
		return unmatched.filter((m) => m.matchedCourse?.id === this.selectedCourseId);
	}

	render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass(CSS_PREFIX);

		this.renderHeader(container);
		this.renderSummary(container);
		this.renderQuickActions(container);
		this.renderSection(container, "due-today", "Due today", this.buildDueToday());
		this.renderSection(container, "do-next", "Do next", this.buildDoNext());
		this.renderSection(container, "current-work", "Current work", this.buildCurrentWork());
		this.renderSection(container, "upcoming", "Upcoming deadlines", this.buildUpcoming());
		this.renderSection(container, "recent", "Recently created", this.buildRecent());
		this.renderSection(container, "feedback", "Feedback to process", this.buildFeedback());
		this.renderSection(container, "past-due", "Past due", this.buildPastDue());
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
		refreshBtn.addEventListener("click", () => {
			this.plugin.noteIndex.rebuildNow();
			void this.plugin.updateDashboardFileIfConfigured();
		});

		const healthBtn = buttons.createEl("button", { text: "Run course health check", attr: { "aria-label": "Run course health check" } });
		healthBtn.addEventListener("click", () => void this.runHealthCheck());

		if (this.plugin.settings.canvasIcsUrl.trim()) {
			const syncBtn = buttons.createEl("button", { text: "Sync Canvas calendar", attr: { "aria-label": "Sync Canvas calendar" } });
			syncBtn.addEventListener("click", () => this.plugin.syncCanvasCalendar());
		}
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
		const dueDates = [...notes.map((n) => n.props.due), ...this.canvasItemsForSelection().map((m) => m.event.due ?? undefined)];

		const overdue = dueDates.filter((due) => dueState(due, windowDays) === "overdue").length;
		const dueSoon = dueDates.filter((due) => {
			const state = dueState(due, windowDays);
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

	private renderSection(container: HTMLElement, id: string, title: string, items: DisplayItem[]): void {
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
		for (const item of items) {
			const li = list.createEl("li");
			if (item.kind === "note") {
				const checkbox = li.createEl("input", {
					type: "checkbox",
					cls: `${CSS_PREFIX}-complete-checkbox`,
					attr: { "aria-label": `Mark "${item.note.basename}" complete`, title: "Mark complete" },
				});
				checkbox.addEventListener("click", (evt) => {
					evt.stopPropagation();
					void this.markNoteComplete(item.note);
				});
			} else {
				const uid = item.match.event.uid;
				const checkbox = li.createEl("input", {
					type: "checkbox",
					cls: `${CSS_PREFIX}-complete-checkbox`,
					attr: {
						"aria-label": `Check off "${item.match.event.title}" (no note)`,
						title: "Check off — no note will be created",
					},
				});
				checkbox.addEventListener("click", (evt) => {
					evt.stopPropagation();
					void this.markCanvasEventComplete(uid);
				});
			}
			const link = li.createEl("a", { text: this.describeItem(item), cls: "internal-link" });
			this.bindItemClick(link, item);
			if (item.kind === "canvas" && item.match.event.url) {
				const canvasUrl = item.match.event.url;
				const canvasLink = li.createEl("a", { text: " (Canvas)", cls: `${CSS_PREFIX}-canvas-tag` });
				canvasLink.addEventListener("click", (evt) => {
					evt.preventDefault();
					window.open(canvasUrl, "_blank");
				});
			}
		}
	}

	private describeItem(item: DisplayItem): string {
		if (item.kind === "note") return this.describeNote(item.note);
		const course = item.match.matchedCourse ? ` (${item.match.matchedCourse.displayName})` : "";
		return `${item.match.event.title} — due ${item.match.event.due}${course} [Canvas, click to create note]`;
	}

	private bindItemClick(link: HTMLElement, item: DisplayItem): void {
		if (item.kind === "note") {
			this.bindNoteClick(link, item.note);
			return;
		}
		link.addEventListener("click", (evt) => {
			evt.preventDefault();
			void this.createNoteForCanvasItem(item.match);
		});
		link.setAttribute("title", "Click to create a note for this Canvas item.");
	}

	private async createNoteForCanvasItem(match: CanvasSyncMatch): Promise<void> {
		if (!match.matchedCourse) return;
		try {
			const folder = folderForArtifact(match.matchedCourse, "assignment");
			const file = await createNoteForCanvasEvent(
				this.app,
				match,
				folder,
				this.plugin.settings.templatesFolder,
				this.plugin.getOptionalPluginStatus().templater,
				isInPersonLike(match.matchedCourse)
			);
			this.plugin.noteIndex.rebuildNow();
			void this.plugin.updateDashboardFileIfConfigured();
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (error) {
			console.error("Course Command Center: failed to create note from the view", error);
		}
	}

	/** Marks a note complete directly from the view — the in-app counterpart
	 * to checking a box in the dashboard file. rebuildNow() re-renders this
	 * view via the noteIndex.onChange subscription in onOpen, so the item
	 * drops out of whatever due-date/status-filtered section it was in
	 * without any extra render call here. */
	private async markNoteComplete(note: IndexedNote): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(note.path);
		if (!(file instanceof TFile)) return;
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm.status = "complete";
			});
			this.plugin.noteIndex.rebuildNow();
			void this.plugin.updateDashboardFileIfConfigured();
		} catch (error) {
			console.error("Course Command Center: failed to mark note complete from the view", error);
		}
	}

	/** Checks off an unmatched Canvas event that has no note — the todo-list
	 * completion for something you did without ever creating a note for it.
	 * Settings changes don't go through noteIndex.onChange, so this calls
	 * render() itself (unlike markNoteComplete, which relies on rebuildNow's
	 * listener). */
	private async markCanvasEventComplete(uid: string): Promise<void> {
		await this.plugin.markCanvasEventComplete(uid);
		this.render();
	}

	private bindNoteClick(link: HTMLElement, note: IndexedNote): void {
		link.addEventListener("click", (evt) => {
			evt.preventDefault();
			if (evt.shiftKey && (note.props.type === "assignment" || note.props.type === "project-deliverable")) {
				new AssignmentDetailModal(this.app, note, () => {
					this.plugin.noteIndex.rebuildNow();
					void this.plugin.updateDashboardFileIfConfigured();
				}).open();
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

	/** Items due exactly today — its own section, and also folded into "Do
	 * next" below so that list stays a complete near-term picture rather
	 * than excluding today's items just because they have their own home
	 * now. dueState's window argument only affects the "upcoming" boundary,
	 * not "today", so 0 here is just "don't bother with a window". */
	private buildDueToday(): DisplayItem[] {
		const noteItems: DisplayItem[] = this.notesForSelection()
			.filter((n) => !DONE_STATUSES.has(n.props.status ?? ""))
			.map(noteItem);
		const canvasItems: DisplayItem[] = this.canvasItemsForSelection().map((match) => ({ kind: "canvas" as const, match }));
		return [...noteItems, ...canvasItems]
			.filter((i) => dueState(itemDue(i), 0) === "today")
			.sort((a, b) => compareDueDates(itemDue(a), itemDue(b)));
	}

	private buildDoNext(): DisplayItem[] {
		const windowDays = this.plugin.settings.doNextWindowDays;
		const noteItems = this.notesForSelection()
			.filter((n) => !DONE_STATUSES.has(n.props.status ?? ""))
			.map(noteItem);
		const canvasItems: DisplayItem[] = this.canvasItemsForSelection().map((match) => ({ kind: "canvas", match }));
		// Past due is excluded, not just deprioritized — this is a forward
		// planning list. A note due today still counts (isPastDue is
		// strictly-before-today); genuinely overdue work has its own "Past
		// due" section below, kept separate so this list stays about what's
		// still coming up.
		const dated = [...noteItems, ...canvasItems].filter((i) => !isPastDue(itemDue(i)));

		const dueToday = this.buildDueToday();
		const dueSoon = dated.filter((i) => dueState(itemDue(i), windowDays) === "upcoming");
		// Same type restriction as "Current work" on purpose: without it, any
		// note anywhere in the vault with status "in-progress" and no due date
		// — a reference/background note included — would sit in "Do next"
		// forever, since there's no due date to ever age it out.
		const noDueInProgress = noteItems.filter(
			(i) => !i.note.props.due && i.note.props.status === "in-progress" && i.note.props.type && CURRENT_WORK_TYPES.includes(i.note.props.type)
		);

		const seen = new Set<string>();
		const ordered: DisplayItem[] = [];
		for (const group of [dueToday, dueSoon, noDueInProgress]) {
			for (const item of group.sort((a, b) => compareDueDates(itemDue(a), itemDue(b)))) {
				const key = itemKey(item);
				if (seen.has(key)) continue;
				seen.add(key);
				ordered.push(item);
			}
		}
		return ordered;
	}

	/** Overdue notes and Canvas events, oldest (most overdue) first. Kept out
	 * of every forward-planning section above; this is where they can still
	 * be checked off instead of just sitting there unresolved. */
	private buildPastDue(): DisplayItem[] {
		const noteItems: DisplayItem[] = this.notesForSelection()
			.filter((n) => isPastDue(n.props.due) && !DONE_STATUSES.has(n.props.status ?? ""))
			.map(noteItem);
		const canvasItems: DisplayItem[] = this.canvasItemsForSelection()
			.filter((m) => isPastDue(m.event.due ?? undefined))
			.map((match) => ({ kind: "canvas" as const, match }));
		return [...noteItems, ...canvasItems].sort((a, b) => compareDueDates(itemDue(a), itemDue(b)));
	}

	private buildCurrentWork(): DisplayItem[] {
		return this.notesForSelection()
			.filter((n) => n.props.type && CURRENT_WORK_TYPES.includes(n.props.type) && CURRENT_WORK_STATUSES.has(n.props.status ?? ""))
			.map(noteItem);
	}

	private buildUpcoming(): DisplayItem[] {
		const windowDays = this.plugin.settings.upcomingDeadlineWindowDays;
		const noteItems: DisplayItem[] = this.notesForSelection()
			.filter((n) => Boolean(parseLocalDate(n.props.due)) && !isPastDue(n.props.due) && !DONE_STATUSES.has(n.props.status ?? ""))
			.map(noteItem);
		const canvasItems: DisplayItem[] = this.canvasItemsForSelection()
			.filter((m) => !isPastDue(m.event.due ?? undefined))
			.map((match) => ({ kind: "canvas" as const, match }));
		return [...noteItems, ...canvasItems]
			.filter((i) => dueState(itemDue(i), windowDays) !== "later")
			.sort((a, b) => compareDueDates(itemDue(a), itemDue(b)));
	}

	private buildRecent(): DisplayItem[] {
		return this.notesForSelection()
			.slice()
			.sort((a, b) => b.ctime - a.ctime)
			.slice(0, this.plugin.settings.recentNotesCount)
			.map(noteItem);
	}

	private buildFeedback(): DisplayItem[] {
		return this.notesForSelection()
			.filter((n) => n.props.type === "feedback" && n.props.status !== "complete")
			.map(noteItem);
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

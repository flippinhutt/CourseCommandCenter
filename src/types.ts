export type Delivery = "online" | "in-person" | "hybrid";

/** Artifact types the plugin recognizes with a hand-written fallback
 * template and (for some) a dedicated health-check rule. This is a
 * curated list of suggestions, not a constraint: a note's `type` and a
 * course's folder-map keys are plain strings, so anyone can use a type
 * name that isn't in this list — it just gets a generic fallback
 * template and no dedicated health-check rule instead of a tailored one. */
export type ArtifactType =
	| "course-hub"
	| "module"
	| "announcement"
	| "assignment"
	| "discussion"
	| "lecture"
	| "reading"
	| "study-guide"
	| "feedback"
	| "wireframe"
	| "interface-spec"
	| "critique"
	| "erd"
	| "database-design"
	| "data-dictionary"
	| "normalization"
	| "requirement"
	| "use-case"
	| "stakeholder"
	| "process-model"
	| "diagram"
	| "project-deliverable"
	| "quiz"
	| "sql-lab"
	| "sql-pattern"
	| "ddl"
	| "query-error"
	| "reference"
	| "weekly-review"
	| "daily-note";

export type NoteStatus =
	| "not-started"
	| "in-progress"
	| "blocked"
	| "reviewing"
	| "submitted"
	| "complete";

export type Priority = "low" | "medium" | "high";

/** A single quick-action button/command offered for a course. There is no
 * per-course quick-action list to configure separately: one of these is
 * derived automatically for every entry in a course's folderMap, so adding
 * a folder mapping for a new type is all it takes to get a "Create <type>"
 * action for it. */
export interface QuickAction {
	id: string;
	label: string;
	artifactType: string;
}

export interface CourseConfig {
	id: string;
	code: string;
	displayName: string;
	delivery: Delivery;
	rootFolder: string;
	meetingDays: string;
	meetingTime: string;
	location: string;
	canvasUrl: string;
	active: boolean;
	/** Maps an artifact type name (free text; ArtifactType's members are
	 * just suggestions) to a vault-relative folder for this course. */
	folderMap: Record<string, string>;
}

export interface PluginSettings {
	courses: CourseConfig[];
	templatesFolder: string;
	dailyNoteFolder: string;
	weeklyReviewFolder: string;
	inboxPath: string;
	openAtStartup: boolean;
	scanEntireVault: boolean;
	recentNotesCount: number;
	upcomingDeadlineWindowDays: number;
	includeCheckboxTasks: boolean;
	staleLectureWindowDays: number;
	/** Canvas's private per-account ICS calendar feed URL (Canvas → Calendar
	 * → Calendar Feed). Optional. This is the one deliberate exception to the
	 * plugin's no-network-calls rule: fetched only when the user explicitly
	 * runs "Sync Canvas calendar," never automatically or in the background. */
	canvasIcsUrl: string;
}

/** Parsed frontmatter properties the plugin cares about; all optional. */
export interface NoteProperties {
	course?: string;
	delivery?: Delivery;
	/** Free text; ArtifactType's members are recognized suggestions, not a
	 * closed set. */
	type?: string;
	status?: NoteStatus;
	due?: string;
	opens?: string;
	module?: string;
	priority?: Priority;
	created?: string;
	id?: string;
	points_possible?: number;
	points_earned?: number;
	grade?: string;
}

export interface IndexedNote {
	path: string;
	basename: string;
	ctime: number;
	mtime: number;
	props: NoteProperties;
	courseId: string | null;
}

export type Severity = "info" | "warning" | "action-needed";

export interface HealthCheckResult {
	severity: Severity;
	message: string;
	notePath: string;
}

export interface RubricRow {
	criterion: string;
	requirement: string;
	evidenceRaw: string;
	evidenceLinks: string[];
	complete: boolean;
	missingEvidence: boolean;
}

export interface RubricTable {
	heading: string;
	rows: RubricRow[];
}

/** A single event parsed from a Canvas ICS calendar feed. */
export interface IcsEvent {
	uid: string;
	/** Event title with any trailing "[Course Code]" bracket stripped. */
	title: string;
	/** Local calendar date (YYYY-MM-DD), or null if unparseable. */
	due: string | null;
	/** The bracketed course-code-like text found in the raw title, if any
	 * (Canvas's feed suffixes each event's title with its course). */
	courseCodeHint: string | null;
	url: string | null;
}

/** One Canvas ICS event matched against configured courses and existing
 * vault notes. */
export interface CanvasSyncMatch {
	event: IcsEvent;
	matchedCourse: CourseConfig | null;
	matchedNote: IndexedNote | null;
}

export const OPTIONAL_PLUGIN_IDS = {
	tasks: "obsidian-tasks-plugin",
	dataview: "dataview",
	templater: "templater-obsidian",
	excalidraw: "obsidian-excalidraw-plugin",
	linter: "obsidian-linter",
	quickadd: "quickadd",
	git: "obsidian-git",
} as const;

export type OptionalPluginKey = keyof typeof OPTIONAL_PLUGIN_IDS;

export type OptionalPluginStatus = Record<OptionalPluginKey, boolean>;

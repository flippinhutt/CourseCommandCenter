import { type App, TFile, normalizePath } from "obsidian";
import type { ArtifactType, CourseConfig, NoteStatus } from "../types";
import { notePathFor } from "../utils/paths";
import { yamlScalar } from "../utils/frontmatter";
import { formatIsoDate } from "../utils/dates";
import { FALLBACK_TEMPLATES, GENERIC_FALLBACK_TEMPLATE } from "./fallback-templates";

export class NoteAlreadyExistsError extends Error {
	constructor(public path: string) {
		super(`A note already exists at "${path}".`);
	}
}

/** Maps an artifact type (and, for lecture notes, delivery) to a real
 * template file name expected under the templates folder, when one is
 * likely to exist. Returns null when no matching built-in template file
 * convention applies; callers must still check the file actually exists
 * before using it. */
function candidateTemplateFileName(artifactType: string, isInPersonLike: boolean): string | null {
	switch (artifactType) {
		case "assignment":
			return "Assignment Template.md";
		case "database-design":
			return "Database Design Packet Template.md";
		case "lecture":
			return isInPersonLike ? "In-Person Lecture Template.md" : "Lecture Template.md";
		case "interface-spec":
			return "Interface Screen Specification Template.md";
		case "discussion":
			return "Online Discussion Template.md";
		case "module":
			return "Online Module Template.md";
		case "query-error":
			return "Query Error Template.md";
		case "requirement":
			return "Requirement Template.md";
		case "sql-lab":
			return "SQL Lab Template.md";
		default:
			return null;
	}
}

function stripFrontmatter(content: string): string {
	if (!content.startsWith("---")) return content;
	const end = content.indexOf("\n---", 3);
	if (end === -1) return content;
	const afterFence = content.indexOf("\n", end + 1);
	return afterFence === -1 ? "" : content.slice(afterFence + 1);
}

/** Naive placeholder substitution used only when Templater is NOT installed,
 * so a template file's {{title}}/{{date:...}} tokens don't leak into the
 * created note verbatim. When Templater is installed we leave these tokens
 * intact for Templater to process instead. */
function substitutePlaceholders(body: string, title: string): string {
	const today = formatIsoDate(new Date());
	return body
		.replace(/\{\{\s*title\s*\}\}/gi, title)
		.replace(/\{\{\s*date(:[^}]*)?\s*\}\}/gi, today);
}

function buildFrontmatter(fields: {
	course: string;
	delivery: string;
	type: string;
	status: NoteStatus;
	created: string;
	due?: string;
	module?: string;
	id?: string;
}): string {
	const lines = [
		"---",
		`course: ${yamlScalar(fields.course)}`,
		`delivery: ${yamlScalar(fields.delivery)}`,
		`type: ${yamlScalar(fields.type)}`,
		`status: ${yamlScalar(fields.status)}`,
		`created: ${fields.created}`,
	];
	if (fields.due) lines.push(`due: ${fields.due}`);
	if (fields.module) lines.push(`module: ${yamlScalar(fields.module)}`);
	if (fields.id) lines.push(`id: ${yamlScalar(fields.id)}`);
	lines.push("---", "");
	return lines.join("\n");
}

export interface CreateNoteParams {
	folder: string;
	title: string;
	course: CourseConfig;
	artifactType: string;
	due?: string;
	/** Stable external id (e.g. a Canvas calendar UID) to stamp into
	 * frontmatter so a later sync can re-match this note reliably. */
	id?: string;
	templatesFolder: string;
	templaterInstalled: boolean;
	isInPersonLike: boolean;
}

/** Attempts a best-effort, documented-API-only Templater trigger. Never
 * throws; leaves the file's content untouched if the API isn't available. */
interface AppWithPlugins extends App {
	plugins?: {
		plugins?: Record<string, { templater?: { overwrite_file_templates?: (file: TFile) => Promise<void> } }>;
	};
}

async function tryTriggerTemplater(app: App, file: TFile): Promise<void> {
	try {
		const templaterPlugin = (app as AppWithPlugins).plugins?.plugins?.["templater-obsidian"];
		const templater = templaterPlugin?.templater;
		if (templater && typeof templater.overwrite_file_templates === "function") {
			await templater.overwrite_file_templates(file);
		}
	} catch {
		// Templater's internal API is undocumented and may change; failing
		// silently here just leaves the created note's placeholders intact.
	}
}

interface ResolvedNoteContent {
	content: string;
	usedTemplateFile: boolean;
}

/** Figures out what a note's content should be — template file if one
 * matches and exists, else a fallback body — plus regenerated frontmatter.
 * Pure computation, no vault writes; callers decide whether to vault.create
 * a new file or vault.modify one Obsidian already created (e.g. a blank
 * note from clicking an unresolved wikilink). */
async function resolveNoteContent(app: App, params: CreateNoteParams): Promise<ResolvedNoteContent> {
	let body: string;
	let usedTemplateFile = false;

	const candidateName = candidateTemplateFileName(params.artifactType, params.isInPersonLike);
	if (candidateName) {
		const templatePath = normalizePath(`${params.templatesFolder}/${candidateName}`);
		const templateFile = app.vault.getAbstractFileByPath(templatePath);
		if (templateFile instanceof TFile) {
			const raw = await app.vault.cachedRead(templateFile);
			const rawBody = stripFrontmatter(raw);
			body = params.templaterInstalled ? rawBody : substitutePlaceholders(rawBody, params.title);
			usedTemplateFile = true;
		} else {
			body = buildFallbackBody(params.artifactType, params.title);
		}
	} else {
		body = buildFallbackBody(params.artifactType, params.title);
	}

	const frontmatter = buildFrontmatter({
		course: params.course.code,
		delivery: params.course.delivery,
		type: params.artifactType,
		status: "not-started",
		created: formatIsoDate(new Date()),
		due: params.due,
		id: params.id,
	});

	return { content: frontmatter + body, usedTemplateFile };
}

export async function createNoteFromTemplate(app: App, params: CreateNoteParams): Promise<TFile> {
	const path = normalizePath(notePathFor(params.folder, params.title));
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing) throw new NoteAlreadyExistsError(path);

	const { content, usedTemplateFile } = await resolveNoteContent(app, params);
	const file = await app.vault.create(path, content);

	if (usedTemplateFile && params.templaterInstalled) {
		await tryTriggerTemplater(app, file);
	}

	return file;
}

/** Populates an already-existing file (typically the blank note Obsidian
 * just created because the user clicked an unresolved wikilink) with the
 * same template resolution + frontmatter that createNoteFromTemplate would
 * use for a brand-new note. Overwrites whatever's there — callers are
 * expected to have already confirmed the file is safe to overwrite (e.g.
 * freshly auto-created and still essentially empty). */
export async function populateExistingNote(app: App, file: TFile, params: CreateNoteParams): Promise<void> {
	const { content, usedTemplateFile } = await resolveNoteContent(app, params);
	await app.vault.modify(file, content);

	if (usedTemplateFile && params.templaterInstalled) {
		await tryTriggerTemplater(app, file);
	}
}

function buildFallbackBody(artifactType: string, title: string): string {
	const builder = FALLBACK_TEMPLATES[artifactType as ArtifactType];
	return builder ? builder(title) : GENERIC_FALLBACK_TEMPLATE(title);
}

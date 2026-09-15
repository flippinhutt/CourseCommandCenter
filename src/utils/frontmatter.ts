import type { NoteProperties } from "../types";

/** Extracts the properties this plugin understands from a raw frontmatter
 * object (as returned by Obsidian's metadata cache). Tolerates missing and
 * unknown extra fields. */
export function readNoteProperties(raw: Record<string, unknown> | undefined | null): NoteProperties {
	if (!raw) return {};
	const props: NoteProperties = {};
	if (typeof raw.course === "string") props.course = raw.course;
	if (typeof raw.delivery === "string") props.delivery = raw.delivery as NoteProperties["delivery"];
	if (typeof raw.type === "string") props.type = raw.type;
	if (typeof raw.status === "string") props.status = raw.status as NoteProperties["status"];
	if (raw.due != null) props.due = stringifyDateLike(raw.due);
	if (raw.opens != null) props.opens = stringifyDateLike(raw.opens);
	if (typeof raw.module === "string") props.module = raw.module;
	if (typeof raw.priority === "string") props.priority = raw.priority as NoteProperties["priority"];
	if (raw.created != null) props.created = stringifyDateLike(raw.created);
	if (typeof raw.id === "string") props.id = raw.id;
	if (typeof raw.points_possible === "number") props.points_possible = raw.points_possible;
	if (typeof raw.points_earned === "number") props.points_earned = raw.points_earned;
	if (typeof raw.grade === "string") props.grade = raw.grade;
	return props;
}

/** Obsidian date-typed Properties surface as strings already in most vaults,
 * but tolerate Date objects too. */
function stringifyDateLike(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (value instanceof Date) {
		const y = value.getFullYear().toString().padStart(4, "0");
		const m = (value.getMonth() + 1).toString().padStart(2, "0");
		const d = value.getDate().toString().padStart(2, "0");
		return `${y}-${m}-${d}`;
	}
	return undefined;
}

/** YAML-safe-quotes a scalar value for use in generated frontmatter. */
export function yamlScalar(value: string): string {
	if (value === "") return '""';
	const needsQuoting = /[:#\-?"'[\]{}>|*&!%@`\n]/.test(value) || /^\s|\s$/.test(value);
	if (!needsQuoting) return value;
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

import type { CourseConfig, QuickAction } from "../types";

/** Normalizes a course code for comparison: uppercase, collapse whitespace. */
function normalizeCode(code: string): string {
	return code.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Matches a raw `course` frontmatter value against configured courses by
 * course code, tolerating extra descriptive text such as
 * "ITSE 2309 — Database Programming SQL". Returns null if no course matches. */
export function matchCourseByCode(rawValue: string | undefined, courses: CourseConfig[]): CourseConfig | null {
	if (!rawValue) return null;
	const normalizedValue = normalizeCode(rawValue);
	for (const course of courses) {
		const normalizedCode = normalizeCode(course.code);
		if (normalizedValue === normalizedCode || normalizedValue.startsWith(normalizedCode + " ") || normalizedValue.includes(normalizedCode)) {
			return course;
		}
	}
	return null;
}

export function getCourseById(id: string, courses: CourseConfig[]): CourseConfig | null {
	return courses.find((c) => c.id === id) ?? null;
}

export function activeCourses(courses: CourseConfig[]): CourseConfig[] {
	return courses.filter((c) => c.active);
}

/** Whether a course should follow "in-person" behavior for quick actions and
 * health checks (in-person and hybrid courses both do, per the plugin's
 * hybrid-folds-into-in-person decision). */
export function isInPersonLike(course: CourseConfig): boolean {
	return course.delivery === "in-person" || course.delivery === "hybrid";
}

export function folderForArtifact(course: CourseConfig, artifactType: string): string {
	return course.folderMap[artifactType] ?? course.rootFolder;
}

/** Turns a kebab-case artifact type key ("sql-lab") into a human-readable
 * label ("Sql lab") for quick-action buttons and command names. */
export function humanizeType(type: string): string {
	const words = type.split(/[-_]+/).filter(Boolean);
	if (words.length === 0) return type;
	return words.map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ");
}

/** Derives a course's quick actions from its folder map: one "Create <type>"
 * action per mapped artifact type. There is no separate quick-action list to
 * configure — mapping a folder to a type is what makes it show up here. */
export function deriveQuickActions(course: CourseConfig): QuickAction[] {
	return Object.keys(course.folderMap)
		.sort()
		.map((type) => ({ id: type, label: `Create ${humanizeType(type)}`, artifactType: type }));
}

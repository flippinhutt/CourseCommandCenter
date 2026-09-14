const TASKS_DUE_EMOJI_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;

/** Extracts a Tasks-plugin-style due date emoji (📅 YYYY-MM-DD) from a line
 * of checklist text, if present. */
export function extractTasksDueDate(line: string): string | null {
	const match = TASKS_DUE_EMOJI_RE.exec(line);
	return match ? match[1] : null;
}

export interface TaskLine {
	text: string;
	checked: boolean;
	due: string | null;
}

const CHECKBOX_RE = /^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/;

/** Extracts all checklist lines from Markdown body text, pairing each with
 * a Tasks-emoji due date when present (frontmatter `due` always takes
 * precedence over this at the note level; this is for in-body task lines). */
export function extractTaskLines(text: string): TaskLine[] {
	const results: TaskLine[] = [];
	for (const line of text.split(/\r?\n/)) {
		const match = CHECKBOX_RE.exec(line);
		if (!match) continue;
		results.push({
			checked: match[1].toLowerCase() === "x",
			text: match[2].trim(),
			due: extractTasksDueDate(match[2]),
		});
	}
	return results;
}

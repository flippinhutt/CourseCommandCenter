import type { RubricRow, RubricTable } from "../types";

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

export function extractWikilinks(text: string): string[] {
	const links: string[] = [];
	let match: RegExpExecArray | null;
	WIKILINK_RE.lastIndex = 0;
	while ((match = WIKILINK_RE.exec(text)) !== null) {
		links.push(match[1].trim());
	}
	return links;
}

const CHECKBOX_RE = /^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/;

export interface ChecklistItem {
	text: string;
	checked: boolean;
}

export function extractChecklistItems(text: string): ChecklistItem[] {
	const items: ChecklistItem[] = [];
	for (const line of text.split(/\r?\n/)) {
		const match = CHECKBOX_RE.exec(line);
		if (match) {
			items.push({ checked: match[1].toLowerCase() === "x", text: match[2].trim() });
		}
	}
	return items;
}

export function hasFencedCodeBlock(text: string, language: string): boolean {
	const re = new RegExp("```\\s*" + language + "\\b", "i");
	return re.test(text);
}

const RUBRIC_HEADING_RE = /^##\s+(Rubric checklist|Rubric)\s*$/im;

/** Parses a Markdown table of the shape:
 * | Criterion | Requirement | Evidence in my work | Complete |
 * found under a "## Rubric" or "## Rubric checklist" heading. Returns null
 * if no such heading/table is present. Never mutates the source text. */
export function parseRubricTable(text: string): RubricTable | null {
	const headingMatch = RUBRIC_HEADING_RE.exec(text);
	if (!headingMatch) return null;

	const afterHeading = text.slice(headingMatch.index + headingMatch[0].length);
	const lines = afterHeading.split(/\r?\n/);

	const tableLines: string[] = [];
	let started = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!started) {
			if (trimmed.startsWith("|")) {
				started = true;
				tableLines.push(trimmed);
			} else if (trimmed === "") {
				continue;
			} else {
				break;
			}
		} else {
			if (trimmed.startsWith("|")) {
				tableLines.push(trimmed);
			} else {
				break;
			}
		}
	}

	if (tableLines.length < 2) return { heading: headingMatch[1], rows: [] };

	const dataLines = tableLines.slice(2); // skip header row + separator row
	const rows: RubricRow[] = dataLines.map((line) => {
		const cells = splitTableRow(line);
		const criterion = cells[0] ?? "";
		const requirement = cells[1] ?? "";
		const evidenceRaw = cells[2] ?? "";
		const completeCell = (cells[3] ?? "").trim();
		const evidenceLinks = extractWikilinks(evidenceRaw);
		const missingEvidence = evidenceRaw.trim().length === 0;
		const complete = /^(x|✅|\[x\])$/i.test(completeCell) || completeCell === "☑" || completeCell === "✔";
		return { criterion, requirement, evidenceRaw, evidenceLinks, complete, missingEvidence };
	});

	return { heading: headingMatch[1], rows: rows.filter((r) => r.criterion.trim().length > 0) };
}

function splitTableRow(line: string): string[] {
	const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
	return trimmed.split("|").map((cell) => cell.trim());
}

export function summarizeRubric(table: RubricTable): string {
	const total = table.rows.length;
	const complete = table.rows.filter((r) => r.complete).length;
	const missingEvidence = table.rows.filter((r) => r.missingEvidence).length;
	if (total === 0) return "No rubric rows found.";
	return `${complete}/${total} rubric criteria marked complete; ${missingEvidence} criteria missing evidence`;
}

import type { IcsEvent } from "../types";
import { formatIsoDate } from "./dates";

/** Un-folds RFC 5545 line folding: a continuation line starts with a single
 * space or tab and should be appended to the previous line. */
function unfoldLines(text: string): string[] {
	const rawLines = text.split(/\r\n|\n|\r/);
	const lines: string[] = [];
	for (const line of rawLines) {
		if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
			lines[lines.length - 1] += line.slice(1);
		} else {
			lines.push(line);
		}
	}
	return lines;
}

function unescapeIcsText(value: string): string {
	return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

interface IcsProperty {
	name: string;
	params: Record<string, string>;
	value: string;
}

function parsePropertyLine(line: string): IcsProperty | null {
	const colonIdx = line.indexOf(":");
	if (colonIdx === -1) return null;
	const left = line.slice(0, colonIdx);
	const value = line.slice(colonIdx + 1);
	const [name, ...paramParts] = left.split(";");
	const params: Record<string, string> = {};
	for (const part of paramParts) {
		const eq = part.indexOf("=");
		if (eq !== -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
	}
	return { name: name.trim().toUpperCase(), params, value };
}

/** Parses an ICS DTSTART/DTEND-style date or date-time value into a local
 * calendar date string (YYYY-MM-DD). A trailing Z (UTC) is converted to the
 * local calendar day; a bare date (VALUE=DATE, or 8 digits) is taken
 * literally with no timezone conversion. Returns null if unparseable. */
function parseIcsDate(value: string, params: Record<string, string>): string | null {
	const digits = value.trim();

	if (params.VALUE === "DATE" || /^\d{8}$/.test(digits)) {
		const match = /^(\d{4})(\d{2})(\d{2})$/.exec(digits);
		if (!match) return null;
		return `${match[1]}-${match[2]}-${match[3]}`;
	}

	const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(digits);
	if (!match) return null;
	const [, y, mo, d, h, mi, s, z] = match;
	const date = z
		? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)))
		: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
	return formatIsoDate(date);
}

const COURSE_HINT_RE = /\s*\[([^\]]+)\]\s*$/;

/** Splits a Canvas event title into its display text and the trailing
 * "[Course Code]" hint Canvas's feed appends, if present. */
function splitCourseHint(rawTitle: string): { title: string; courseCodeHint: string | null } {
	const match = COURSE_HINT_RE.exec(rawTitle);
	if (!match) return { title: rawTitle.trim(), courseCodeHint: null };
	return { title: rawTitle.slice(0, match.index).trim(), courseCodeHint: match[1].trim() };
}

/** Parses the VEVENT blocks of an ICS calendar feed into IcsEvents. Skips
 * any event with no UID or no parseable start date. Never mutates or
 * validates against a course list — that matching happens separately so
 * this stays a pure, independently testable parser. */
export function parseIcsEvents(icsText: string): IcsEvent[] {
	const lines = unfoldLines(icsText);
	const events: IcsEvent[] = [];

	let current: Record<string, IcsProperty> | null = null;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === "BEGIN:VEVENT") {
			current = {};
			continue;
		}
		if (trimmed === "END:VEVENT") {
			if (current) {
				const event = buildEvent(current);
				if (event) events.push(event);
			}
			current = null;
			continue;
		}
		if (!current) continue;

		const prop = parsePropertyLine(line);
		if (!prop) continue;
		current[prop.name] = prop;
	}

	return events;
}

function buildEvent(props: Record<string, IcsProperty>): IcsEvent | null {
	const uidProp = props.UID;
	const summaryProp = props.SUMMARY;
	if (!uidProp || !summaryProp) return null;

	const dateProp = props.DTSTART ?? props.DTEND ?? props.DUE;
	const due = dateProp ? parseIcsDate(dateProp.value, dateProp.params) : null;

	const rawTitle = unescapeIcsText(summaryProp.value);
	const { title, courseCodeHint } = splitCourseHint(rawTitle);

	return {
		uid: uidProp.value.trim(),
		title,
		due,
		courseCodeHint,
		url: props.URL ? props.URL.value.trim() : null,
	};
}

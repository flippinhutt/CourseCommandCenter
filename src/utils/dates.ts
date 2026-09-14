const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Parses an ISO date string (YYYY-MM-DD, optionally with a time/offset suffix
 * which is ignored) as a local calendar date. Returns null if unparseable. */
export function parseLocalDate(value: string | undefined | null): Date | null {
	if (!value) return null;
	const match = ISO_DATE_RE.exec(value.trim());
	if (!match) return null;
	const [, y, m, d] = match;
	const year = Number(y);
	const month = Number(m);
	const day = Number(d);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	return date;
}

export function todayLocal(): Date {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatIsoDate(date: Date): string {
	const y = date.getFullYear().toString().padStart(4, "0");
	const m = (date.getMonth() + 1).toString().padStart(2, "0");
	const d = date.getDate().toString().padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function formatHumanDate(date: Date): string {
	return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Whole-day difference: negative = past, 0 = today, positive = future.
 * A due date is treated as due through local end-of-day, so "overdue" means
 * strictly before today. */
export function daysFromToday(date: Date): number {
	const today = todayLocal();
	const msPerDay = 24 * 60 * 60 * 1000;
	return Math.round((date.getTime() - today.getTime()) / msPerDay);
}

export type DueState = "overdue" | "today" | "upcoming" | "later" | "none";

export function dueState(dueValue: string | undefined, windowDays: number): DueState {
	const date = parseLocalDate(dueValue);
	if (!date) return "none";
	const diff = daysFromToday(date);
	if (diff < 0) return "overdue";
	if (diff === 0) return "today";
	if (diff <= windowDays) return "upcoming";
	return "later";
}

/** True if `dueValue` parses to a date strictly before today (i.e. is
 * overdue). False for today, any future date, or an unparseable/missing
 * value — "past due" means yesterday or earlier, not today. */
export function isPastDue(dueValue: string | undefined): boolean {
	const date = parseLocalDate(dueValue);
	if (!date) return false;
	return daysFromToday(date) < 0;
}

export function compareDueDates(a: string | undefined, b: string | undefined): number {
	const dateA = parseLocalDate(a);
	const dateB = parseLocalDate(b);
	if (!dateA && !dateB) return 0;
	if (!dateA) return 1;
	if (!dateB) return -1;
	return dateA.getTime() - dateB.getTime();
}

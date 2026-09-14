import { describe, expect, it } from "vitest";
import { parseIcsEvents } from "./ics";

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Instructure//Canvas//EN
BEGIN:VEVENT
DTSTART:20260918T045900Z
DTEND:20260918T050000Z
UID:event-abc-123
SUMMARY:Homework 3 [ITSE-1350-001]
URL:https://school.instructure.com/courses/1/assignments/2
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260920
UID:event-def-456
SUMMARY:All-day Reading Quiz [ITSE 2309]
END:VEVENT
BEGIN:VEVENT
UID:event-no-summary
DTSTART:20260921T000000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:No UID here [ITSE 1350]
DTSTART:20260922T000000Z
END:VEVENT
END:VCALENDAR`;

describe("parseIcsEvents", () => {
	it("parses UTC date-time events into local calendar dates", () => {
		const events = parseIcsEvents(SAMPLE_ICS);
		const event = events.find((e) => e.uid === "event-abc-123");
		expect(event).toBeDefined();
		// DTSTART is 2026-09-18T04:59:00Z; the local calendar date depends on
		// the runner's timezone, but must be one of the two plausible days.
		expect(["2026-09-17", "2026-09-18"]).toContain(event?.due);
	});

	it("extracts a trailing [Course Code] hint and strips it from the title", () => {
		const events = parseIcsEvents(SAMPLE_ICS);
		const event = events.find((e) => e.uid === "event-abc-123");
		expect(event?.title).toBe("Homework 3");
		expect(event?.courseCodeHint).toBe("ITSE-1350-001");
	});

	it("parses an all-day VALUE=DATE event literally, with no timezone shift", () => {
		const events = parseIcsEvents(SAMPLE_ICS);
		const event = events.find((e) => e.uid === "event-def-456");
		expect(event?.due).toBe("2026-09-20");
		expect(event?.courseCodeHint).toBe("ITSE 2309");
	});

	it("captures the URL property when present", () => {
		const events = parseIcsEvents(SAMPLE_ICS);
		const event = events.find((e) => e.uid === "event-abc-123");
		expect(event?.url).toBe("https://school.instructure.com/courses/1/assignments/2");
	});

	it("skips events with no SUMMARY", () => {
		const events = parseIcsEvents(SAMPLE_ICS);
		expect(events.find((e) => e.uid === "event-no-summary")).toBeUndefined();
	});

	it("skips events with no UID", () => {
		const events = parseIcsEvents(SAMPLE_ICS);
		expect(events.some((e) => e.title === "No UID here")).toBe(false);
	});

	it("returns an empty array for text with no VEVENTs", () => {
		expect(parseIcsEvents("BEGIN:VCALENDAR\nEND:VCALENDAR")).toEqual([]);
	});

	it("handles RFC 5545 line folding", () => {
		// Per RFC 5545, unfolding drops exactly one whitespace character after
		// each fold, so a producer folding at a natural space keeps the
		// content's real space by doubling it on the continuation line.
		const folded = [
			"BEGIN:VEVENT",
			"UID:folded-1",
			"SUMMARY:This is a long summary that got",
			"  folded onto a continuation line [CS 101]",
			"DTSTART;VALUE=DATE:20260101",
			"END:VEVENT",
		].join("\r\n");
		const events = parseIcsEvents(folded);
		expect(events[0].title).toBe("This is a long summary that got folded onto a continuation line");
		expect(events[0].courseCodeHint).toBe("CS 101");
	});
});

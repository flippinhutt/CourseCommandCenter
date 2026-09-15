# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); dates are UTC.

## [0.1.2] - 2026-09-14

### Added

- **"Due today" section**, in both the live view and the dashboard file —
  notes and unmatched Canvas events due exactly today.
- **"Past due" section**, at the bottom of both the live view and the
  dashboard file — overdue notes and Canvas events, oldest first, kept
  disjoint from the forward-planning sections above it so those stay
  purely forward-looking.
- **Per-row completion checkboxes in the live view.** Every row — note or
  unmatched Canvas event — has a checkbox now, not just the dashboard file:
  - A note's checkbox sets its `status:` frontmatter to `complete` directly.
  - An unmatched Canvas event's checkbox (no note to set `status:` on)
    remembers the event's Canvas UID as checked-off instead, hiding it
    across future Refreshes and re-syncs.
- **Editable status in the assignment detail panel** — a dropdown that
  writes `status:` frontmatter and immediately refreshes the dashboard,
  instead of only displaying status as read-only text.
- **Settings → "Checked-off Canvas items"** — shows how many unmatched
  Canvas events are currently checked off, with a button to clear them all
  (undoes a misclick; a checked-off event has no other way back).
- Independently configurable **"Do next" and "Upcoming deadline" windows**
  (default 3 and 7 days) for both the live view and the dashboard file.

### Changed

- Dashboard file's middle section renamed **"Current work" → "Upcoming"**,
  matching the live view's terminology (the live view's own "Current work"
  section — status-driven, not date-driven — is a different thing and
  keeps its name).
- "Current work" no longer includes notes with `status: not-started` — a
  freshly created note doesn't appear there until you've actually started
  it. It still includes `in-progress`, `blocked`, and `reviewing`.
- Every dashboard-file line renders as a checkbox now, including
  not-yet-created Canvas items (previously plain text) — checking one
  dismisses it the same way the live view's checkbox does.

### Fixed

- The live view's "Do next" section was reading the 7-day "Upcoming"
  window instead of its own "Do next" window; it now uses the correct
  setting.
- The live view's "Upcoming deadlines" section had no window filter at all
  (showed every future item, unbounded); it now respects the "Upcoming
  deadline window" setting like the dashboard file does.
- "Do next"'s no-due-date/in-progress fallback matched *any* note with that
  status regardless of `type:` — a reference/background note marked
  `in-progress` (with no `due:` to ever age it out) could sit in "Do next"
  indefinitely. It's now restricted to the same actionable types "Current
  work" uses (`assignment`, `project-deliverable`, `module`, `sql-lab`,
  `discussion`, `lecture`).
- Checking a box in the dashboard file only ever worked for note-backed
  lines; an unmatched Canvas event's box was a permanent no-op. It's now a
  real dismissal (see "Checked-off Canvas items" above).
- Settings tab's top-level heading duplicated the plugin's own name
  (Obsidian already shows it); removed.
- Destructive buttons (Reset settings, Remove course) used `setDestructive()`,
  an Obsidian API newer than this plugin's declared `minAppVersion`; switched
  to `setWarning()`, supported since Obsidian 0.11.0.
- Reset settings / Remove course confirmations used the browser's `confirm()`
  dialog; replaced with an in-app confirm modal.
- Several `processFrontMatter` callbacks and one undocumented-API access
  (Templater detection) were typed as `any`, tripping unsafe-access lint
  rules; given explicit narrow types instead.

## [0.1.0] - 2026-09-14

Initial build: the dashboard view (Do next / Current work / Upcoming
deadlines / Recently created / Feedback to process / course artifacts),
quick actions derived from course folder maps, the assignment detail
panel, course health checks, rubric parsing, the auto-generated dashboard
file, and optional Canvas calendar (.ics) sync with per-item note creation
for unmatched events.

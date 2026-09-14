# Course Command Center

A local-first, Markdown-first dashboard and workflow layer for an Obsidian
academic vault — for any student, any subject. It reads and writes ordinary
Markdown Properties/frontmatter, surfaces what's due and what needs
attention across your courses, and helps you create the right kind of note
in the right folder. Nothing about it is tied to a particular school,
program, or set of courses: you define your own courses and note types in
Settings, and it works from there.

It is **not** a replacement for Obsidian, Tasks, Dataview, Canvas LMS, or a
full learning-management system — it's a layer over an existing
folder-and-Markdown workflow.

## What it does

- A **Course Command Center** view (ribbon icon or command palette) showing,
  per course or across all courses: overdue/due-soon counts, a "Due today"
  list, a "Do next" list, current work, upcoming deadlines, recently created
  notes, feedback awaiting processing, a "Past due" list at the very bottom,
  and course artifact links. "Due today", "Do next", "Upcoming deadlines",
  and "Past due" include unmatched Canvas events too, not just vault notes —
  click one to create its note on the spot. Every row has a checkbox,
  note-backed or not — including overdue ones, so something you missed can
  still be checked off instead of sitting there unresolved forever:
  - A **note's** checkbox sets its `status:` frontmatter to `complete`
    right from the view — the item then drops out of every due-date/status
    section immediately, no need to open the note or the dashboard file.
  - An **unmatched Canvas event's** checkbox (nothing to create a note
    for yet) checks it off your list without creating one — it's
    remembered by the event's Canvas UID and stays hidden across future
    Refreshes and re-syncs. Settings → "Checked-off Canvas items" shows how
    many and can clear them all if you check one off by mistake.
  - **"Current work"** is a different axis from the date-driven sections
    above: it shows notes whose `status:` is `in-progress`, `blocked`, or
    `reviewing`, regardless of due date (so a project you're chipping away
    at stays visible even when its due date is months out). A brand-new
    note defaults to `not-started` and won't appear here until you actually
    start it — via the status dropdown described next, or by editing
    frontmatter yourself.
- **Quick actions, derived automatically from your settings** — for every
  artifact type you map to a folder in a course (Settings → Courses), you
  automatically get a "Create <type>" button and command. There's no
  separate list to keep in sync — the folder map *is* the configuration.
- An **assignment detail panel** (shift-click a note in the view) showing
  due date/points, linked notes, checklist tasks, and a parsed **rubric
  checklist** with a non-destructive completeness summary — plus an
  editable **status dropdown** that writes `status:` frontmatter directly
  and refreshes the dashboard immediately.
- A **course health check** that flags overdue work, stale in-progress
  assignments, incomplete rubrics, modules/discussions missing expected
  tasks, SQL labs with no code block, database-design packets missing
  expected links, and requirements with no acceptance criteria.
- A command to **insert a Course Command Center block** into any note, as
  plain Markdown, or with optional Tasks/Dataview query blocks if those
  plugins are installed.

## What it does not do

- No telemetry, no analytics, no AI, no cloud sync, no login, no network
  calls of any kind — **except** the one you explicitly opt into: syncing
  your Canvas calendar feed (see below). That fetch only happens when you
  click "Sync Canvas calendar" yourself; there is no background polling and
  nothing else in the plugin ever leaves your machine.
- It never deletes, overwrites, or renames your notes. Creating a note that
  would collide with an existing file is blocked, not silently renamed —
  you're asked to choose a different title.
- It doesn't require Dataview, Tasks, Templater, QuickAdd, or Excalidraw.
  If they're installed, a few things get better (see below); if not, nothing
  breaks.
- It doesn't assume anything about your school or subjects. It ships with
  **zero preconfigured courses** — see Getting started below.

## Installation (development vault)

```bash
npm install
npm run build
```

Copy (or symlink) the plugin folder — `manifest.json`, `main.js`,
`styles.css` — into `<vault>/.obsidian/plugins/course-command-center/`, then
enable **Course Command Center** in Obsidian's Community plugins settings.

For active development, `npm run dev` runs an esbuild watcher that rebuilds
`main.js` on save.

## Getting started

The plugin ships with no courses configured — it makes no assumptions about
your school, program, or folder naming. To set it up:

1. Open **Settings → Course Command Center**.
2. Click **Add course**, then fill in its code, display name, delivery
   (online / in-person / hybrid), and root folder.
3. Under that course, add **artifact types**: a short name (e.g.
   `assignment`, `lecture`, `lab-report`, `poem-analysis` — anything you
   want) mapped to a vault-relative folder. A datalist offers ~30 built-in
   suggestions (assignment, module, discussion, lecture, quiz, SQL lab, ERD,
   rubric-tracked project deliverable, etc.) with hand-written fallback
   templates, but you can type anything — a type you invent gets a generic
   placeholder template instead of a tailored one.
4. Each artifact type you add gets a **"Create <type>" quick action**
   automatically, both as a button in the Course Command Center view (when
   that course is selected) and as a command-palette entry.
5. Open the view (ribbon icon, graduation-cap, or **Open Course Command
   Center** in the command palette) to see your dashboard.

## How it uses Markdown / Properties

The plugin reads these frontmatter fields, all optional, tolerating unknown
extra fields:

```yaml
course: <your course code>
delivery: online | in-person | hybrid
type: <any type name you've configured for that course>
status: not-started | in-progress | blocked | reviewing | submitted | complete
due: YYYY-MM-DD
opens: YYYY-MM-DD
module: string
priority: low | medium | high
created: YYYY-MM-DD
points_possible: number
points_earned: number
grade: string
```

`course` values may include extra descriptive text (e.g.
`CS 250 — Data Structures`) — matching is by course code, not exact string
equality. `type` is free text: roughly 30 recognized names (see
`src/constants.ts`'s `KNOWN_ARTIFACT_TYPES`) get a tailored fallback
template and, for some, a dedicated health-check rule; anything else still
works, just with a generic template and no specialized health check.
Frontmatter is only ever written through Obsidian's `processFrontMatter`
API, and only when you explicitly trigger a create action — never as a side
effect of viewing the dashboard.

## Changing paths and templates

**Settings → Courses** lets you add/remove courses and edit, per course:
code, display name, delivery, root folder, meeting days/time/location,
Canvas URL, active status, and the artifact-type → folder map described
above. Global settings cover the templates folder, daily-note folder,
weekly-review folder, and inbox path (all plain text — no folder-numbering
convention is assumed).

**Templates**: when creating a note, the plugin first checks the configured
templates folder for a matching template file for a curated set of common
types (e.g. `Assignment Template.md`, `Online Module Template.md`, `SQL Lab
Template.md` — see `candidateTemplateFileName` in
`src/services/template-service.ts` for the full mapping). If found, that
file's body is used (frontmatter is always regenerated by the plugin so the
required fields stay consistent); otherwise a built-in fallback template is
used — a tailored one for a recognized type, a generic one-section template
for a custom type. Fallback templates use placeholder section headings
only — no fabricated content, no empty `[[ ]]` links.

## How course health checks work

**Run course health check** (command palette or button in the view) is
read-only — it never edits notes. It reports, per note, one of three
severities (Info / Warning / Action needed) and every result is clickable
to open the note. See the full rule list in the "What it does" section
above; the underlying pure rule functions are in
`src/services/health-check-rules.ts`. The rules key off a note's `type`, so
they only apply to notes using one of the recognized type names (assignment,
module, discussion, sql-lab, database-design, requirement,
project-deliverable) — a fully custom type just doesn't get a dedicated
check.

## Dashboard file (optional)

An auto-generated note that gives you "what's due" as a plain file instead
of only the live view — set **Settings → Dashboard file path** (empty by
default = disabled) and it starts getting written.

The file has five sections, in this order:

- **Deadlines** — every active (not complete/submitted) note with a due
  date of today or later, across all your courses, sorted chronologically.
  The master list.
- **Upcoming** — the subset due within the "Upcoming deadline window"
  setting (default 7 days).
- **Do next** — the subset due within the "Do next window" setting (default
  3 days).
- **Due today** — the subset due exactly today. The narrowest
  forward-looking section.
- **Past due** — at the very bottom, oldest (most overdue) first. The one
  section disjoint from the four above it: everything up there excludes
  overdue items on purpose (forward planning only), and this is where they
  go instead so they're not just gone — check one off here the same way you
  would anywhere else.

Sections overlap on purpose (Past due is the exception, see above):
something due tomorrow shows up in all three of Deadlines/Upcoming/Do next,
so each section is a complete view at its own zoom level rather than a
disjoint slice. It pulls from every course's due-dated notes, not just
Canvas-synced ones — if you've been setting `due:` in frontmatter yourself,
those show up here too. The **live Course Command Center view** shows the
same combined picture in its "Due today", "Do next", "Upcoming deadlines",
and "Past due" sections — the file and the view are two renderings of the
same underlying data, not two separate things to keep in sync with each
other.

**Every line renders as a checkbox, and checking either kind removes it.**
Check a real note's line and the plugin sets that note's `status:`
frontmatter to `complete`. Check a not-yet-created Canvas item's line and
the plugin remembers its Canvas UID as checked-off instead (there's no note
to set `status:` on) — either way, the dashboard watches for the checked
box, applies the change, and regenerates the file right after, so the item
drops out rather than staying checked-but-present. A checked-off Canvas
item stays hidden across future Refreshes and re-syncs; Settings →
"Checked-off Canvas items" can clear all of them if you check one off by
mistake. Click the Canvas item's link instead of its checkbox if you'd
rather create a real note for it (see below).

It's fully regenerated (not appended to) every time it updates — clicking
**Refresh** in the view, and after a **Sync Canvas calendar** run, both
rewrite it. There's no background/automatic write; a manual edit to the
file survives right up until the next explicit refresh or sync, at which
point it's replaced. On first write, if a file already exists at the
configured path and it doesn't contain the plugin's "Auto-generated by
Course Command Center" marker, the plugin refuses to touch it (shown as an
error) rather than risk overwriting an unrelated note — pick a different
path or move the existing file.

**Refresh never re-fetches Canvas, but it doesn't lose Canvas data either.**
A sync's raw events are saved to the plugin's local settings; every
Refresh (and every dashboard-file/view update) re-matches that saved data
against your *current* vault notes rather than needing a fresh network
call. So clicking Refresh right after a sync still shows Canvas items —
and if you create a note for one in the meantime, the very next Refresh
correctly drops it out of "unmatched" without needing to sync again.

An unmatched Canvas event (no vault note yet) still appears in every
relevant section — and its title **is a clickable wikilink**, not just plain
text. Click it and Obsidian creates a note at exactly where that
assignment's note would live (its course's configured folder); the plugin
then fills in the frontmatter (`course`, `delivery`, `type: assignment`,
`due`, `id`) and template content, the same way a quick action would, right
after Obsidian creates the blank file. A secondary `(Canvas)` link next to
it still opens the assignment on Canvas directly, and the "Create note"
button in the sync review panel still works too — both are just alternate
ways to get the same result as clicking the dashboard-file link.

## Canvas calendar sync (optional)

Automates keeping every date-driven section ("Due today", "Do next",
"Upcoming deadlines", "Past due") current by pulling due dates from Canvas,
without ever calling the Canvas API or storing a login token.

1. In Canvas, go to **Calendar → Calendar Feed** (usually bottom-left of the
   calendar page) and copy the ICS URL it gives you. This URL is
   unauthenticated but effectively a secret — anyone who has it can see your
   calendar — so treat it like a password.
2. Paste it into **Settings → Course Command Center → Canvas calendar feed
   URL**.
3. Run **Sync Canvas calendar** (command palette, or the button in the view
   header once a URL is configured).

What happens on sync:

- The feed is fetched once, parsed, and each event is matched to a
  configured course via the `[Course Code]` Canvas appends to every event
  title.
- For an event that matches an **existing note** (matched first by a
  `id:` frontmatter field stamped by a prior sync, falling back to a
  same-course, same-title match) — its `due:` frontmatter is updated
  automatically as part of this one sync action, and `id:` is backfilled if
  the note didn't already have one. Nothing else about the note is touched.
- For an event with **no matching note**, it's listed in a review panel;
  nothing is created until you click "Create note" on that specific item —
  consistent with the plugin never bulk-creating files without a per-item
  action.
- An event whose course doesn't match any configured course is silently
  skipped (there's nowhere to route it).

This is read-only against Canvas (the ICS feed can't be written to) and is
the plugin's one deliberate exception to "no network calls" — it's entirely
optional, and everything else keeps working with the field left empty.

## Optional plugin integration

Detected by plugin ID only, never required: Tasks, Dataview, Templater,
Excalidraw, Linter, QuickAdd, Obsidian Git. Status is shown in Settings.

- **Tasks installed**: the Tasks-style due-date emoji (`📅 YYYY-MM-DD`) is
  also recognized on in-body checklist lines, in addition to frontmatter
  `due`.
- **Dataview installed**: never required; the dashboard-insert command can
  optionally add a Dataview query block, only after you choose that option.
- **Templater installed**: if a configured template file contains Templater
  syntax, the plugin creates the note first, then makes a best-effort,
  documented-API-only attempt to trigger Templater's processing on it. If
  that API isn't available, the template's placeholders are left intact
  rather than guessing at substitution.
- **Excalidraw, Linter, QuickAdd, Obsidian Git**: detected for status
  display only in this v1; no behavior is currently gated on them beyond
  detection.

## Design decisions

- **Hybrid courses are folded into "in-person" behavior** everywhere a
  course's delivery only affects in-person vs. online branching (health
  checks in particular) — a hybrid course still meets in person, so it
  follows the in-person rules rather than a third code path.
- **Quick actions are derived, not configured separately.** Early versions
  of this plugin had a distinct per-course quick-action list; it was
  replaced with "one quick action per folder-map entry" so that adding a
  course and mapping its artifact types is the only setup step — there's
  no second list that can drift out of sync with the folder map.
- **The artifact-type system is intentionally open** (a suggested list, not
  an enum) rather than closed, so the plugin isn't limited to any one
  field of study.

## Known limitations

- The dashboard only recognizes notes that carry the plugin's frontmatter
  schema (`course`, `type`, `status`, etc.). Existing lecture/reference
  notes that predate the plugin and use a different frontmatter convention
  won't appear until they're given matching frontmatter (manually, or by
  recreating them through the plugin).
- A note with `status: in-progress` and no `type:` set (or a `type:` outside
  `assignment`/`project-deliverable`/`module`/`sql-lab`/`discussion`/
  `lecture`) never appears in "Current work", and — if it also has no
  `due:` — sits in "Do next" indefinitely, since there's no due date to age
  it out. This is by design for reference/background notes, but it means a
  hub-style note you've marked `in-progress` for tracking purposes (a
  semester project overview, say) can look like it's stuck in the wrong
  section if you haven't given it a matching `type:`.
- Rubric parsing supports the documented table shape
  (`Criterion | Requirement | Evidence in my work | Complete`) under a
  `## Rubric` or `## Rubric checklist` heading; other table shapes aren't
  recognized.
- Templater integration uses an undocumented internal API
  (`overwrite_file_templates`) as a best-effort call; it may silently no-op
  on Templater versions that don't expose it, leaving template placeholders
  in the created note.
- Backlink discovery in the assignment detail panel is based on outgoing
  wikilinks parsed from the note body, not Obsidian's resolved-backlinks
  index.
- Canvas sync matches events to courses by the `[Course Code]` text Canvas
  appends to each calendar event title — if your institution's Canvas
  instance formats that differently, or a course's code in Settings doesn't
  appear in it, those events won't match and won't be routed anywhere.
- Clicking a Canvas item's link (in the dashboard file or the live view)
  only auto-fills the resulting note while that event is in the plugin's
  in-memory "pending" cache, which is rebuilt from the last sync's *saved*
  data every time the dashboard file or view refreshes — so it survives an
  Obsidian restart, but only after at least one Refresh or Sync post-
  restart repopulates it. Click a link before that first Refresh and
  Obsidian still creates the note, just blank instead of filled in.
- Checking a dashboard-file checkbox only marks that note complete — it
  doesn't work by parsing arbitrary checkbox text, only lines the plugin
  itself generated with a recognizable wikilink. Checking a box you added
  yourself elsewhere in the file (outside the auto-generated sections)
  does nothing.
- Command-palette quick-action entries are (re-)registered when you add,
  remove, or edit a course/folder-map entry in Settings, but a command for
  a type you've since deleted only disappears after Obsidian restarts or
  the plugin reloads — Obsidian doesn't expose a public "unregister
  command" API.

## Troubleshooting

- **A course's notes aren't showing up on the dashboard**: check that the
  note has `course:` set to (or starting with) the configured course code,
  and that "Scan entire vault" is enabled in settings if the note lives
  outside the course's configured root folder.
- **A quick action created a note in the wrong folder**: check that
  course's folder map in Settings → Courses for that artifact type.
- **Note creation says a note already exists**: the plugin never overwrites
  — choose a different title.
- **No quick-action buttons show up for a course**: add at least one
  artifact type to that course's folder map in Settings — buttons are
  derived from it, so an empty map means no buttons yet.
- **Dashboard file update fails with an error**: something already exists
  at the configured path that isn't a previously-generated dashboard file —
  point the setting at a different path, or move/rename the existing file.

## Privacy

No telemetry, no analytics, no AI calls, no login, no Canvas API calls. The
only network request the plugin ever makes is fetching your Canvas ICS
calendar feed, and only if you've configured a feed URL and explicitly
clicked "Sync Canvas calendar" — never automatically or in the background.
All data otherwise stays in this vault or in this plugin's local settings.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Contributing

Issues and pull requests are welcome. Before sending a PR: `npm run build`
must pass with zero TypeScript errors, and `npm test` must pass — both are
plain `npm` scripts, no CI setup required to run them locally. Keep changes
consistent with the design decisions above (local-first, no network calls
beyond the one documented exception, no destructive file operations, no
hard dependency on another plugin).

## License

[MIT](LICENSE)

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
  per course or across all courses: overdue/due-soon counts, a "Do next"
  list, current work, upcoming deadlines, recently created notes, feedback
  awaiting processing, and course artifact links.
- **Quick actions, derived automatically from your settings** — for every
  artifact type you map to a folder in a course (Settings → Courses), you
  automatically get a "Create <type>" button and command. There's no
  separate list to keep in sync — the folder map *is* the configuration.
- An **assignment detail panel** showing due date/status/points, linked
  notes, checklist tasks, and a parsed **rubric checklist** with a
  non-destructive completeness summary.
- A **course health check** that flags overdue work, stale in-progress
  assignments, incomplete rubrics, modules/discussions missing expected
  tasks, SQL labs with no code block, database-design packets missing
  expected links, and requirements with no acceptance criteria.
- A command to **insert a Course Command Center block** into any note, as
  plain Markdown, or with optional Tasks/Dataview query blocks if those
  plugins are installed.

## What it does not do

- No network calls, no Canvas API sync, no telemetry, no analytics, no AI,
  no cloud sync, no login — v1 is entirely local.
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

## Privacy

No network requests, no telemetry, no analytics, no AI calls, no Canvas API
calls. All data stays in this vault or in this plugin's local settings.

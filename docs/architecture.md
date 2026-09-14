# Architecture

## Why Markdown portability was preserved

Every note the plugin creates is ordinary Markdown with standard Obsidian
Properties/frontmatter. The plugin never invents a proprietary data format,
database, or sidecar file: everything it needs to reconstruct its view of
the vault (course, type, status, due date, rubric table, checklist tasks)
lives in the note itself. Two consequences follow directly from that
choice, and both shaped the module boundaries below:

- **Uninstalling the plugin loses nothing.** Notes, links, tasks, and rubric
  tables remain fully readable and usable as plain Markdown.
- **The plugin can be read-mostly.** Frontmatter is only ever written
  through `app.fileManager.processFrontMatter`, and only in response to an
  explicit user action (create a note, run a quick action). Viewing the
  dashboard or running a health check never mutates a file.

## Module boundaries

```
main.ts                          Plugin entry point: registers the view,
                                  commands, ribbon icon, settings tab, and
                                  vault/metadata-cache event listeners.

                                  getCurrentCanvasMatches() is the one place
                                  that turns "the last sync's raw events"
                                  (settings.lastCanvasEvents, persisted to
                                  data.json) into "matches against the
                                  vault right now" (re-run every call, no
                                  network). Both the dashboard file and the
                                  live view call this instead of caching
                                  their own copy — a note created since the
                                  last sync drops out of "unmatched"
                                  immediately, and a plain Refresh (no new
                                  fetch) still reflects Canvas data instead
                                  of needing a fresh sync to avoid going
                                  blank. This replaced an earlier design
                                  where callers passed their own
                                  CanvasSyncMatch[] through — Refresh had
                                  none to pass, so every Refresh silently
                                  wiped whatever the last sync had written.

                                  Also owns pendingCanvasNotes (an in-memory
                                  path -> CanvasSyncMatch map, rebuilt from
                                  getCurrentCanvasMatches() by
                                  updateDashboardFileIfConfigured) and the
                                  vault "create" listener that consults it:
                                  clicking a Canvas item's wikilink (in the
                                  dashboard file or the view) makes Obsidian
                                  create a blank note, and this is what
                                  turns that blank note into a properly
                                  templated one.
src/
  settings.ts                    Settings tab UI only. Reads/writes
                                  PluginSettings via the plugin instance;
                                  contains no indexing or note-creation logic.
  types.ts                       Shared type definitions (no runtime code).
  constants.ts                   Default settings (ships with an empty
                                  course list — no course/school is assumed)
                                  and KNOWN_ARTIFACT_TYPES, the curated
                                  suggestion list used for richer fallback
                                  templates and settings-UI autocomplete.

  views/
    course-command-center-view.ts
                                  The dashboard ItemView. Pulls data from
                                  NoteIndexService and renders it; contains
                                  no frontmatter-writing or file-creation
                                  logic itself — it delegates to modals and
                                  services for anything that mutates state
                                  (an unmatched Canvas item's click handler
                                  calls createNoteForCanvasEvent directly,
                                  same as the sync modal's button). "Do
                                  next" and "Upcoming deadlines" render a
                                  DisplayItem union (a vault note or an
                                  unmatched CanvasSyncMatch from
                                  plugin.getCurrentCanvasMatches()) so both
                                  sources sort into one chronological list;
                                  "Current work"/"Recently created"/
                                  "Feedback to process" only ever contain
                                  note items, since Canvas-only entries have
                                  no type/status until a note exists.

  modals/
    create-note-modal.ts         Collects a title (+ optional due date),
                                  then calls template-service to create the
                                  note. Owns the "don't overwrite, prompt for
                                  a different name" behavior.
    assignment-detail-modal.ts   Read-only detail view: due/status/points,
                                  linked notes, checklist tasks, rubric.
    health-check-modal.ts        Read-only results list from
                                  health-check-service.
    dashboard-insert-modal.ts    Presents the Plain/Tasks/Dataview choice
                                  and builds the inserted Markdown block.
    canvas-sync-modal.ts          Fetches + matches on open, applies due
                                  dates to matched notes immediately (the
                                  sync click itself is the explicit
                                  confirmation), then lists unmatched events
                                  with a per-item "Create note" button —
                                  nothing is created without that click.

  services/
    course-service.ts            Pure course lookups: course-code matching
                                  (tolerating trailing descriptive text),
                                  active-course filtering, the
                                  hybrid-counts-as-in-person rule, and
                                  deriveQuickActions, which turns a course's
                                  folder map into its list of quick actions
                                  (there is no separate quick-action config —
                                  mapping a folder to a type is what creates
                                  the "Create <type>" action for it).
    note-index-service.ts        Builds an IndexedNote[] from Obsidian's
                                  metadata cache (never re-reading file
                                  bodies for indexing) and debounces
                                  metadata-change-triggered rebuilds so a
                                  burst of vault events collapses into one
                                  rebuild.
    template-service.ts          Resolves a template file if one exists in
                                  the templates folder for the artifact
                                  type, else falls back to
                                  fallback-templates.ts; always regenerates
                                  frontmatter itself so required fields are
                                  populated consistently regardless of
                                  template source; best-effort Templater
                                  trigger. resolveNoteContent does the pure
                                  "what should this note contain" part;
                                  createNoteFromTemplate (vault.create, for
                                  a brand-new note) and populateExistingNote
                                  (vault.modify, for a file Obsidian already
                                  created — e.g. from an unresolved-wikilink
                                  click) both build on it, sharing the same
                                  template/frontmatter logic either way.
    fallback-templates.ts        Built-in Markdown body templates, one per
                                  artifact type. Body content only —
                                  frontmatter is template-service's job.
    health-check-rules.ts        Pure, individually testable rule functions
                                  (NoteFacts -> HealthCheckResult | null).
                                  No Obsidian API usage — this is what the
                                  unit tests exercise directly.
    health-check-service.ts      Orchestrator: reads file content only for
                                  note types a health-check rule actually
                                  cares about, builds NoteFacts, and calls
                                  the pure rule functions.
    rubric-service.ts            Thin file-read wrapper around
                                  utils/markdown.ts's parseRubricTable.
    optional-plugin-service.ts   Detects Tasks/Dataview/Templater/
                                  Excalidraw/Linter/QuickAdd/Git by plugin
                                  ID; never throws if one is absent.
    canvas-match.ts               Pure event-to-course-and-note matching
                                  for Canvas sync (IcsEvent[] + IndexedNote[]
                                  + CourseConfig[] -> CanvasSyncMatch[]). No
                                  Obsidian API usage, deliberately split out
                                  of canvas-sync-service.ts so it can be
                                  imported by tests without pulling in
                                  requestUrl/TFile (the "obsidian" package
                                  ships types only — importing any of its
                                  values outside the Obsidian runtime fails
                                  at module load, not at the call site). Also
                                  has pendingCanvasNotePath, the one function
                                  that decides where an unmatched event's
                                  note would live — used by both
                                  dashboard-content.ts (as the wikilink
                                  target) and main.ts (as the pending-notes
                                  cache key), so the two can never compute
                                  different paths for the same event.
    canvas-sync-service.ts       Obsidian-API side of Canvas sync: fetches
                                  the ICS feed (requestUrl), applies a
                                  matched event's due date via
                                  processFrontMatter, and creates a note for
                                  an unmatched event through
                                  template-service. Re-exports
                                  matchCanvasEvents from canvas-match.ts so
                                  callers only need one import.
    dashboard-content.ts          Pure: builds the sorted Deadlines pool
                                  (buildDashboardLines) from IndexedNote[] +
                                  unmatched CanvasSyncMatch[], and renders it
                                  to Markdown (buildDashboardMarkdown) with
                                  overlapping Deadlines/Current work/Do next
                                  sections. No Obsidian API — same reasoning
                                  as canvas-match.ts.
    dashboard-file-service.ts    Obsidian-API side: writes dashboard-
                                  content.ts's output to the configured
                                  path via vault.create/modify. Refuses to
                                  overwrite a pre-existing file that lacks
                                  the DASHBOARD_FILE_MARKER string, so a
                                  settings-path typo can't clobber an
                                  unrelated note.

  utils/
    dates.ts                     Local-calendar-date parsing/formatting and
                                  due-state calculation. No timezone/UTC
                                  shifting.
    markdown.ts                  Wikilink extraction, checklist parsing,
                                  fenced-code-block detection, and rubric
                                  table parsing/summarizing.
    paths.ts                     Windows-safe filename sanitization and
                                  vault-relative path joining.
    frontmatter.ts               Converts raw metadata-cache frontmatter
                                  into the typed NoteProperties shape,
                                  tolerating missing/unknown fields.
    ics.ts                       Pure RFC 5545 ICS parser (line unfolding,
                                  property parsing, UTC/local date
                                  conversion) producing IcsEvent[]. Knows
                                  nothing about courses or notes — that's
                                  canvas-match.ts's job.
    tasks.ts                     Tasks-plugin due-date emoji extraction from
                                  checklist lines.
```

## Why the pure-function / service / UI split

- `utils/` and `services/health-check-rules.ts` / `services/canvas-match.ts` /
  `services/dashboard-content.ts` take no Obsidian `App` dependency and do no I/O — they're the layer the
  unit tests exercise directly (course-code matching, date/due-state math,
  filename sanitization, rubric-table parsing, health-check rule evaluation,
  ICS parsing, Canvas-event-to-note matching). This split isn't just a style
  preference: importing anything from the real `obsidian` package's runtime
  (as opposed to `import type`) outside Obsidian itself fails at module load
  time, since that package ships only type declarations — so any module a
  test imports has to be obsidian-import-free on its own, not just in the
  function under test.
- `services/*` (other than the two above) hold the Obsidian-API-
  dependent orchestration: reading files, walking the metadata cache,
  detecting other plugins.
- `views/` and `modals/` hold only rendering and user-interaction wiring.
  They call into services rather than duplicating indexing, template
  resolution, or rule logic — so, for example, both the ribbon-accessible
  view's "Run course health check" button and the command-palette command
  in `main.ts` call the same `runHealthCheck` function instead of two
  divergent implementations.

## Performance

`NoteIndexService` builds its index from `app.vault.getMarkdownFiles()` +
`app.metadataCache.getFileCache()` — frontmatter only, never a body read —
so indexing all courses stays cheap regardless of vault size. Body reads
(for checklist tasks, rubric tables, SQL fences, wikilinks) only happen in
`health-check-service.ts`, `rubric-service.ts`, and
`assignment-detail-modal.ts`, all of which act on one note at a time when
the user asks for it, not during indexing. Metadata-cache change events are
debounced (500ms) before triggering a rebuild, so rapid edits don't cause a
rescan per keystroke.

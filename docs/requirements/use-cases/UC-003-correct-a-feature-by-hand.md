# UC-003 — Correct a feature's geometry by hand and keep the correction

| | |
|---|---|
| **Primary actor** | GIS practitioner |
| **Scope** | duckdb-gis |
| **Level** | User goal |
| **Status** | **Partial** — write-back to an attached source works; the
  drawn-from-scratch / working-database case still needs project files (#33)
  to survive a close |

**Goal.** Fix geometry that is wrong — a misplaced vertex, a boundary that
doesn't line up — and still have that fix tomorrow.

**Preconditions.** A layer is on the map (UC-001). The actor has identified a
feature whose geometry is wrong.

**Trigger.** The actor sees something wrong on the map.

## Main success scenario

The layer came from an attached source (a DuckDB file, object storage, …) —
the common case, since data an actor wants to correct is usually data they
already have.

1. The actor enters edit mode for the layer.
2. The system promotes the layer's source to writable for the session (#66,
   ADR-0002) and shows the digitizing tools, switching map interaction from
   selection to editing so a click means "edit" rather than "select".
3. The actor selects the feature and moves the offending vertex.
4. The actor leaves edit mode and saves the edit.
5. The system writes the correction back to the source table, demotes the
   source back to read-only, and re-renders the layer from it.
6. The correction is now in the actor's own database. Nothing further is
   needed to "keep" it — reopening that database tomorrow, in duckdb-gis or
   anywhere else, shows the fix.

## Extensions

- **1a.** The layer was drawn from scratch, or copied into the working
  database rather than coming from an attached source (no `source`, or its
  `db` is the working catalog).
  - **1a1.** Editing proceeds the same way, but there is no source to write
    back to — the edit stays in the in-memory working database until the
    actor explicitly **saves a project** (`.duckdb` file containing the
    working tables, layers, styling and camera). Blocked on #33; see 7a
    below for what happens meanwhile.
- **2a.** Another process already holds the source open read-write (DuckDB's
  file locking is exclusive for a writable attach — verified against 1.5.4).
  - **2a1.** Entering edit mode fails immediately, before any digitizing work
    exists to lose, with a readable message. The actor has invested nothing.
- **3a.** The actor wants the vertex to land exactly on a neighbouring
  feature's vertex.
  - **3a1.** *Target: snapping (#50). Without it, precise topological editing
    is not really achievable, which limits how far this use case can be
    trusted.*
- **3b.** The actor makes a mistake and wants to undo.
  - **3b1.** Cmd/Ctrl+Z steps back one action (REQ-F-008, #68): a completed
    feature (this vertex move, once released) is its own step; Cmd/Ctrl+Shift+Z
    (or Ctrl+Y) redoes. Scoped to this edit session only — it does not reach
    back past step 1, and ends the moment the actor leaves edit mode (4/4a),
    same as the rest of the working set.
- **4a.** The actor cancels instead of saving.
  - **4a1.** The working set is discarded and the source (if any) is demoted
    back to read-only; nothing was ever written to it.
- **5a.** Demoting the source back to read-only fails (rare — e.g. a
  re-attach racing another process).
  - **5a1.** The edit itself already succeeded — the working set has been
    torn down locally regardless, so the actor is not stuck in edit mode —
    but the source may be left writable until retried. Surfaced as a distinct
    error so it isn't mistaken for the save having failed.
- **7a. (1a only)** The actor closes the application without saving a
  project.
  - **7a1.** **The correction is lost.** This is the accepted cost of
    [ADR-0001](../../adr/0001-in-memory-working-database-and-project-files.md)
    for working-database-origin edits specifically; the ADR records it as a
    known negative consequence. *Gap: nothing currently warns the actor that
    unsaved work exists — #67.*
- **8a. (1a only)** Writing the project file fails — no space, no permission.
  - **8a1.** The system reports it and the working database is left intact so
    the actor can retry elsewhere. Failing to save must never also destroy
    the work.

## Postconditions

**On success (attached source).** The corrected geometry is durably in the
actor's own database. The source is writable only for as long as the edit
session ran; every other write path to it was rejected by DuckDB itself for
the whole scenario.

**On success (working database, 1a).** The corrected geometry is in the
working database, and — once #33 lands — in a project file that restores it.

**On failure.** No source is ever left with a partial or unintended write:
either the edit's own transaction lands cleanly or it rolls back
(`editing.ts` `commit`), independent of whether the read-only demotion
afterward succeeds.

## Traces to

**Requirements.** REQ-F-004 (digitizing), REQ-F-007 (project save/open),
REQ-F-006 (read-only sources, writable only in an edit session), REQ-F-008
(undo/redo), REQ-Q-002 (QGIS familiarity) — [`../register.md`](../register.md)
**Decisions.** [ADR-0002](../../adr/0002-edit-session-promotes-a-source-to-writable.md)
(supersedes the read-only clause of
[ADR-0001](../../adr/0001-in-memory-working-database-and-project-files.md))
**Issues.** #26, #39, #44, #50 (snapping), #33 (project files — blocks the 1a
working-database case), #66 (source promote/demote — this use case's main
scenario), #68 (undo/redo, 3b) · gaps: #67

## Open questions

- **No unsaved-work warning** — filed as #67. Applies to the working-database
  case (1a): ADR-0001 makes loss-on-close the accepted default there, and the
  absence of a warning turns an accepted trade-off into a surprise. Does not
  apply to the attached-source main scenario — that write is durable the
  moment Save succeeds.

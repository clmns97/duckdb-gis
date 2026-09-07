# UC-003 — Correct a feature's geometry by hand and keep the correction

| | |
|---|---|
| **Primary actor** | GIS practitioner |
| **Scope** | duckdb-gis |
| **Level** | User goal |
| **Status** | **Partial** — the edit works; keeping it does not yet (#33) |

**Goal.** Fix geometry that is wrong — a misplaced vertex, a boundary that
doesn't line up — and still have that fix tomorrow.

**Preconditions.** A layer is on the map (UC-001). The actor has identified a
feature whose geometry is wrong.

**Trigger.** The actor sees something wrong on the map.

## Main success scenario

1. The actor enters edit mode for the layer.
2. The system shows the digitizing tools and switches map interaction from
   selection to editing, so a click means "edit" rather than "select".
3. The actor selects the feature and moves the offending vertex.
4. The system updates the geometry in the working database and re-renders. The
   source the layer came from is not touched.
5. The actor leaves edit mode.
6. The system hides the digitizing tools and restores selection behaviour.
7. The actor saves the project.
8. The system writes the working database — the corrected geometry, the layers,
   their styling and the camera — to a `.duckdb` file.
9. Reopening that file later restores the session with the correction intact.

## Extensions

- **3a.** The actor wants the vertex to land exactly on a neighbouring feature's
  vertex.
  - **3a1.** *Target: snapping (#50). Without it, precise topological editing is
    not really achievable, which limits how far this use case can be trusted.*
- **4a.** The actor makes a mistake and wants to undo.
  - **4a1.** *Undo scope is unspecified — #68.*
- **7a.** The actor closes the application without saving.
  - **7a1.** **The correction is lost.** This is the accepted cost of
    [ADR-0001](../../adr/0001-in-memory-working-database-and-project-files.md);
    the ADR records it as a known negative consequence. *Gap: nothing currently
    warns the actor that unsaved work exists — #67.*
- **7b.** The actor expects the edit to have been written back to the source
  database.
  - **7b1.** It never is, by design (REQ-F-006). *Gap: this is the single most
    likely user misunderstanding in the product, and nothing in the interface
    currently sets that expectation. Enforcement is #66.*
- **8a.** Writing the project file fails — no space, no permission.
  - **8a1.** The system reports it and the working database is left intact so the
    actor can retry elsewhere. Failing to save must never also destroy the work.

## Postconditions

**On success.** The corrected geometry is in the working database, and — once
step 7 is implemented — in a project file that restores it. The source is
unmodified.

**On failure.** The source is unmodified in every branch. Whether the *edit*
survives depends entirely on whether the project was saved.

## Traces to

**Requirements.** REQ-F-004 (digitizing), REQ-F-007 (project save/open),
REQ-F-006 (read-only sources), REQ-Q-002 (QGIS familiarity) —
[`../register.md`](../register.md)
**Decisions.** [ADR-0001](../../adr/0001-in-memory-working-database-and-project-files.md)
**Issues.** #26, #39, #44, #50 (snapping), #33 (project files — blocks step 7) · gaps: #66, #67, #68

## Open questions

- **Undo is unspecified** — filed as #68. Per-vertex, per-edit, or per-session?
  Does leaving edit mode commit? This is the most conspicuous gap the scenario
  exposes.
- **No unsaved-work warning** — filed as #67. Given that ADR-0001 makes
  loss-on-close the accepted default, the absence of a warning turns an accepted
  trade-off into a surprise.
- **Read-only is convention, not enforcement** — filed as #66. Step 4 says the
  source is not touched, but nothing currently prevents it.

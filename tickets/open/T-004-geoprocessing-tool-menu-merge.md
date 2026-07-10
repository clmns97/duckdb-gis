---
id: T-004
title: Geoprocessing tool menu (top bar) — first function: Merge selected features
status: open
priority: P2
area: frontend
depends_on: [T-003]
branch:
---

## Goal

Add a **geoprocessing tool menu** at the top of the window: a menu (label along
the lines of *Processing* / *Geoprocessing*) that opens a dropdown of vector
functions. Start with exactly **one** function: **Merge**. When the user has
features selected on the map, choosing Merge runs a spatial SQL query that
combines the selected features' geometries into a single merged geometry.

## Context

<context>
UX reference (the vocabulary): QGIS exposes vector tools under a top menu —
*Processing* (the Processing Toolbox) and *Vector ▸ Geoprocessing Tools*
(Buffer, Clip, Dissolve/Union, …). Merging selected features into one is
QGIS's *Merge Selected Features*. We want a slimmed-down version: one top-bar
menu, a function dropdown, and for now just Merge.

Where it goes:
  - `frontend/src/App.tsx` top bar (`<header className="topbar">`, ~line 54–58)
    currently holds the wordmark + a "Help" button. Add the tool menu here.
  - No menu/dropdown component exists yet — add one (align styling with
    `frontend/src/App.css` / `frontend/src/lib/tokens.css`).

Depends on [[T-003]]: the merge operates on the **current selection set**. The
menu (or the Merge item) should be **enabled only when ≥2 features are
selected**; otherwise disabled with a hint.

The function itself — spatial SQL:
  - Merging is a `ST_Union` over the selected features' geometries. With the
    stable identifiers from T-003, build something like:

        SELECT ST_Union_Agg(geom) AS geom
        FROM <db>.<schema>.<table>
        WHERE <key> IN (<selected keys>);

    (Confirm the exact spatial function name available in this build — DuckDB
    spatial offers `ST_Union` / `ST_Union_Agg`; verify against the loaded
    extension.) Queries run through the same path the app already uses to talk
    to native DuckDB (`frontend/src/lib/duckdb.ts` / `catalog.ts` use
    `query`); rendering geometry results goes through `renderGeoArrow`
    (`deckRender.ts`).
  - Cross-table selections: decide behavior — for the first cut it's fine to
    require the selection be within a single table, and note that constraint.

Open design point (flag, don't silently pick): what happens to the merge
**result**? Options: (a) render it as a new ephemeral result layer, (b) create
a new table, (c) write back into the source. Recommend (a) render-only for the
first version (non-destructive, matches "trigger a spatial SQL query"), with
write-back as a follow-up ticket. Confirm with the user.

Scope: this ticket is the menu + the Merge function wired to selection. The
selection mechanism itself is T-003.
</context>

## Acceptance criteria

- [ ] A top-bar tool menu opens a dropdown listing available functions;
      **Merge** is present (the only one for now).
- [ ] Merge is enabled only when the selection set has enough features
      (≥2); disabled state is clear otherwise.
- [ ] Choosing Merge builds and runs a spatial SQL query (`ST_Union`-family)
      over the selected features' geometries via the existing DuckDB query
      path.
- [ ] The merged result is surfaced to the user (render-only first cut unless
      decided otherwise) — behavior for the result documented in Progress log.
- [ ] Errors (e.g. spatial extension not loaded, mixed-table selection)
      surface as a readable message, not a silent failure.
- [ ] Frontend build/lint passes.

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created. Not started. Blocked-by-design on T-003
  (selection set). Key open question: what happens to the merge result
  (render-only vs. new table vs. write-back) — recommend render-only, confirm.

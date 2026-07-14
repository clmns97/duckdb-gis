---
id: T-004
title: Geoprocessing tool menu (top bar) — first function: Merge selected features
status: open
priority: P2
area: frontend
depends_on: [T-003]
related: [T-025]
branch:
---

## Goal

Add a **geoprocessing tool menu** at the top of the window: a menu (label along
the lines of *Processing* / *Geoprocessing*) that opens a dropdown of vector
functions. Start with exactly **one** function: **Merge**. When the user has
features selected on the map, choosing Merge runs a spatial SQL query that
combines the selected features' geometries into a single merged geometry.

This ticket is deliberately the **seed of the whole geoprocessing framework**:
the menu, the selection→SQL→result plumbing, and the result-handling pattern that
every later tool (Dissolve, Difference, Clip, Buffer, Simplify, …) reuses. It is
also our answer to "why not a heavier drawing lib": the rich geometry ops that
`@geoman-io/maplibre-geoman` gates behind its paid **Pro** tier (union, split,
difference, cut) — and does client-side in Turf.js — we do as **native DuckDB
spatial SQL** (`ST_Union_Agg`, `ST_Difference`, `ST_Simplify`, …), free and
in-process. That is the on-brand, load-bearing reason this menu exists rather
than reaching for an editor plugin's built-ins. See the roadmap below.

## Context

<context>
UX reference (the vocabulary): QGIS exposes vector tools under a top menu —
*Processing* (the Processing Toolbox) and *Vector ▸ Geoprocessing Tools*
(Buffer, Clip, Dissolve/Union, …). Merging selected features into one is
QGIS's *Merge Selected Features*. We want a slimmed-down version: one top-bar
menu, a function dropdown, and for now just Merge.

Where it goes (references refreshed 2026-07-14 — the app moved to Tailwind v4
and T-003/T-025 landed):
  - `frontend/src/App.tsx` top bar is now `<header className="h-14 …">`
    (App.tsx:162), holding the wordmark (App.tsx:169) + a ghost "Help" `Button`
    (App.tsx:171). Add the *Processing* menu here, before/after Help.
  - **No dropdown-menu component exists**, but `frontend/src/components/ContextMenu.tsx`
    is a positioned menu-item list already used for the Layers/Browser
    right-click menus — either reuse it anchored to the menu button, or factor a
    small `Menu`/`Dropdown` from it. Styling is **Tailwind utilities** now
    (there is no `App.css`); design tokens live in `frontend/src/lib/tokens.css`
    and `frontend/src/global.css`. Reuse the `Button` primitive
    (`components/Button.tsx`).

The selection plumbing is **already built** ([[T-003]] is done). Don't invent an
id scheme — use `frontend/src/lib/selection.ts`:
  - `selection.query()` returns `{ sql, fids } | null` — the recorded source SQL
    of the current render plus the selected feature ids, or null when nothing is
    selected. Gate the Merge item on `selection.size >= 2`.
  - `fidTaggedRelation(sql)` (same module) wraps that source SQL so every feature
    carries the deterministic `__fid` the map picked on. This is the *single*
    builder both the render and any tool use, so the fids line up.

The function itself — spatial SQL. Build the merge straight off the selection:

    const q = selection.query();               // { sql, fids }
    const rel = fidTaggedRelation(q.sql);
    const merged =
      `SELECT ST_Union_Agg(geom) AS geom
         FROM (${rel})
        WHERE ${FID} IN (${q.fids.join(",")})`;

  - Confirm the exact function against the loaded build — DuckDB `spatial`
    offers `ST_Union` (binary) and `ST_Union_Agg` (aggregate; the right one for
    N selected features). `spatial` is loaded at startup (App.tsx bootstrap).
  - Queries run through `query()` (`frontend/src/lib/duckdb.ts`); rendering a
    geometry result goes through `renderGeoArrow` or `layers.addQuery`
    (`deckRender.ts` / `layers.ts`).
  - Cross-table / synthetic selections: because a selection is (sourceSql, fids)
    rather than (table, keys), a merge over one selection is naturally
    single-source — no cross-table concern for the first cut. Just note it.

**Result handling — now easier than when this ticket was filed.** [[T-025]]
shipped the write-back pattern (create a native table from a geometry query, then
`layers.addQuery` to render it through the normal GeoArrow path). So the options:
  - (a) **Render-only** — feed `merged` to `renderGeoArrow(merged)` (ephemeral
    Run-preview) or `layers.addQuery({id,name,sql:merged})` (a persistent
    result layer). Recommended first cut: non-destructive, one call.
  - (b) **Persist** — `CREATE TABLE main.result_<n> AS <merged>` then
    `layers.addQuery` (mirrors `editing.commit()` in `lib/editing.ts`; reuse its
    `nextScratchIndex`-style non-colliding naming). A natural follow-up.
  - (c) Write back into the source — still out of scope.
Recommend (a) with `addQuery` (a named "Merge result" layer the user can keep,
zoom to, remove) unless the user wants persistence now.

Scope: this ticket is the menu + the Merge function wired to selection. The
selection mechanism is [[T-003]] (done); the result-sink plumbing is [[T-025]]
(done). Later tools are the roadmap below — do **not** build them here.
</context>

## Geoprocessing roadmap (context, not this ticket's scope)

Once the menu + selection→SQL→result pattern exists, each additional QGIS-style
vector tool is a small SQL template dropped into the same dropdown. All run
in-process on native DuckDB `spatial` — this is the free/open equivalent of the
ops Geoman gates behind **Pro** (and does client-side in Turf.js). Rough order:

| Tool (QGIS name)        | DuckDB spatial SQL (verify names vs. build)                     | Input                          |
|-------------------------|-----------------------------------------------------------------|--------------------------------|
| **Merge** (this ticket) | `ST_Union_Agg(geom)`                                             | selection (≥2)                 |
| Dissolve                | `ST_Union_Agg(geom) … GROUP BY <attr>`                          | a layer + group column         |
| Buffer                  | `ST_Buffer(geom, <dist>)`                                        | selection or layer + distance  |
| Difference              | `ST_Difference(a.geom, ST_Union_Agg(b.geom))`                   | two selections / layers        |
| Intersection / Clip     | `ST_Intersection(a.geom, b.geom)` / `ST_Intersects` predicate   | two layers                     |
| Simplify                | `ST_SimplifyPreserveTopology(geom, <tol>)`                      | selection or layer + tolerance |
| Convex hull             | `ST_ConvexHull(ST_Union_Agg(geom))`                             | selection                      |
| Centroid                | `ST_Centroid(geom)`                                             | selection or layer             |

Design implications to keep the first cut from boxing us in:
  - **Tool registry, not a hardcoded item.** Model the dropdown as a list of
    `{ id, label, enabled(selection/layers), run() }` so adding a tool is adding
    one entry — don't special-case Merge in the menu JSX.
  - **Parameterised tools** (Buffer distance, Simplify tolerance) will need a
    small param dialog — reuse the modal pattern (`components/Modal.tsx`,
    `OvertureModal.tsx`, `AttachModal.tsx`). Merge needs none, so a param dialog
    is explicitly out of scope here; just don't design the run() signature so it
    can't grow one.
  - **Two-operand tools** (Difference, Clip) need *two* inputs — a later
    selection-A / selection-B or layer-picker UX. Out of scope; noted so the
    single-input assumption here isn't baked into shared code.

## Acceptance criteria

- [ ] A top-bar *Processing* menu opens a dropdown listing available functions;
      **Merge** is present (the only one for now).
- [ ] The dropdown is driven by a small **tool registry** (a list of tool
      descriptors), not hardcoded JSX per item — so a later tool is one entry.
- [ ] Merge is enabled only when the selection set has enough features
      (≥2, via `selection.size`/`selection.query()`); disabled state is clear
      otherwise (tooltip/hint).
- [ ] Choosing Merge builds its SQL from `selection.query()` +
      `fidTaggedRelation` (`ST_Union_Agg` over the selected `__fid`s) and runs it
      through the existing `query()` path.
- [ ] The merged result is surfaced as a layer via `layers.addQuery`
      (render-only first cut; persistence deferred) — behavior noted in Progress
      log.
- [ ] Errors (e.g. spatial extension not loaded, empty/invalid selection)
      surface as a readable message, not a silent failure.
- [ ] `pnpm typecheck` + `pnpm build` pass (there is no `lint` script).

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created. Not started. Blocked-by-design on T-003
  (selection set). Key open question: what happens to the merge result
  (render-only vs. new table vs. write-back) — recommend render-only, confirm.
- 2026-07-14: **Enriched — still not started, but dependencies are now done and
  references refreshed.** [[T-003]] selection shipped (`selection.query()` +
  `fidTaggedRelation` are the exact tool on-ramp) and [[T-025]] shipped the
  result-sink pattern (`CREATE TABLE … AS <geom query>` → `layers.addQuery`;
  see `editing.commit()` in `lib/editing.ts`). Fixed stale references (Tailwind
  v4: no `App.css`; header at App.tsx:162; reuse `ContextMenu.tsx`/`Button`).
  Added a **geoprocessing roadmap** framing this as the DuckDB-native, free/open
  equivalent of Geoman **Pro**'s union/difference/split/cut (which are
  paid + client-side Turf.js) — decided while evaluating whether to swap the
  T-025 drawing lib for GeoLibre's Geoman-based GeoEditor (we keep Terra Draw;
  heavy geometry ops belong in DuckDB SQL, i.e. here). Design note added: model
  the dropdown as a **tool registry** and keep `run()` growable to a param
  dialog (Buffer/Simplify) and two-operand inputs (Difference/Clip) without
  building them now. First-cut scope unchanged: menu + Merge only.

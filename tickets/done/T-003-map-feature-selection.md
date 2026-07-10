---
id: T-003
title: Select features on the map (selection set for geoprocessing)
status: done
priority: P1
area: frontend
depends_on: []
branch: T-003-map-feature-selection
---

## Goal

Let the user select one or more features directly on the map and hold them as a
**selection set**. Selected features are visually highlighted. Crucially, each
selected feature carries a **stable identifier back to its source row** (which
database.schema.table, and which row) so downstream tools can build SQL against
exactly those features. This is the prerequisite for the geoprocessing tools —
without a selection there's nothing to operate on (see [[T-004]]).

## Context

<context>
UX reference: QGIS lets you click features with the *Select Features* tool
(click, shift-click to add, and rubber-band/box select), and the selection set
then feeds Processing/edit tools. We want the same idea, simpler to start.

How rendering works today — `frontend/src/lib/deckRender.ts`:
  - `renderGeoArrow(userSql)` fetches an Arrow table and builds GeoArrow
    deck.gl layers (`GeoArrowScatterplotLayer` / `PathLayer` / `PolygonLayer`,
    ~lines 63–95) from record batches; the geometry is the `geom` child
    (~line 142). Layers are **not `pickable`** today — selection requires
    setting `pickable: true` and wiring deck.gl picking (`onClick` / info.index
    / info.object) in `frontend/src/components/MapView.tsx` (`MapView`, line 6).
  - Because layers come from a SQL query over `geom`, the arrow result must
    also carry a **stable key** per feature (e.g. `rowid`, or a primary key, or
    the source db/schema/table + key) so a picked feature maps back to a
    concrete row for SQL. Decide the key strategy here — this is the crux.

Open design points to resolve (and note the choices in the Progress log):
  - Selection granularity: single-click, shift-click to add/remove, box select?
    Start minimal (click + shift-click) is fine.
  - Identifier: `rowid` is easy but not stable across writes; a real PK is
    stronger. What does the current query pipeline expose? May need to include
    an id column alongside `geom` in the fetched Arrow.
  - Where selection state lives (component state vs. a small store) so
    [[T-004]] and the tool menu can read it.

Scope: interaction + state + highlight only. Acting on the selection (merge,
etc.) is [[T-004]].
</context>

## Acceptance criteria

- [x] Clicking a feature on the map selects it; the selection is visually
      highlighted (amber over the indigo base). Clicking empty map area clears,
      and a floating chip offers an explicit Clear.
- [x] Multi-select works: shift-click adds/removes (toggle).
- [x] Layers are `pickable` and picking is wired in `MapView` / `deckRender`.
- [x] Each selected feature resolves to a **stable source identifier**
      (source SQL + per-render `__fid`) sufficient to rebuild a SQL query
      against it — strategy documented in the Progress log.
- [x] Selection state is exposed via `lib/selection.ts` (`selection` store;
      `selection.query()` returns `{ sql, fids }`; also on `window.gisSelection`
      in dev) so a tool menu / function can read the current selection.
- [x] Frontend build + typecheck pass.

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created. Not started. Prerequisite for T-004 (tool menu /
  merge). Key open question: stable feature identifier through the Arrow
  pipeline.
- 2026-07-10: Implemented on branch `T-003-map-feature-selection`.

  **Identifier strategy (the crux).** The render path runs *arbitrary user SQL*
  (the default query is a synthetic `UNION ALL` with no backing table), so a
  db.schema.table + PK is not generally available. Instead the selection is
  `(sourceSql, {fid…})`: the source query plus a deterministic per-render
  `__fid` (`row_number()`). One shared builder — `fidTaggedRelation(sql)` in
  `lib/selection.ts` — assigns fids, and the render encode wraps its query with
  it, so a picked fid maps to the same row a downstream tool computes. T-004
  rebuilds the rows with `… FROM (<fidTaggedRelation(sourceSql)>) WHERE __fid
  IN (…)`. Verified end-to-end: picking Zürich/Bern gave fid 1/2, and the same
  tagged relation resolves fid 1→Zürich, 2→Bern.
  Caveat: `row_number() OVER ()` is positional, only stable for re-evaluations
  of the *same* query — fine for an interactive select→tool round-trip. When
  the Layers panel makes layers table-backed (T-002/T-010), upgrade `__fid` to
  a real rowid/PK behind this same module.

  **What changed.**
  - `lib/selection.ts` (new): observable selection store — `has/toggle/set/
    clear/fids/version/subscribe`, `setSource`, and `query()` → `{sql, fids}`
    for T-004. Exports `FID` + `fidTaggedRelation`.
  - `lib/deckRender.ts`: layers now `pickable`; per-feature highlight via
    GeoArrow function accessors (`getFillColor`/`getLineColor`/`getWidth`/…)
    keyed on `selection.version` `updateTriggers`; overlay `onClick` picking;
    the encoded fetch carries `__fid`; renders record the source and rebuild
    layers in place on selection change (no re-query).
  - `components/MapView.tsx`: `map.boxZoom.disable()` — MapLibre's shift+drag
    box-zoom otherwise swallowed the shift+mousedown and killed the pick.
  - `components/SelectionChip.tsx` (new) + App.css: floating "N selected ·
    Clear" readout. `App.tsx` mounts it and exposes `window.gisSelection`.

  **Gotchas found while verifying** (Playwright, dev server + extension on
  4213): (1) MapLibre box-zoom vs. shift-click — disabled box-zoom. (2) deck.gl
  mjolnir `click` event's `srcEvent.shiftKey` comes through undefined, so the
  Shift modifier is tracked via document keydown/keyup instead.

  Next: T-004 can consume `selection.query()`.

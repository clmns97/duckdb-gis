---
id: T-003
title: Select features on the map (selection set for geoprocessing)
status: open
priority: P1
area: frontend
depends_on: []
branch:
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

- [ ] Clicking a feature on the map selects it; the selection is visually
      highlighted. Clicking empty map area clears (or a clear affordance).
- [ ] Multi-select works (at least shift-click to add/remove).
- [ ] Layers are `pickable` and picking is wired in `MapView` / `deckRender`.
- [ ] Each selected feature resolves to a **stable source identifier**
      (db, schema, table, key) sufficient to build a SQL query against it —
      strategy documented in the Progress log.
- [ ] Selection state is exposed so a tool menu / function can read the current
      selection.
- [ ] Frontend build/lint passes.

## Progress log

<!-- Append newest at the bottom: what changed, what's next, any blocker. -->
- 2026-07-09: Ticket created. Not started. Prerequisite for T-004 (tool menu /
  merge). Key open question: stable feature identifier through the Arrow
  pipeline.
